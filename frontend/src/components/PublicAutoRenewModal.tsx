import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastContext';
import { formatUnits6, formatTimestamp, shortenHash } from '../utils/formatters';
import { parseContractError } from '../utils/errors';
import { saveCertificateTxInfo } from '../utils/txStorage';
import {
  Bot,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  User,
} from 'lucide-react';

interface PublicAutoRenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  currentSimulatedTime: bigint;
  gracePeriod: bigint;
  onSuccess: () => Promise<void>;
}

export const PublicAutoRenewModal: React.FC<PublicAutoRenewModalProps> = ({
  isOpen,
  onClose,
  savingCore,
  vault,
  currentSimulatedTime,
  gracePeriod,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [depositIdStr, setDepositIdStr] = useState<string>('1');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [certInfo, setCertInfo] = useState<{
    depositId: bigint;
    owner: string;
    principal: bigint;
    maturityAt: bigint;
    status: number;
    planGrace: bigint;
    isPastGrace: boolean;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLookup = async (idToQuery: string) => {
    if (!savingCore || !idToQuery.trim()) return;
    setIsSearching(true);
    setErrorMsg(null);
    setCertInfo(null);

    try {
      const dId = BigInt(idToQuery.trim());
      const rawCert = await savingCore.getCertificate(dId);
      const owner = await savingCore.ownerOf(dId);
      const planGraceRaw = await savingCore.getPlanGracePeriod(rawCert.planId).catch(() => gracePeriod);
      const planGrace = BigInt(planGraceRaw);

      const maturityAt = BigInt(rawCert.maturityAt);
      const isPastGrace = currentSimulatedTime >= maturityAt + planGrace;

      setCertInfo({
        depositId: dId,
        owner,
        principal: BigInt(rawCert.principal),
        maturityAt,
        status: Number(rawCert.status),
        planGrace,
        isPastGrace,
      });
    } catch (err: any) {
      console.warn('Lookup cert failed:', err);
      setErrorMsg('Không tìm thấy chứng chỉ tiền gửi với Token ID này hoặc sổ không tồn tại.');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (isOpen && depositIdStr) {
      handleLookup(depositIdStr);
    }
  }, [isOpen]);

  const handleExecuteAutoRenew = async () => {
    if (!savingCore || !certInfo) return;
    setIsExecuting(true);
    setErrorMsg(null);

    try {
      const tx = await savingCore.autoRenewDeposit(certInfo.depositId);
      const receipt = await tx.wait();

      let nextDepositIdStr: string | undefined;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = savingCore.interface.parseLog(log);
            if (parsed && parsed.name === 'Renewed') {
              nextDepositIdStr = parsed.args.newDepositId.toString();
              break;
            }
          } catch {
            // ignore
          }
        }
      }

      saveCertificateTxInfo(certInfo.depositId.toString(), {
        settleTxHash: receipt?.hash || tx.hash,
        renewedToId: nextDepositIdStr,
      });

      addToast(
        'success',
        `Kích hoạt Auto-Renew thành công cho sổ #${certInfo.depositId.toString()}! NFT mới đã được đúc trả về ví chủ sở hữu (${shortenHash(certInfo.owner)}).`,
        {
          title: 'Permissionless Keeper Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );

      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Auto renew failed:', err);
      const parsed = parseContractError(err, { core: savingCore, vault });
      setErrorMsg(parsed);
      addToast('error', parsed, { title: 'Auto-Renew Thất Bại' });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Public Auto-Renew (Keeper Tool)"
      subtitle="Bất kỳ ví nào (hoặc Bot Keeper) cũng có quyền gọi tái tục sổ đã hết ân hạn."
      icon={<Bot className="w-5 h-5 text-sky-400" />}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Hướng dẫn tính năng */}
        <div className="p-3 bg-sky-950/40 border border-sky-800/50 rounded-xl text-xs text-sky-200 leading-relaxed space-y-1">
          <div className="font-bold flex items-center space-x-1.5 text-white">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            <span>Cơ chế Permissionless Keeper (Bất kỳ ai cũng gọi được):</span>
          </div>
          <p className="text-[11px] text-slate-300">
            Smart contract cho phép bất kỳ ai (kể cả ví người lạ hoặc bot ngoài) kích hoạt hàm <code className="font-mono text-sky-300">autoRenewDeposit</code> khi sổ đã qua 3 ngày ân hạn. Tiền gốc và lãi kép sẽ được đúc trả <strong>100% về ví của chủ sổ ban đầu</strong>, người gọi chỉ đóng vai trò người kích hoạt.
          </p>
        </div>

        {/* Input tra cứu Deposit ID */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Nhập Token ID của Sổ Cần Kích Hoạt:</label>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={depositIdStr}
              onChange={(e) => setDepositIdStr(e.target.value)}
              placeholder="Ví dụ: 1, 2, 3..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-sm focus:outline-none focus:border-sky-500"
            />
            <Button
              variant="secondary"
              size="md"
              isLoading={isSearching}
              onClick={() => handleLookup(depositIdStr)}
              icon={<Search className="w-3.5 h-3.5" />}
            >
              Tra Cứu
            </Button>
          </div>
        </div>

        {/* Thông báo lỗi tra cứu nếu có */}
        {errorMsg && (
          <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Kết quả tra cứu sổ */}
        {certInfo && (
          <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="font-bold text-white font-mono text-sm">NFT #{certInfo.depositId.toString()}</span>
              <span
                className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                  certInfo.status === 0
                    ? certInfo.isPastGrace
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {certInfo.status === 0
                  ? certInfo.isPastGrace
                    ? 'Đủ điều kiện Auto-Renew'
                    : 'Đang trong Ân hạn (Chưa cho phép Auto)'
                  : 'Sổ đã đóng (Không hoạt động)'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400 flex items-center space-x-1">
                  <User className="w-3 h-3 text-slate-500" />
                  <span>Chủ sở hữu (Owner):</span>
                </span>
                <div className="font-mono font-bold text-sky-300 mt-0.5" title={certInfo.owner}>
                  {shortenHash(certInfo.owner, 6, 4)}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Tiền gốc:</span>
                <div className="font-mono font-bold text-white mt-0.5">
                  {formatUnits6(certInfo.principal)} USDC
                </div>
              </div>

              <div>
                <span className="text-slate-400 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>Mốc đáo hạn:</span>
                </span>
                <div className="font-mono text-slate-200 mt-0.5">
                  {formatTimestamp(certInfo.maturityAt)}
                </div>
              </div>

              <div>
                <span className="text-slate-400">Thời gian ân hạn:</span>
                <div className="font-mono text-slate-200 mt-0.5">
                  {certInfo.planGrace.toString()} giây (~{Math.round(Number(certInfo.planGrace) / 86400)} ngày)
                </div>
              </div>
            </div>

            {/* Đánh giá điều kiện thực thi */}
            {certInfo.status !== 0 ? (
              <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-[11px]">
                Sổ này đã được tất toán hoặc tái tục trước đó. Không thể auto-renew thêm.
              </div>
            ) : !certInfo.isPastGrace ? (
              <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-[11px] space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Chưa hết thời gian ân hạn 3 ngày:</span>
                </div>
                <p className="text-slate-300">
                  Trong thời gian ân hạn, chỉ có chủ sổ (<span className="font-mono text-amber-200">{shortenHash(certInfo.owner)}</span>) mới có quyền rút tiền hoặc tái tục. Ví người ngoài không được phép can thiệp để bảo vệ quyền tự quyết của khách hàng.
                </p>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-emerald-300 text-[11px] space-y-1">
                <div className="font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Đã vượt qua ân hạn — Sẵn sàng Auto-Renew:</span>
                </div>
                <p className="text-slate-300">
                  Ví hiện tại của bạn có thể bấm nút dưới đây để chi trả phí gas và kích hoạt gia hạn cho sổ này. NFT mới sẽ được đúc trực tiếp về ví của chủ sổ ban đầu.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Nút hành động thực thi */}
        <div className="pt-2 flex justify-end space-x-2">
          <Button variant="secondary" size="md" onClick={onClose} disabled={isExecuting}>
            Đóng
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isExecuting}
            disabled={!certInfo || certInfo.status !== 0 || !certInfo.isPastGrace}
            onClick={handleExecuteAutoRenew}
            className="bg-sky-600 hover:bg-sky-500 border-sky-500/50"
            icon={<Bot className="w-4 h-4" />}
          >
            Kích Hoạt Auto-Renew Cho Sổ Này
          </Button>
        </div>
      </div>
    </Modal>
  );
};
