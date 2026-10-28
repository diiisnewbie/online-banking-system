import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate } from '../contracts/types';
import { formatUnits6, formatBps } from '../utils/formatters';
import { parseContractError } from '../utils/errors';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface EarlyWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: DepositCertificate | null;
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  onSuccess: () => Promise<void>;
}

export const EarlyWithdrawModal: React.FC<EarlyWithdrawModalProps> = ({
  isOpen,
  onClose,
  certificate,
  savingCore,
  vault,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !certificate) return null;

  const principal = certificate.principal;
  const penaltyBps = certificate.penaltyBpsAtOpen;
  const penalty = (principal * penaltyBps) / 10000n;
  const amountToUser = principal - penalty;

  const handleEarlyWithdraw = async () => {
    if (!savingCore) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const tx = await savingCore.earlyWithdraw(certificate.depositId);
      await tx.wait();
      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Early withdraw failed:', err);
      setErrorMsg(parseContractError(err, { core: savingCore, vault }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-bold text-white text-base">Xác Nhận Rút Sớm (Trước Hạn)</h3>
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

        <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl text-xs text-rose-300 space-y-1">
          <p className="font-semibold text-rose-200">Cảnh báo vi phạm kỳ hạn gửi:</p>
          <p>
            Bạn đang rút trước ngày đáo hạn. Bạn sẽ <strong>mất 100% tiền lãi</strong> và chịu phí phạt{' '}
            <strong>{formatBps(penaltyBps)}</strong> trừ trực tiếp vào tiền gốc.
          </p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3.5 space-y-2.5 text-xs">
          <div className="flex justify-between text-slate-300">
            <span>Tiền gốc ban đầu:</span>
            <span className="font-mono font-bold text-white">{formatUnits6(principal)} USDC</span>
          </div>
          <div className="flex justify-between text-rose-400">
            <span>Phí phạt rút sớm ({formatBps(penaltyBps)}):</span>
            <span className="font-mono font-bold">-{formatUnits6(penalty)} USDC</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Lãi nhận được:</span>
            <span className="font-mono text-slate-400">0.00 USDC (Hủy toàn bộ)</span>
          </div>
          <div className="border-t border-slate-700 pt-2 flex justify-between items-center text-sm">
            <span className="font-bold text-slate-200">Thực nhận về ví:</span>
            <span className="font-mono font-extrabold text-emerald-400">
              {formatUnits6(amountToUser)} USDC
            </span>
          </div>
        </div>

        <div className="flex space-x-3 pt-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Hủy Bỏ
          </button>
          <button
            onClick={handleEarlyWithdraw}
            disabled={isSubmitting}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <span>Xác Nhận Rút Sớm</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

