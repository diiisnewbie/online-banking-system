import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { RefreshCw, X, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

interface RenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: DepositCertificate | null;
  plans: SavingPlan[];
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  onSuccess: () => Promise<void>;
}

export const RenewModal: React.FC<RenewModalProps> = ({
  isOpen,
  onClose,
  certificate,
  plans,
  savingCore,
  vault,
  usdc,
  onSuccess,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<bigint>(0n);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (certificate) {
      setSelectedPlanId(certificate.planId);
    }
  }, [certificate]);

  // Kiểm tra số dư Vault on-chain
  const checkVaultLiquidity = async () => {
    if (!usdc || !vault) return;
    try {
      const vAddr = await vault.getAddress();
      const bal = await usdc.balanceOf(vAddr);
      setVaultBalance(BigInt(bal));
    } catch (err) {
      console.warn('Lỗi kiểm tra Vault liquidity:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      checkVaultLiquidity();
    }
  }, [isOpen, usdc, vault]);

  if (!isOpen || !certificate) return null;

  const oldTenorSeconds = certificate.maturityAt - certificate.startAt;
  const oldInterest = calculatePreviewInterest(
    certificate.principal,
    certificate.aprBpsAtOpen,
    oldTenorSeconds
  );
  const newPrincipal = certificate.principal + oldInterest;

  const targetPlan = plans.find((p) => p.planId === selectedPlanId) || plans[0];

  // Kiểm tra thanh khoản Vault
  const isVaultInsufficient = vaultBalance < oldInterest;

  // Kiểm tra hạn mức gói mới
  let limitError: string | null = null;
  if (targetPlan) {
    if (targetPlan.minDeposit > 0n && newPrincipal < targetPlan.minDeposit) {
      limitError = `Gốc mới (${formatUnits6(newPrincipal)} USDC) nhỏ hơn hạn mức tối thiểu (${formatUnits6(targetPlan.minDeposit)} USDC)`;
    } else if (targetPlan.maxDeposit > 0n && newPrincipal > targetPlan.maxDeposit) {
      limitError = `Gốc mới (${formatUnits6(newPrincipal)} USDC) vượt quá hạn mức tối đa (${formatUnits6(targetPlan.maxDeposit)} USDC)`;
    }
  }

  const handleRenew = async () => {
    if (!savingCore || isVaultInsufficient || limitError) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const tx = await savingCore.renewDeposit(certificate.depositId, selectedPlanId);
      await tx.wait();
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Renew failed:', err);
      setErrorMsg(parseContractError(err, { core: savingCore, vault }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <RefreshCw className="w-5 h-5" />
            <h3 className="font-bold text-white text-base">Tái Tục Sổ Tiết Kiệm (Manual Renew)</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Cảnh báo thiếu thanh khoản Vault */}
        {isVaultInsufficient && (
          <div className="p-3 bg-amber-950/50 border border-amber-800/50 rounded-xl text-xs text-amber-300 space-y-1">
            <div className="flex items-center space-x-1.5 font-bold text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Quỹ trả lãi của ngân hàng tạm thời thiếu tiền:</span>
            </div>
            <p>
              Cần {formatUnits6(oldInterest)} USDC để nhập gốc, nhưng Vault chỉ còn {formatUnits6(vaultBalance)} USDC.
              Giao dịch tái tục sẽ bị hoàn tác ([D24]). Bạn nên chọn <strong>Rút đúng hạn</strong> để nhận 100% gốc ngay và hoãn trả lãi theo cơ chế C1.
            </p>
          </div>
        )}

        {/* Tóm tắt lãi nhập gốc */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>Tiền gốc kỳ cũ:</span>
            <span className="font-mono text-white">{formatUnits6(certificate.principal)} USDC</span>
          </div>
          <div className="flex justify-between text-emerald-400">
            <span>Tiền lãi kỳ cũ (Chuyển từ Vault sang):</span>
            <span className="font-mono font-bold">+{formatUnits6(oldInterest)} USDC</span>
          </div>
          <div className="border-t border-slate-700 pt-2 flex justify-between items-center text-sm">
            <span className="font-bold text-slate-200">Vốn gốc kỳ mới (Compound):</span>
            <span className="font-mono font-extrabold text-indigo-300">
              {formatUnits6(newPrincipal)} USDC
            </span>
          </div>
        </div>

        {/* Chọn gói mới */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Chọn Gói Cho Kỳ Tiếp Theo:</label>
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
                      ? 'bg-indigo-950/60 border-indigo-500 text-white'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div className="text-xs font-bold">Plan #{p.planId.toString()}</div>
                  <div className="text-indigo-400 text-sm font-extrabold">{p.tenorDays.toString()} Ngày</div>
                  <div className="text-[11px] text-emerald-400 font-semibold">{formatBps(p.aprBps)}/năm</div>
                </button>
              ))}
          </div>
          {limitError && (
            <div className="flex items-center space-x-1.5 text-rose-400 text-xs mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{limitError}</span>
            </div>
          )}
        </div>

        <div className="flex space-x-3 pt-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Đóng
          </button>
          <button
            onClick={handleRenew}
            disabled={isSubmitting || isVaultInsufficient || !!limitError}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý tái tục...</span>
              </>
            ) : (
              <span>Xác Nhận Tái Tục</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

