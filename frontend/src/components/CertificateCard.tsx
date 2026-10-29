import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, DepositStatus, SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps, formatTimestamp, formatCountdown } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastContext';
import {
  Clock,
  ArrowDownToLine,
  RefreshCw,
  Gift,
  AlertTriangle,
  Calendar,
  Layers,
  Sparkles,
  Bot,
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
  onOpenMaturityModal?: (cert: DepositCertificate) => void;
  onSuccess: () => Promise<void>;
}

export const CertificateCard: React.FC<CertificateCardProps> = ({
  certificate,
  unpaidInterest,
  currentSimulatedTime,
  gracePeriod,
  plans,
  savingCore,
  vault,
  onOpenEarlyModal,
  onOpenRenewModal,
  onOpenMaturityModal,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isAutoRenewing, setIsAutoRenewing] = useState(false);

  const { depositId, planId, principal, startAt, maturityAt, aprBpsAtOpen, penaltyBpsAtOpen, status } =
    certificate;

  const isActive = status === DepositStatus.Active;
  const isMatured = currentSimulatedTime >= maturityAt;
  const isPastGrace = currentSimulatedTime >= maturityAt + gracePeriod;

  // Tiền lãi toàn kỳ (snapshot)
  const tenorSeconds = maturityAt - startAt;
  const plannedInterest = calculatePreviewInterest(principal, aprBpsAtOpen, tenorSeconds);

  // Tính thanh tiến độ thời gian (Progress bar)
  let progressPercent = 0;
  if (tenorSeconds > 0n) {
    const elapsed = currentSimulatedTime > startAt ? currentSimulatedTime - startAt : 0n;
    progressPercent = Math.min(100, Math.max(0, Math.round((Number(elapsed) * 100) / Number(tenorSeconds))));
  }
  if (isMatured) {
    progressPercent = 100;
  }

  // Tên gói tương ứng
  const planInfo = plans.find((p) => p.planId === planId);
  const planName = planInfo ? `Gói ${planInfo.tenorDays.toString()} Ngày` : `Gói #${planId.toString()}`;

  // Claim pending interest (C1)
  const handleClaimPending = async () => {
    if (!savingCore) return;
    setIsClaiming(true);
    try {
      const tx = await savingCore.claimPendingInterest(depositId);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Nhận nợ lãi thành công trọn vẹn (+${formatUnits6(unpaidInterest)} USDC)!`,
        {
          title: 'Nhận Nợ Lãi C1',
          txHash: receipt?.hash || tx.hash,
        }
      );
      await onSuccess();
    } catch (err: any) {
      console.error('Claim failed:', err);
      const parsed = parseContractError(err, { core: savingCore, vault });
      addToast('error', parsed, { title: 'Nhận Nợ Thất Bại' });
    } finally {
      setIsClaiming(false);
    }
  };

  // Auto-renew (permissionless trigger)
  const handleAutoRenew = async () => {
    if (!savingCore) return;
    setIsAutoRenewing(true);
    try {
      const tx = await savingCore.autoRenewDeposit(depositId);
      const receipt = await tx.wait();
      addToast(
        'info',
        'Kích hoạt Auto-Renew thành công (áp dụng cơ chế Backdate bù lãi chính xác)!',
        {
          title: 'Auto-Renew Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );
      await onSuccess();
    } catch (err: any) {
      console.error('Auto renew failed:', err);
      const parsed = parseContractError(err, { core: savingCore, vault });
      addToast('error', parsed, { title: 'Auto-Renew Thất Bại' });
    } finally {
      setIsAutoRenewing(false);
    }
  };

  return (
    <Card
      variant={isActive ? 'interactive' : 'flat'}
      className={`p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-200 ${
        !isActive ? 'opacity-65 grayscale-[35%] bg-slate-950/40 border-dashed' : ''
      }`}
    >
      {/* Decorative certificate watermark/strip */}
      {isActive && (
        <div
          className={`absolute top-0 left-0 right-0 h-1 ${
            isMatured
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
          }`}
        />
      )}

      <div className="space-y-4">
        {/* Certificate Header: Token ID, Plan Name, Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-1 bg-indigo-950/70 border border-indigo-700/50 rounded-lg text-xs font-mono font-bold text-indigo-300">
                NFT #{depositId.toString()}
              </span>
              <span className="text-xs font-semibold text-white flex items-center space-x-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>{planName}</span>
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-1">
              ERC-721 Deposit Certificate
            </div>
          </div>

          {/* Status Badge */}
          {isActive ? (
            isMatured ? (
              <Badge variant="success" dot size="md">
                Đã Đáo Hạn
              </Badge>
            ) : (
              <Badge variant="warning" size="md">
                <Clock className="w-3 h-3 mr-1 inline" />
                Đang Gửi
              </Badge>
            )
          ) : status === DepositStatus.Withdrawn ? (
            <Badge variant="neutral" size="md">
              Đã Tất Toán
            </Badge>
          ) : status === DepositStatus.ManualRenewed ? (
            <Badge variant="neutral" size="md">
              Đã Tái Tục
            </Badge>
          ) : (
            <Badge variant="info" size="md">
              Đã Auto-Renew
            </Badge>
          )}
        </div>

        {/* Cảnh báo Không Còn Giá Trị Tài Chính nếu đã đóng sổ */}
        {!isActive && (
          <div className="p-2.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-center space-y-0.5">
            <div className="text-[11px] font-black tracking-wider uppercase text-rose-400 flex items-center justify-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Không Còn Giá Trị Tài Chính</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Chứng chỉ NFT này đã rút hết tiền hoặc đã gia hạn sang sổ mới.
            </div>
          </div>
        )}

        {/* Financial Details Table */}
        <div className="grid grid-cols-2 gap-2.5 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 text-xs">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Tiền gốc ban đầu:</div>
            <div className="text-base font-black text-white font-mono mt-0.5 tabular-nums">
              {formatUnits6(principal)} USDC
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400 font-medium">Lãi cam kết (Snapshot):</div>
            <div className="text-base font-black text-emerald-400 font-mono mt-0.5 tabular-nums">
              +{formatUnits6(plannedInterest)} USDC
            </div>
          </div>

          <div className="pt-1 border-t border-slate-800/80">
            <div className="text-[10px] text-slate-400">Snapshot APR:</div>
            <div className="font-bold text-indigo-300 tabular-nums">{formatBps(aprBpsAtOpen)}</div>
          </div>

          <div className="pt-1 border-t border-slate-800/80">
            <div className="text-[10px] text-slate-400">Phạt rút sớm:</div>
            <div className="font-bold text-amber-400 tabular-nums">{formatBps(penaltyBpsAtOpen)}</div>
          </div>
        </div>

        {/* Time Progress Bar */}
        {isActive && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Tiến trình kỳ hạn:</span>
              </span>
              <span className="font-mono font-bold text-slate-300 tabular-nums">
                {progressPercent}%
              </span>
            </div>

            <div className="w-full bg-slate-800/90 rounded-full h-2 overflow-hidden p-0.5 border border-slate-700/50">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isMatured
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Dates & Countdown */}
        <div className="space-y-1 text-xs text-slate-400 pt-1">
          <div className="flex justify-between items-center">
            <span className="flex items-center space-x-1 text-slate-400">
              <Calendar className="w-3 h-3" />
              <span>Ngày mở sổ:</span>
            </span>
            <span className="text-slate-300">{formatTimestamp(startAt)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center space-x-1 text-slate-400">
              <Calendar className="w-3 h-3" />
              <span>Ngày đáo hạn:</span>
            </span>
            <span className="text-slate-200 font-semibold">{formatTimestamp(maturityAt)}</span>
          </div>

          {isActive && (
            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 text-xs">
              <span className="text-slate-300 font-medium">Thời gian còn lại:</span>
              <span
                className={`font-semibold ${
                  isMatured ? 'text-emerald-400 flex items-center space-x-1' : 'text-amber-400 font-mono tabular-nums'
                }`}
              >
                {isMatured && <Sparkles className="w-3.5 h-3.5" />}
                <span>{formatCountdown(maturityAt, currentSimulatedTime)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Bonus C1 Unpaid Interest Banner */}
        {unpaidInterest > 0n && (
          <div className="p-3 bg-amber-950/60 border border-amber-800/70 rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-amber-300 font-bold flex items-center space-x-1">
                <Gift className="w-3.5 h-3.5" />
                <span>Nợ Lãi Chờ Nhận (C1):</span>
              </span>
              <span className="font-mono font-black text-amber-200 tabular-nums">
                +{formatUnits6(unpaidInterest)} USDC
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              isLoading={isClaiming}
              loadingText="Đang nhận nợ..."
              onClick={handleClaimPending}
              className="w-full bg-amber-600 hover:bg-amber-500 border-amber-500/50"
              icon={<Gift className="w-3.5 h-3.5" />}
            >
              Nhận Lãi Nợ Ngay
            </Button>
          </div>
        )}
      </div>

      {/* Action Buttons for Active Certificates */}
      {isActive && (
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          {isMatured ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="emerald"
                size="md"
                onClick={() => {
                  if (onOpenMaturityModal) {
                    onOpenMaturityModal(certificate);
                  }
                }}
                className="w-full"
                icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
              >
                Rút Đúng Hạn
              </Button>

              <Button
                variant="primary"
                size="md"
                onClick={() => onOpenRenewModal(certificate)}
                className="w-full"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Tái Tục
              </Button>

              {/* Bot Auto-Renew Trigger (nếu qua thời gian ân hạn grace period) */}
              {isPastGrace && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isAutoRenewing}
                  loadingText="Đang chạy Auto-Renew..."
                  onClick={handleAutoRenew}
                  className="col-span-2 text-sky-300 border-sky-800/60 hover:bg-sky-950/40"
                  icon={<Bot className="w-3.5 h-3.5 text-sky-400" />}
                >
                  Kích Hoạt Auto-Renew (Đã qua Grace 3 ngày)
                </Button>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={() => onOpenEarlyModal(certificate)}
              className="w-full text-rose-300 border-rose-800/50 hover:bg-rose-950/40 hover:border-rose-700"
              icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
            >
              Rút Trước Hạn (Phạt 5%)
            </Button>
          )}
        </div>
      )}
    </Card>
  );
};
