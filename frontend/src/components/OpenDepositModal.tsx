import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { X, ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface OpenDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: SavingPlan[];
  initialPlanId?: bigint;
  savingCore: ethers.Contract | null;
  usdc: ethers.Contract | null;
  account: string | null;
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
  onSuccess,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<bigint>(initialPlanId ?? 0n);
  const [amountStr, setAmountStr] = useState<string>('1000');
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [userBalance, setUserBalance] = useState<bigint>(0n);

  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cập nhật planId nếu có initialPlanId truyền vào
  useEffect(() => {
    if (initialPlanId !== undefined) {
      setSelectedPlanId(initialPlanId);
    }
  }, [initialPlanId]);

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
      setSuccessMsg(null);
      checkAllowanceAndBalance();
    }
  }, [isOpen, usdc, savingCore, account]);

  if (!isOpen) return null;

  const currentPlan = plans.find((p) => p.planId === selectedPlanId) || plans[0];

  // Tính số token theo 6 decimals
  let parsedAmount = 0n;
  try {
    if (amountStr && !isNaN(Number(amountStr)) && Number(amountStr) > 0) {
      parsedAmount = ethers.parseUnits(amountStr, 6);
    }
  } catch {
    parsedAmount = 0n;
  }

  // Tính lãi dự kiến
  const tenorSeconds = currentPlan ? currentPlan.tenorDays * 86400n : 0n;
  const previewInterest = currentPlan
    ? calculatePreviewInterest(parsedAmount, currentPlan.aprBps, tenorSeconds)
    : 0n;

  // Kiểm tra hạn mức
  let limitError: string | null = null;
  if (currentPlan && parsedAmount > 0n) {
    if (currentPlan.minDeposit > 0n && parsedAmount < currentPlan.minDeposit) {
      limitError = `Số tiền gửi tối thiểu là ${formatUnits6(currentPlan.minDeposit)} USDC`;
    } else if (currentPlan.maxDeposit > 0n && parsedAmount > currentPlan.maxDeposit) {
      limitError = `Số tiền gửi tối đa là ${formatUnits6(currentPlan.maxDeposit)} USDC`;
    } else if (parsedAmount > userBalance) {
      limitError = `Số dư ví không đủ (Bạn có ${formatUnits6(userBalance)} USDC)`;
    }
  }

  const needsApproval = parsedAmount > 0n && allowance < parsedAmount;

  // Xử lý Approve
  const handleApprove = async () => {
    if (!usdc || !savingCore || parsedAmount <= 0n) return;
    setIsApproving(true);
    setErrorMsg(null);
    try {
      const coreAddress = await savingCore.getAddress();
      const tx = await usdc.approve(coreAddress, parsedAmount);
      await tx.wait();
      await checkAllowanceAndBalance();
    } catch (err: any) {
      console.error('Approve failed:', err);
      setErrorMsg(parseContractError(err, { core: savingCore }));
    } finally {
      setIsApproving(false);
    }
  };

  // Xử lý Mở sổ
  const handleOpenDeposit = async () => {
    if (!savingCore || !currentPlan || parsedAmount <= 0n || limitError) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const tx = await savingCore.openDeposit(currentPlan.planId, parsedAmount);
      await tx.wait();
      setSuccessMsg('Mở sổ tiết kiệm thành công! Chứng chỉ NFT đã được đúc về ví của bạn.');
      await onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Open deposit failed:', err);
      setErrorMsg(parseContractError(err, { core: savingCore }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="font-bold text-white text-lg">Mở Sổ Tiết Kiệm Kỳ Hạn</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông báo lỗi / thành công */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Chọn gói tiết kiệm */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Chọn Gói Tiết Kiệm (On-chain):</label>
          <div className="grid grid-cols-3 gap-2">
            {plans
              .filter((p) => p.enabled)
              .map((p) => (
                <button
                  key={p.planId.toString()}
                  type="button"
                  onClick={() => setSelectedPlanId(p.planId)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    selectedPlanId === p.planId
                      ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-bold">Plan #{p.planId.toString()}</div>
                  <div className="text-indigo-400 text-sm font-extrabold">{p.tenorDays.toString()} Ngày</div>
                  <div className="text-[11px] text-emerald-400 font-semibold">{formatBps(p.aprBps)}/năm</div>
                </button>
              ))}
          </div>
        </div>

        {/* Nhập số tiền gửi */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-slate-300">Số Tiền Gửi (USDC):</label>
            <span className="text-slate-400">
              Số dư: <strong className="text-slate-200">{formatUnits6(userBalance)}</strong> USDC
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              min="0"
              step="any"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="1000"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-base focus:outline-none focus:border-indigo-500 transition"
            />
            <span className="absolute right-3.5 top-3 text-xs font-bold text-slate-400">USDC</span>
          </div>
          {limitError && <p className="text-rose-400 text-xs font-medium">{limitError}</p>}
        </div>

        {/* Tóm tắt thông số tài chính */}
        {currentPlan && (
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Lãi suất cam kết (Snapshot APR):</span>
              <span className="font-bold text-emerald-400">{formatBps(currentPlan.aprBps)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Phí phạt rút sớm (Snapshot Penalty):</span>
              <span className="font-bold text-amber-400">{formatBps(currentPlan.earlyWithdrawPenaltyBps)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Kỳ hạn gửi:</span>
              <span className="font-semibold text-white">{currentPlan.tenorDays.toString()} ngày</span>
            </div>
            <div className="border-t border-slate-700 pt-2 flex justify-between items-center">
              <span className="font-semibold text-slate-200">Tiền lãi dự kiến đến hạn:</span>
              <span className="font-mono text-sm font-bold text-indigo-300">
                +{formatUnits6(previewInterest)} USDC
              </span>
            </div>
          </div>
        )}

        {/* Nút hành động Approve 2 bước */}
        <div className="pt-2">
          {needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isApproving || parsedAmount <= 0n || !!limitError}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition flex items-center justify-center space-x-2"
            >
              {isApproving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang cấp quyền (Approve USDC)...</span>
                </>
              ) : (
                <>
                  <span>1. Cấp quyền chi tiêu (Approve USDC)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleOpenDeposit}
              disabled={isSubmitting || parsedAmount <= 0n || !!limitError}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang đúc chứng chỉ NFT...</span>
                </>
              ) : (
                <>
                  <span>Xác Nhận Gửi Tiết Kiệm (Open Deposit)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

