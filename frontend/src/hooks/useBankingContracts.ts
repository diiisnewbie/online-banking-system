import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { SAVING_CORE_ADDRESS } from '../contracts/addresses';
import SavingCoreAbi from '../contracts/abis/SavingCore.json';
import VaultManagerAbi from '../contracts/abis/VaultManager.json';
import MockUSDCAbi from '../contracts/abis/MockUSDC.json';

export function useBankingContracts(
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider | null,
  signer: ethers.JsonRpcSigner | null
) {
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [usdcAddress, setUsdcAddress] = useState<string | null>(null);

  const [savingCore, setSavingCore] = useState<ethers.Contract | null>(null);
  const [vault, setVault] = useState<ethers.Contract | null>(null);
  const [usdc, setUsdc] = useState<ethers.Contract | null>(null);

  useEffect(() => {
    if (!SAVING_CORE_ADDRESS || SAVING_CORE_ADDRESS === ethers.ZeroAddress) {
      return;
    }
    const runner = signer || provider;
    if (!runner) return;

    try {
      const coreInstance = new ethers.Contract(SAVING_CORE_ADDRESS, SavingCoreAbi, runner);
      setSavingCore(coreInstance);

      // Query immutable vault and usdc getters from SavingCore
      coreInstance
        .vault()
        .then((vAddr: string) => {
          setVaultAddress(vAddr);
          if (vAddr && vAddr !== ethers.ZeroAddress) {
            setVault(new ethers.Contract(vAddr, VaultManagerAbi, runner));
          }
        })
        .catch((err: any) => console.warn('Could not query core.vault():', err));

      coreInstance
        .usdc()
        .then((uAddr: string) => {
          setUsdcAddress(uAddr);
          if (uAddr && uAddr !== ethers.ZeroAddress) {
            setUsdc(new ethers.Contract(uAddr, MockUSDCAbi, runner));
          }
        })
        .catch((err: any) => console.warn('Could not query core.usdc():', err));
    } catch (err) {
      console.error('Error creating contract instances:', err);
    }
  }, [provider, signer]);

  return {
    savingCore,
    vault,
    usdc,
    savingCoreAddress: SAVING_CORE_ADDRESS,
    vaultAddress,
    usdcAddress,
  };
}
