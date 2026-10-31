import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, DepositStatus, SavingPlan } from '../contracts/types';
import {
  formatUnits6,
  formatBps,
  formatTimestamp,
  formatCountdown,
  shortenHash,
  getExplorerTxUrl,
} from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { saveCertificateTxInfo } from '../utils/txStorage';
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
  ArrowRightLeft,
  Copy,
  Check,
  ExternalLink,
  Receipt,
  FileCheck2,
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
  onOpenTransferModal?: (cert: DepositCertificate) => void;
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
  onOpenTransferModal,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [isClaiming, setIsClaiming] = useState(false);
  const [isAutoRenewing, setIsAutoRenewing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const {
    depositId,
    planId,
    principal,
    startAt,
    maturityAt,
    aprBpsAtOpen,
    penaltyBpsAtOpen,
    status,
    openTxHash,
    settleTxHash,
    claimTxHash,
    isEarly,
    isDeferred,
    principalPaid,
    interestPaid,
    renewedToDepositId,
  } = certificate;

  const isActive = status === DepositStatus.Active;
  const isMatured = currentSimulatedTime >= maturityAt;
  const isC1Deferred = !isEarly && (Boolean(isDeferred) || unpaidInterest > 0n || (interestPaid !== undefined && interestPaid === 0n));

  // Tên gói tương ứng
  const planInfo = plans.find((p) => p.planId === planId);
  const planGrace = planInfo?.timeUnit && planInfo.timeUnit <= 60n ? 60n : gracePeriod;
  const isPastGrace = currentSimulatedTime >= maturityAt + planGrace;

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

  const planName = planInfo
    ? (planInfo.timeUnit && planInfo.timeUnit <= 60n) || tenorSeconds <= 3600n
      ? `Gói ${planInfo.tenorDays.toString()} Phút`
      : `Gói ${planInfo.tenorDays.toString()} Ngày`
    : `Gói #${planId.toString()}`;

  // Helper copy txHash
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    addToast('info', 'Đã sao chép mã giao dịch vào clipboard!', { title: 'Đã Copy' });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Claim pending interest (C1)
  const handleClaimPending = async () => {
    if (!savingCore) return;
    setIsClaiming(true);
    try {
      const tx = await savingCore.claimPendingInterest(depositId);
      const receipt = await tx.wait();

      saveCertificateTxInfo(depositId.toString(), {
        claimTxHash: receipt?.hash || tx.hash,
      });

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

      saveCertificateTxInfo(depositId.toString(), {
        settleTxHash: receipt?.hash || tx.hash,
      });

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

  // Tính các con số hiển thị kết toán cho sổ đóng
  const calculatedPenalty = (principal * penaltyBpsAtOpen) / 10000n;
  const calculatedEarlyNet = principal > calculatedPenalty ? principal - calculatedPenalty : 0n;
  const actualPrincipalPaid = principalPaid !== undefined ? principalPaid : calculatedEarlyNet;
  const actualInterestPaid = interestPaid !== undefined ? interestPaid : plannedInterest;

  return (
    <Card
      variant={isActive ? 'interactive' : 'flat'}
      className={`p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-200 ${
        !isActive ? 'opacity-85 bg-slate-950/60 border-dashed border-slate-800' : ''
      }`}
    >
      {/* Thanh viền trạng thái trên đầu card */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isActive
            ? isMatured
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
            : isEarly
            ? 'bg-gradient-to-r from-rose-500 to-amber-500'
            : status === DepositStatus.Withdrawn
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
            : 'bg-gradient-to-r from-sky-500 to-indigo-500'
        }`}
      />

      <div className="space-y-4">
        {/* Certificate Header: Token ID, Plan Name, Chi tiết Status Badge */}
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

          {/* Phân loại Badge chi tiết */}
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
            isEarly ? (
              <Badge variant="danger" size="md">
                ⚠️ Rút Trước Hạn (-5%)
              </Badge>
            ) : isC1Deferred ? (
              <Badge variant="warning" size="md">
                ⚡ Nhận Gốc (Hoãn Lãi C1)
              </Badge>
            ) : (
              <Badge variant="success" size="md">
                ✓ Đã Đáo Hạn
              </Badge>
            )
          ) : status === DepositStatus.ManualRenewed ? (
            <Badge variant="info" size="md">
              🔄 Tái Tục Thủ Công
            </Badge>
          ) : (
            <Badge variant="accent" size="md">
              🤖 Auto-Renew (Backdate)
            </Badge>
          )}
        </div>

        {/* ============================================================ */}
        {/* PHẦN 1: BẢNG KẾT TOÁN CHI TIẾT DÀNH CHO SỔ ĐÃ ĐÓNG (HISTORY) */}
        {/* ============================================================ */}
        {!isActive && (
          <div className="space-y-2.5">
            {status === DepositStatus.Withdrawn ? (
              isEarly ? (
                // 1A. KẾT TOÁN RÚT TRƯỚC HẠN
                <div className="p-3 bg-rose-950/30 border border-rose-800/60 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between text-rose-300 font-bold border-b border-rose-900/60 pb-1.5">
                    <span className="flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Biên Lai Rút Trước Hạn</span>
                    </span>
                    <span className="text-[10px] text-rose-400/80 uppercase font-mono">
                      Phạt {formatBps(penaltyBpsAtOpen)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Tiền gốc ban đầu:</span>
                      <div className="font-mono font-bold text-slate-200">
                        {formatUnits6(principal)} USDC
                      </div>
                    </div>
                    <div>
                      <span className="text-rose-400">Khấu trừ phí phạt (5%):</span>
                      <div className="font-mono font-bold text-rose-300">
                        -{formatUnits6(calculatedPenalty)} USDC
                      </div>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-rose-900/40 flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Thực nhận về ví:</span>
                    <span className="font-mono font-black text-rose-200 text-sm">
                      +{formatUnits6(actualPrincipalPaid)} USDC
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 italic">
                    * Tiền phạt {formatUnits6(calculatedPenalty)} USDC đã nộp trực tiếp vào Quỹ feeReceiver.
                  </div>
                </div>
              ) : isC1Deferred ? (
                // 1B. KẾT TOÁN RÚT ĐÚNG HẠN NHƯNG HOÃN TRẢ LÃI C1
                <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-bold border-b border-amber-900/60 pb-1.5">
                    <span className="flex items-center space-x-1">
                      <Receipt className="w-3.5 h-3.5 text-amber-400" />
                      <span>Biên Lai Hoãn Lãi C1 (Principal Safe)</span>
                    </span>
                    <span className="text-[10px] text-amber-400 uppercase font-mono">
                      {unpaidInterest > 0n ? 'Lãi Đang Ghi Nợ' : 'Đã Claim Đủ'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Tiền gốc hoàn trả:</span>
                      <div className="font-mono font-bold text-slate-200">
                        {formatUnits6(principal)} USDC (Đã nhận)
                      </div>
                    </div>
                    <div>
                      <span className="text-amber-400">Lãi ghi nợ C1:</span>
                      <div className="font-mono font-bold text-amber-300">
                        +{formatUnits6(plannedInterest)} USDC
                      </div>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-amber-900/40 text-[11px] space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-300 font-semibold">Tình trạng thanh toán:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {unpaidInterest > 0n ? (
                          <span>Đã nhận 100% gốc — Đang nợ lãi</span>
                        ) : (
                          <span className="text-emerald-400">Đã nhận đủ cả gốc và nợ lãi</span>
                        )}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 italic">
                      * Cơ chế C1: Ngay cả khi Vault cạn quỹ lãi, 100% tiền gốc của bạn vẫn được rút về an toàn, tiền lãi được bảo lưu on-chain.
                    </div>
                  </div>
                </div>
              ) : (
                // 1C. KẾT TOÁN RÚT ĐÚNG HẠN (ĐÁO HẠN HOÀN TOÀN)
                <div className="p-3 bg-emerald-950/30 border border-emerald-800/60 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between text-emerald-300 font-bold border-b border-emerald-900/60 pb-1.5">
                    <span className="flex items-center space-x-1">
                      <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Biên Lai Tất Toán Đáo Hạn</span>
                    </span>
                    <span className="text-[10px] text-emerald-400/80 uppercase font-mono">
                      Nhận Đủ Gốc + Lãi
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Tiền gốc hoàn trả:</span>
                      <div className="font-mono font-bold text-slate-200">
                        {formatUnits6(principal)} USDC
                      </div>
                    </div>
                    <div>
                      <span className="text-emerald-400">Lãi nhận từ Vault:</span>
                      <div className="font-mono font-bold text-emerald-300">
                        +{formatUnits6(actualInterestPaid)} USDC
                      </div>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-emerald-900/40 flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">Tổng tiền thanh toán:</span>
                    <span className="font-mono font-black text-emerald-300 text-sm">
                      +{formatUnits6(principal + actualInterestPaid)} USDC
                    </span>
                  </div>
                </div>
              )
            ) : (
              // 1C. KẾT TOÁN TÁI TỤC / AUTO-RENEW
              <div className="p-3 bg-sky-950/30 border border-sky-800/60 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-sky-300 font-bold border-b border-sky-900/60 pb-1.5">
                  <span className="flex items-center space-x-1">
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {status === DepositStatus.AutoRenewed
                        ? 'Đã Tự Động Gia Hạn (Backdated)'
                        : 'Đã Tái Tục Sang Sổ Mới'}
                    </span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 space-y-1">
                  <div>
                    Tiền lãi kỳ trước (+{formatUnits6(plannedInterest)} USDC) đã tự động nhập vào gốc mới.
                  </div>
                  {renewedToDepositId !== undefined && (
                    <div className="font-semibold text-sky-300 flex items-center space-x-1 pt-0.5">
                      <span>Chuyển tiếp thành:</span>
                      <span className="px-1.5 py-0.5 bg-sky-900/60 rounded font-mono text-white">
                        NFT #{renewedToDepositId.toString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* PHẦN 2: THÔNG SỐ TÀI CHÍNH BAN ĐẦU (ÁP DỤNG CHO CẢ 2 TAB)    */}
        {/* ============================================================ */}
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

        {/* Thanh tiến độ thời gian (Chỉ hiện khi sổ còn Active) */}
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
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isMatured
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-400'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Chi tiết Ngày bắt đầu & Ngày đáo hạn */}
        <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60 space-y-1 text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Ngày gửi:</span>
            </span>
            <span className="text-slate-300 font-mono">{formatTimestamp(startAt)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-400 flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              <span>Ngày đáo hạn:</span>
            </span>
            <span className="text-slate-200 font-semibold font-mono">{formatTimestamp(maturityAt)}</span>
          </div>

          {isActive && (
            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80 text-xs">
              <span className="text-slate-300 font-medium">Thời gian còn lại:</span>
              <span
                className={`font-semibold ${
                  isMatured
                    ? 'text-emerald-400 flex items-center space-x-1'
                    : 'text-amber-400 font-mono tabular-nums'
                }`}
              >
                {isMatured && <Sparkles className="w-3.5 h-3.5" />}
                <span>{formatCountdown(maturityAt, currentSimulatedTime)}</span>
              </span>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* PHẦN 3: KHỐI TX HASH & LINK ETHERSCAN (PHỤC VỤ AUDIT & DEMO) */}
        {/* ============================================================ */}
        <div className="p-2.5 bg-slate-900/70 border border-slate-800/80 rounded-xl space-y-1.5 text-[11px]">
          {/* Tx Mở Sổ */}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center space-x-1">
              <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tx Mở Sổ:</span>
            </span>
            {openTxHash ? (
              <div className="flex items-center space-x-1.5 font-mono">
                <span className="text-slate-300 hover:text-white" title={openTxHash}>
                  {shortenHash(openTxHash, 6, 4)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(openTxHash, `open-${depositId}`)}
                  className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Sao chép TxHash"
                >
                  {copiedKey === `open-${depositId}` ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <a
                  href={getExplorerTxUrl(openTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Xem trên Sepolia Etherscan"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <span className="text-slate-500 font-mono italic text-[10px]">Chưa đồng bộ log</span>
            )}
          </div>

          {/* Tx Tất Toán / Tái Tục (nếu đã kết thúc) */}
          {settleTxHash && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-slate-400 flex items-center space-x-1">
                <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isEarly
                    ? 'Tx Rút Sớm:'
                    : isC1Deferred
                    ? 'Tx Rút Gốc (C1):'
                    : status === DepositStatus.Withdrawn
                    ? 'Tx Đáo Hạn:'
                    : status === DepositStatus.AutoRenewed
                    ? 'Tx Auto-Renew:'
                    : 'Tx Tái Tục:'}
                </span>
              </span>
              <div className="flex items-center space-x-1.5 font-mono">
                <span className="text-slate-300 hover:text-white" title={settleTxHash}>
                  {shortenHash(settleTxHash, 6, 4)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(settleTxHash, `settle-${depositId}`)}
                  className="p-1 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Sao chép TxHash"
                >
                  {copiedKey === `settle-${depositId}` ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <a
                  href={getExplorerTxUrl(settleTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Xem trên Sepolia Etherscan"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Tx Claim Nợ Lãi C1 (nếu có phát sinh claim) */}
          {claimTxHash && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
              <span className="text-slate-400 flex items-center space-x-1">
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                <span>Tx Claim Nợ Lãi (C1):</span>
              </span>
              <div className="flex items-center space-x-1.5 font-mono">
                <span className="text-slate-300 hover:text-white" title={claimTxHash}>
                  {shortenHash(claimTxHash, 6, 4)}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(claimTxHash, `claim-${depositId}`)}
                  className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Sao chép TxHash"
                >
                  {copiedKey === `claim-${depositId}` ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                <a
                  href={getExplorerTxUrl(claimTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition cursor-pointer"
                  title="Xem trên Sepolia Etherscan"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => onOpenEarlyModal(certificate)}
                className="w-full text-rose-300 border-rose-800/50 hover:bg-rose-950/40 hover:border-rose-700"
                icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
              >
                Rút Sớm (-5%)
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  if (onOpenTransferModal) onOpenTransferModal(certificate);
                }}
                className="w-full text-indigo-300 border-indigo-700/60 hover:bg-indigo-950/40"
                icon={<ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />}
              >
                Chuyển Nhượng
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
