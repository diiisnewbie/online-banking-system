import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, DepositStatus, SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps, formatTimestamp, formatCountdown } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import {
  Clock,
  Coins,
  ShieldAlert,
  ArrowDownToLine,
  RefreshCw,
  Gift,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface CertificateCardProps {
  certificate: DepositCertificate;
  unpaidInterest: bigint;
  currentSimulatedTime: bigint;
  gracePeriod: bigint;
  plans: SavingPlan[];
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  onOpenEarlyModal: (cert: DepositCertificate) => void;
  onOpenRenewModal: (cert: DepositCertificate) => void;
  onSuccess: () => Promise<void>;
}

export const CertificateCard: React.FC<CertificateCardProps> = ({
  certificate,
  unpaidInterest,
  currentSimulatedTime,
  gracePeriod,
  savingCore,
  vault,
  usdc,
  onOpenEarlyModal,
  onOpenRenewModal,
  onSuccess,
}) => {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isAutoRenewing, setIsAutoRenewing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { depositId, principal, startAt, maturityAt, aprBpsAtOpen, penaltyBpsAtOpen, status } =
    certificate;

  const isActive = status === DepositStatus.Active;
  const isMatured = currentSimulatedTime >= maturityAt;
  const isPastGrace = currentSimulatedTime >= maturityAt + gracePeriod;

  // Tiền lãi toàn kỳ (snapshot)
  const tenorSeconds = maturityAt - startAt;
  const plannedInterest = calculatePreviewInterest(principal, aprBpsAtOpen, tenorSeconds);

  // Rút đúng hạn
  const handleWithdrawAtMaturity = async () => {
    if (!savingCore) return;
    setIsWithdrawing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      // Pre-check Vault balance
      let isVaultShort = false;
      if (vault && usdc) {
        const vAddr = await vault.getAddress();
        const bal = await usdc.balanceOf(vAddr);
        if (BigInt(bal) < plannedInterest) {
          isVaultShort = true;
        }
      }

      const tx = await savingCore.withdrawAtMaturity(depositId);
      await tx.wait();
      if (isVaultShort) {
        setActionSuccess('Đã rút 100% gốc! Tiền lãi đã được ghi nhận nợ để nhận sau (C1).');
      } else {
        setActionSuccess('Rút gốc và lãi đúng hạn thành công!');
      }
      await onSuccess();
    } catch (err: any) {
      console.error('Withdraw failed:', err);
      setActionError(parseContractError(err, { core: savingCore, vault }));
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Claim pending interest (C1)
  const handleClaimPending = async () => {
    if (!savingCore) return;
    setIsClaiming(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const tx = await savingCore.claimPendingInterest(depositId);
      await tx.wait();
      setActionSuccess('Nhận nợ lãi thành công trọn vẹn!');
      await onSuccess();
    } catch (err: any) {
      console.error('Claim failed:', err);
      setActionError(parseContractError(err, { core: savingCore, vault }));
    } finally {
      setIsClaiming(false);
    }
  };

  // Auto-renew (permissionless trigger)
  const handleAutoRenew = async () => {
    if (!savingCore) return;
    setIsAutoRenewing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const tx = await savingCore.autoRenewDeposit(depositId);
      await tx.wait();
      setActionSuccess('Kích hoạt Auto-Renew thành công (Cơ chế Backdate bù lãi)!');
      await onSuccess();
    } catch (err: any) {
      console.error('Auto renew failed:', err);
      setActionError(parseContractError(err, { core: savingCore, vault }));
    } finally {
      setIsAutoRenewing(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition flex flex-col justify-between">
      {/* Top Header: Token ID & Status Badge */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 bg-indigo-950/70 border border-indigo-700/50 rounded-lg text-xs font-mono font-bold text-indigo-300">
              NFT #{depositId.toString()}
            </span>
            <span className="text-xs font-medium text-slate-400">
              Gói #{certificate.planId.toString()}
            </span>
          </div>

          {/* Status Badge */}
          {isActive ? (
            isMatured ? (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Đã Đáo Hạn</span>
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/50 text-amber-300 text-xs font-semibold flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>Đang Gửi</span>
              </span>
            )
          ) : status === DepositStatus.Withdrawn ? (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-medium">
              Đã Tất Toán
            </span>
          ) : status === DepositStatus.ManualRenewed ? (
            <span className="px-2.5 py-0.5 rounded-full bg-purple-950/60 border border-purple-700/50 text-purple-300 text-xs font-medium">
              Đã Tái Tục
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-blue-950/60 border border-blue-700/50 text-blue-300 text-xs font-medium">
              Đã Auto-Renew
            </span>
          )}
        </div>

        {/* Thông báo lỗi / thành công riêng cho card */}
        {actionError && (
          <div className="p-2.5 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-start space-x-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-start space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Financial Information */}
        <div className="grid grid-cols-2 gap-3 bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-xs">
          <div>
            <div className="text-slate-400">Tiền gốc (Principal):</div>
            <div className="text-sm font-extrabold text-white font-mono mt-0.5">
              {formatUnits6(principal)} USDC
            </div>
          </div>
          <div>
            <div className="text-slate-400">Lãi dự kiến (Interest):</div>
            <div className="text-sm font-extrabold text-emerald-400 font-mono mt-0.5">
              +{formatUnits6(plannedInterest)} USDC
            </div>
          </div>
          <div>
            <div className="text-slate-400">Snapshot APR:</div>
            <div className="font-semibold text-indigo-300 mt-0.5">{formatBps(aprBpsAtOpen)}</div>
          </div>
          <div>
            <div className="text-slate-400">Phạt rút sớm:</div>
            <div className="font-semibold text-amber-400 mt-0.5">{formatBps(penaltyBpsAtOpen)}</div>
          </div>
        </div>

        {/* Countdown / Time Details */}
        <div className="space-y-1 text-xs text-slate-400 pt-1">
          <div className="flex justify-between">
            <span>Ngày mở sổ:</span>
            <span className="text-slate-300">{formatTimestamp(startAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Ngày đáo hạn:</span>
            <span className="text-slate-300 font-semibold">{formatTimestamp(maturityAt)}</span>
          </div>
          {isActive && (
            <div className="flex justify-between pt-1 border-t border-slate-800/80">
              <span className="text-slate-300">Thời gian còn lại:</span>
              <span
                className={`font-semibold ${
                  isMatured ? 'text-emerald-400' : 'text-amber-400 font-mono'
                }`}
              >
                {formatCountdown(maturityAt, currentSimulatedTime)}
              </span>
            </div>
          )}
        </div>

        {/* C1 Nợ Lãi (Nếu có unpaidInterest) */}
        {unpaidInterest > 0n && (
          <div className="p-2.5 bg-amber-950/50 border border-amber-800/60 rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-amber-300 font-medium">Lãi hoãn trả (Nợ C1):</span>
              <span className="font-mono font-bold text-amber-200">
                +{formatUnits6(unpaidInterest)} USDC
              </span>
            </div>
            <button
              onClick={handleClaimPending}
              disabled={isClaiming}
              className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs transition flex items-center justify-center space-x-1.5"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang nhận nợ...</span>
                </>
              ) : (
                <>
                  <Gift className="w-3.5 h-3.5" />
                  <span>Nhận Ngay Lãi Nợ (Claim C1)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Action Buttons for Active Certificates */}
      {isActive && (
        <div className="pt-3 border-t border-slate-800 space-y-2">
          {isMatured ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleWithdrawAtMaturity}
                disabled={isWithdrawing}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
              >
                {isWithdrawing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                )}
                <span>Rút Đúng Hạn</span>
              </button>

              <button
                onClick={() => onOpenRenewModal(certificate)}
                className="py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tái Tục (Renew)</span>
              </button>

              {/* Bot Auto-Renew Trigger (nếu qua grace) */}
              {isPastGrace && (
                <button
                  onClick={handleAutoRenew}
                  disabled={isAutoRenewing}
                  className="col-span-2 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                >
                  {isAutoRenewing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Coins className="w-3.5 h-3.5" />
                  )}
                  <span>Kích Hoạt Auto-Renew (Qua Grace)</span>
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => onOpenEarlyModal(certificate)}
              className="w-full py-2 bg-slate-800 hover:bg-rose-950/50 hover:text-rose-300 text-slate-300 border border-slate-700 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Rút Sớm (Chịu Phạt 5%)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

