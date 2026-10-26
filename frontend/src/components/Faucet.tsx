import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Coins, Loader2 } from 'lucide-react';
import { formatUnits6 } from '../utils/formatters';

interface FaucetProps {
  account: string | null;
  usdcContract: ethers.Contract | null;
}

export const Faucet: React.FC<FaucetProps> = ({ account, usdcContract }) => {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!account || !usdcContract) return;
    try {
      const bal = await usdcContract.balanceOf(account);
      setBalance(BigInt(bal));
    } catch (err) {
      console.warn('Lỗi đọc số dư USDC:', err);
    }
  }, [account, usdcContract]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleMint = async () => {
    if (!account || !usdcContract) return;
    setIsMinting(true);
    setMsg(null);
    try {
      const tx = await usdcContract.mint(account, 1_000_000_000n); // 1,000 USDC
      await tx.wait();
      setMsg('Đã nhận thành công 1,000 USDC!');
      await fetchBalance();
    } catch (err: any) {
      console.error('Faucet mint failed:', err);
      setMsg('Lỗi khi mint USDC test: ' + (err?.reason || err?.message));
    } finally {
      setIsMinting(false);
    }
  };

  if (!account) return null;

  return (
    <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-lg">
          <Coins className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs text-slate-400">Số dư ví cá nhân (MockUSDC)</div>
          <div className="text-lg font-bold text-white font-mono">
            {balance !== null ? `${formatUnits6(balance)} USDC` : '--'}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3 w-full sm:w-auto">
        {msg && <span className="text-xs text-emerald-400 font-medium">{msg}</span>}
        <button
          onClick={handleMint}
          disabled={isMinting || !usdcContract}
          className="w-full sm:w-auto px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-700/30"
        >
          {isMinting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang nhận...</span>
            </>
          ) : (
            <>
              <Coins className="w-3.5 h-3.5" />
              <span>Nhận 1,000 USDC Test</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
