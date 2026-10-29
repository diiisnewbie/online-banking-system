import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { Coins } from 'lucide-react';
import { formatUnits6 } from '../utils/formatters';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useToast } from './ui/ToastContext';

interface FaucetProps {
  account: string | null;
  usdcContract: ethers.Contract | null;
  balance?: bigint | null;
  onMintSuccess?: () => Promise<void>;
}

export const Faucet: React.FC<FaucetProps> = ({ account, usdcContract, balance, onMintSuccess }) => {
  const { addToast } = useToast();
  const [localBalance, setLocalBalance] = useState<bigint | null>(null);
  const [isMinting, setIsMinting] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!account || !usdcContract) return;
    try {
      const bal = await usdcContract.balanceOf(account);
      setLocalBalance(BigInt(bal));
    } catch (err) {
      console.warn('Lỗi đọc số dư USDC:', err);
    }
  }, [account, usdcContract]);

  useEffect(() => {
    if (balance === undefined) {
      fetchBalance();
    }
  }, [fetchBalance, balance]);

  const effectiveBalance = balance !== undefined ? balance : localBalance;

  const handleMint = async () => {
    if (!account || !usdcContract) return;
    setIsMinting(true);
    try {
      const tx = await usdcContract.mint(account, 1_000_000_000n); // 1,000 USDC
      const receipt = await tx.wait();
      addToast(
        'success',
        'Đã nhận 1,000 USDC Test vào ví thành công!',
        {
          title: 'Faucet Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );
      if (onMintSuccess) {
        await onMintSuccess();
      } else {
        await fetchBalance();
      }
    } catch (err: any) {
      console.error('Faucet mint failed:', err);
      addToast('error', 'Lỗi khi mint USDC test: ' + (err?.reason || err?.message), {
        title: 'Faucet Thất Bại',
      });
    } finally {
      setIsMinting(false);
    }
  };

  if (!account) return null;

  return (
    <Card className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 border-slate-800/80">
      <div className="flex items-center space-x-3.5">
        <div className="p-2.5 bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 rounded-xl shrink-0">
          <Coins className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">Số dư ví cá nhân (MockUSDC)</div>
          <div className="text-xl font-black text-white font-mono tabular-nums tracking-tight">
            {effectiveBalance !== null ? `${formatUnits6(effectiveBalance)} USDC` : '--'}
          </div>
        </div>
      </div>

      <div className="w-full sm:w-auto">
        <Button
          variant="emerald"
          size="md"
          isLoading={isMinting}
          loadingText="Đang nhận USDC..."
          disabled={!usdcContract}
          onClick={handleMint}
          className="w-full sm:w-auto"
          icon={<Coins className="w-4 h-4" />}
        >
          Nhận 1,000 USDC Test
        </Button>
      </div>
    </Card>
  );
};
