import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';

const SUPPORTED_CHAIN_IDS = [11155111, 31337];
const TARGET_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111);
const TARGET_CHAIN_HEX = '0x' + TARGET_CHAIN_ID.toString(16);
const LOCAL_RPC_URL = 'http://127.0.0.1:8545';

export function useWeb3() {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);

  // Offset algorithm for EVM time simulation:
  // offset = blockTimestamp - Date.now()/1000
  // simulatedTime = Date.now()/1000 + offset
  const timeOffsetRef = useRef<number>(0);
  const [currentSimulatedTime, setCurrentSimulatedTime] = useState<bigint>(
    BigInt(Math.floor(Date.now() / 1000))
  );

  // Sync block time from chain
  const syncBlockTime = useCallback(async (explicitTimestamp?: bigint) => {
    try {
      if (explicitTimestamp !== undefined) {
        const nowSec = Math.floor(Date.now() / 1000);
        timeOffsetRef.current = Number(explicitTimestamp) - nowSec;
        setCurrentSimulatedTime(explicitTimestamp);
        return;
      }

      // Luôn kết nối trực tiếp với node local qua JsonRpcProvider nếu ở chain 31337
      const rpcUrl =
        chainId === 31337
          ? 'http://127.0.0.1:8545'
          : import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';

      const p = new ethers.JsonRpcProvider(rpcUrl);
      const block = await p.getBlock('latest');
      if (block) {
        const nowSec = Math.floor(Date.now() / 1000);
        timeOffsetRef.current = Number(block.timestamp) - nowSec;
        setCurrentSimulatedTime(BigInt(block.timestamp));
      }
    } catch (err) {
      console.warn('Failed to sync block time:', err);
    }
  }, [chainId]);

  // Tick simulated time every second
  useEffect(() => {
    const timer = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      setCurrentSimulatedTime(BigInt(nowSec + timeOffsetRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize provider and sync initial block time
  useEffect(() => {
    syncBlockTime();
  }, [syncBlockTime]);

  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_HEX }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902 && TARGET_CHAIN_ID === 31337) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: TARGET_CHAIN_HEX,
                chainName: 'Hardhat Localhost',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [LOCAL_RPC_URL],
              },
            ],
          });
        } catch (addError) {
          console.error('Failed to add Hardhat network:', addError);
        }
      }
    }
  };

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError('Không tìm thấy MetaMask. Vui lòng cài đặt ví!');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      if (!SUPPORTED_CHAIN_IDS.includes(currentChainId)) {
        await switchNetwork();
      }

      const accounts = await browserProvider.send('eth_requestAccounts', []);
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        const s = await browserProvider.getSigner();
        setSigner(s);
        setProvider(browserProvider);
        await syncBlockTime();
      }
    } catch (err: any) {
      console.error('Lỗi kết nối ví:', err);
      setError(err?.message || 'Lỗi kết nối ví');
    } finally {
      setIsConnecting(false);
    }
  }, [syncBlockTime]);

  // Listen to MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
      } else {
        setAccount(accounts[0]);
        if (provider) {
          provider.getSigner().then(setSigner).catch(console.error);
        }
      }
    };

    const handleChainChanged = (chainIdHex: string) => {
      const cId = parseInt(chainIdHex, 16);
      setChainId(cId);
      window.location.reload();
    };

    window.ethereum.on?.('accountsChanged', handleAccountsChanged);
    window.ethereum.on?.('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [provider]);

  return {
    account,
    chainId,
    isConnecting,
    error,
    provider,
    signer,
    currentSimulatedTime,
    syncBlockTime,
    connectWallet,
    isCorrectNetwork: chainId === TARGET_CHAIN_ID,
  };
}
