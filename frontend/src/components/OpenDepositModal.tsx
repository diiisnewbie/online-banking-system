import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps, formatTimestamp, formatTenorUnit } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { useToast } from './ui/ToastContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import {
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface OpenDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: SavingPlan[];
  initialPlanId?: bigint;
  savingCore: ethers.Contract | null;
  usdc: ethers.Contract | null;
  account: string | null;
  currentSimulatedTime?: bigint;
  timeUnit?: bigint;
  onSuccess: () => Promise<void>;
}

export const OpenDepositModal: React.FC<OpenDepositModalProps> = ({
  isOpen,
  onClose,
  plans,
  initialPlanId,
  savingCore,
  usdc,
  account,
  currentSimulatedTime,
  timeUnit,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<bigint>(initialPlanId ?? 0n);
  const [amountStr, setAmountStr] = useState<string>('1000');
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [userBalance, setUserBalance] = useState<bigint>(0n);

  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cập nhật selectedPlanId nếu có initialPlanId
  useEffect(() => {
    if (initialPlanId !== undefined) {
      setSelectedPlanId(initialPlanId);
    } else if (plans.length > 0 && selectedPlanId === 0n) {
      const firstEnabled = plans.find((p) => p.enabled) || plans[0];
      if (firstEnabled) setSelectedPlanId(firstEnabled.planId);
    }
  }, [initialPlanId, plans]);

  // Kiểm tra allowance và số dư USDC của user
  const checkAllowanceAndBalance = async () => {
    if (!usdc || !savingCore || !account) return;
    try {
      const coreAddress = await savingCore.getAddress();
      const [currentAllowance, bal] = await Promise.all([
        usdc.allowance(account, coreAddress),
        usdc.balanceOf(account),
      ]);
      setAllowance(BigInt(currentAllowance));
      setUserBalance(BigInt(bal));
    } catch (err) {
      console.warn('Lỗi kiểm tra allowance:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      checkAllowanceAndBalance();
    }
  }, [isOpen, usdc, savingCore, account]);

  const currentPlan = plans.find((p) => p.planId === selectedPlanId) || plans[0];

  // Chuyển chuỗi nhập thành BigInt 6 decimals
  let parsedAmount = 0n;
  try {
    if (amountStr && !isNaN(Number(amountStr)) && Number(amountStr) > 0) {
      parsedAmount = ethers.parseUnits(amountStr, 6);
    }
  } catch {
    parsedAmount = 0n;
  }

  // Tính lãi dự kiến và ngày đáo hạn
  const unit = timeUnit || 86400n;
  const tenorSeconds = currentPlan ? currentPlan.tenorDays * unit : 0n;
  const previewInterest = currentPlan
    ? calculatePreviewInterest(parsedAmount, currentPlan.aprBps, tenorSeconds)
    : 0n;

  const nowSec = currentSimulatedTime || BigInt(Math.floor(Date.now() / 1000));
  const estimatedMaturity = nowSec + tenorSeconds;

  // Kiểm tra hạn mức
  let limitError: string | null = null;
  if (currentPlan && parsedAmount > 0n) {
    if (currentPlan.minDeposit > 0n && parsedAmount < currentPlan.minDeposit) {
      limitError = `Số tiền gửi tối thiểu là ${formatUnits6(currentPlan.minDeposit)} USDC`;
    } else if (currentPlan.maxDeposit > 0n && parsedAmount > currentPlan.maxDeposit) {
      limitError = `Số tiền gửi tối đa là ${formatUnits6(currentPlan.maxDeposit)} USDC`;
    } else if (parsedAmount > userBalance) {
      limitError = `Số dư ví không đủ (Bạn chỉ có ${formatUnits6(userBalance)} USDC)`;
    }
  }

  const isApproved = parsedAmount > 0n && allowance >= parsedAmount;

  // Xử lý nút "Max"
  const handleMaxAmount = () => {
    if (userBalance <= 0n) {
      setAmountStr('0');
      return;
    }
    // format balance without scientific notation
    const whole = userBalance / 1_000_000n;
    const fraction = userBalance % 1_000_000n;
    const formatted = `${whole}.${fraction.toString().padStart(6, '0')}`.replace(/\.?0+$/, '');
    setAmountStr(formatted);
  };

  // Xử lý Approve USDC
  const handleApprove = async () => {
    if (!usdc || !savingCore || parsedAmount <= 0n) return;
    setIsApproving(true);
    setErrorMsg(null);
    try {
      const coreAddress = await savingCore.getAddress();
      const tx = await usdc.approve(coreAddress, parsedAmount);
      await tx.wait();
      addToast('success', `Đã cấp quyền chi tiêu ${amountStr} USDC thành công!`, {
        title: 'Approve Thành Công',
        txHash: tx.hash,
      });
      await checkAllowanceAndBalance();
    } catch (err: any) {
      console.error('Approve failed:', err);
      const errText = parseContractError(err, { core: savingCore });
      setErrorMsg(errText);
      addToast('error', errText, { title: 'Approve Thất Bại' });
    } finally {
      setIsApproving(false);
    }
  };

  // Xử lý Mở sổ Deposit
  const handleOpenDeposit = async () => {
    if (!savingCore || !currentPlan || parsedAmount <= 0n || limitError) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const tx = await savingCore.openDeposit(currentPlan.planId, parsedAmount);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Mở sổ tiết kiệm thành công! Chứng chỉ NFT đã được đúc về ví của bạn.`,
        {
          title: 'Giao Dịch Hoàn Tất',
          txHash: receipt?.hash || tx.hash,
        }
      );
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Open deposit failed:', err);
      const errText = parseContractError(err, { core: savingCore });
      setErrorMsg(errText);
      addToast('error', errText, { title: 'Mở Sổ Thất Bại' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mở Sổ Tiết Kiệm Mới"
      subtitle="Đúc chứng chỉ NFT bảo chứng dòng tiền với lãi suất cam kết"
      icon={<ShieldCheck className="w-5 h-5 text-indigo-400" />}
      maxWidth="lg"
    >
      {/* 2-Step Stepper */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
        <div
          className={`flex items-center space-x-2.5 p-2 rounded-lg transition-all ${
            isApproved
              ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300'
              : 'bg-indigo-950/40 border border-indigo-700/60 text-white'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isApproved
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-indigo-600 text-white shadow-sm'
            }`}
          >
            {isApproved ? <CheckCircle2 className="w-4 h-4" /> : '1'}
          </div>
          <div className="text-xs">
            <div className="font-bold">Bước 1: Approve</div>
            <div className="text-[10px] text-slate-400">
              {isApproved ? 'Đã cấp quyền' : 'Cấp quyền USDC'}
            </div>
          </div>
        </div>

        <div
          className={`flex items-center space-x-2.5 p-2 rounded-lg transition-all ${
            isApproved
              ? 'bg-indigo-950/40 border border-indigo-700/60 text-white'
              : 'bg-slate-900 border border-slate-800 text-slate-500'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isApproved ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400'
            }`}
          >
            2
          </div>
          <div className="text-xs">
            <div className="font-bold">Bước 2: Mở Sổ</div>
            <div className="text-[10px] text-slate-400">Ký giao dịch đúc NFT</div>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {errorMsg && (
        <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Chọn gói tiết kiệm */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Chọn Gói Tiết Kiệm:</span>
          <span className="text-[11px] text-slate-400 font-normal">
            Lãi suất Snapshot APR cố định
          </span>
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {plans
            .filter((p) => p.enabled)
            .map((p) => {
              const isSelected = selectedPlanId === p.planId;
              return (
                <button
                  key={p.planId.toString()}
                  type="button"
                  onClick={() => setSelectedPlanId(p.planId)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/70 border-indigo-500 shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-center text-[11px] font-mono font-semibold text-slate-400 mb-1">
                    <span>Gói #{p.planId.toString()}</span>
                    {isSelected && <Sparkles className="w-3 h-3 text-indigo-400" />}
                  </div>
                  <div className="text-white text-base font-extrabold tabular-nums">
                    {formatTenorUnit(p.tenorDays, unit)}
                  </div>
                  <div className="text-xs font-bold text-emerald-400 tabular-nums mt-0.5">
                    {formatBps(p.aprBps)}/năm
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Nhập số tiền gửi & nút Max */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <label className="font-semibold text-slate-300">Số Tiền Gửi:</label>
          <div className="text-slate-400 text-xs">
            Khả dụng: <strong className="text-slate-200 tabular-nums">{formatUnits6(userBalance)}</strong> USDC
          </div>
        </div>

        <div className="relative flex items-center">
          <input
            type="number"
            min="0"
            step="any"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="1000"
            className="w-full bg-slate-950/80 border border-slate-700 rounded-xl pl-4 pr-24 py-3 text-white font-mono text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition tabular-nums"
          />
          <div className="absolute right-2 flex items-center space-x-1.5">
            <button
              type="button"
              onClick={handleMaxAmount}
              className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 text-[11px] font-bold uppercase transition"
            >
              Max
            </button>
            <span className="text-xs font-bold text-slate-400 pr-1">USDC</span>
          </div>
        </div>

        {/* Báo lỗi hạn mức ngay dưới ô nhập */}
        {limitError && (
          <p className="text-rose-400 text-xs font-medium pt-0.5 flex items-center space-x-1">
            <span>• {limitError}</span>
          </p>
        )}
      </div>

      {/* Live Financial Preview Panel */}
      {currentPlan && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            <span>Thông Số Cam Kết Hợp Đồng (Live Preview)</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 text-[11px]">Snapshot APR:</span>
              <div className="text-sm font-extrabold text-emerald-400 tabular-nums mt-0.5">
                {formatBps(currentPlan.aprBps)}
              </div>
            </div>

            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-slate-400 text-[11px]">Phạt rút sớm (Snapshot):</span>
              <div className="text-sm font-extrabold text-amber-400 tabular-nums mt-0.5">
                {formatBps(currentPlan.earlyWithdrawPenaltyBps)}
              </div>
            </div>
          </div>

          <div className="space-y-1.5 pt-1 text-slate-300">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Ngày đáo hạn dự kiến:</span>
              </span>
              <span className="font-semibold text-white">
                {formatTimestamp(estimatedMaturity)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Thời gian khóa gốc:</span>
              <span className="font-semibold text-white">{currentPlan.tenorDays.toString()} ngày</span>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-2.5 flex justify-between items-center">
            <span className="font-bold text-slate-200">Tiền lãi dự kiến khi đáo hạn:</span>
            <span className="font-mono text-base font-black text-emerald-400 tabular-nums">
              +{formatUnits6(previewInterest)} USDC
            </span>
          </div>
        </div>
      )}

      {/* Nút hành động Stepper */}
      <div className="pt-2">
        {!isApproved ? (
          <Button
            variant="primary"
            size="lg"
            isLoading={isApproving}
            loadingText="Đang cấp quyền trên ví..."
            disabled={parsedAmount <= 0n || !!limitError}
            onClick={handleApprove}
            className="w-full bg-amber-600 hover:bg-amber-500 border-amber-500/50"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Bước 1: Cấp Quyền Chi Tiêu (Approve USDC)
          </Button>
        ) : (
          <Button
            variant="emerald"
            size="lg"
            isLoading={isSubmitting}
            loadingText="Đang ký giao dịch và đúc NFT..."
            disabled={parsedAmount <= 0n || !!limitError}
            onClick={handleOpenDeposit}
            className="w-full"
            icon={<ShieldCheck className="w-4 h-4" />}
          >
            Bước 2: Xác Nhận Gửi Tiết Kiệm (Open Deposit)
          </Button>
        )}
      </div>
    </Modal>
  );
};
