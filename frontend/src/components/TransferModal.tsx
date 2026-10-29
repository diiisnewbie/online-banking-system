import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate } from '../contracts/types';
import { formatUnits6, formatBps, formatTimestamp } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { useToast } from './ui/ToastContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { ArrowRightLeft, UserCheck, AlertTriangle, ShieldCheck, Calendar, Coins } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: DepositCertificate | null;
  savingCore: ethers.Contract | null;
  account: string | null;
  onSuccess: () => Promise<void>;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  certificate,
  savingCore,
  account,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [recipient, setRecipient] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!certificate) return null;

  const { depositId, principal, startAt, maturityAt, aprBpsAtOpen } = certificate;
  const tenorSeconds = maturityAt - startAt;
  const plannedInterest = calculatePreviewInterest(principal, aprBpsAtOpen, tenorSeconds);
  const totalMaturityPayout = principal + plannedInterest;

  const handleTransfer = async () => {
    if (!savingCore || !account) return;
    setErrorMsg(null);

    const trimmed = recipient.trim();
    if (!trimmed) {
      setErrorMsg('Vui lòng nhập địa chỉ ví người nhận.');
      return;
    }
    if (!ethers.isAddress(trimmed)) {
      setErrorMsg('Địa chỉ ví người nhận không đúng định dạng EVM (0x...).');
      return;
    }
    if (account && trimmed.toLowerCase() === account.toLowerCase()) {
      setErrorMsg('Không thể tự chuyển nhượng sổ cho chính ví của bạn.');
      return;
    }

    setIsTransferring(true);
    try {
      const tx = await savingCore.transferFrom(account, trimmed, depositId);
      const receipt = await tx.wait();

      addToast(
        'success',
        `Đã chuyển nhượng thành công Sổ tiết kiệm NFT #${depositId.toString()} sang ví ${trimmed.slice(0, 6)}...${trimmed.slice(-4)}!`,
        {
          title: 'Chuyển Nhượng Sổ Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );

      setRecipient('');
      onClose();
      await onSuccess();
    } catch (err: any) {
      console.error('Transfer certificate failed:', err);
      const errText = parseContractError(err, { core: savingCore });
      setErrorMsg(errText);
      addToast('error', errText, { title: 'Chuyển Nhượng Thất Bại' });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isTransferring) {
          setErrorMsg(null);
          setRecipient('');
          onClose();
        }
      }}
      title={`Chuyển Nhượng Sổ Tiết Kiệm (NFT #${depositId.toString()})`}
      subtitle="Chuyển quyền sở hữu dòng tiền trên thị trường thứ cấp để tránh bị phạt rút trước hạn"
      icon={<ArrowRightLeft className="w-5 h-5 text-indigo-400" />}
      maxWidth="md"
      footer={
        <>
          <Button
            variant="ghost"
            size="md"
            disabled={isTransferring}
            onClick={() => {
              setErrorMsg(null);
              setRecipient('');
              onClose();
            }}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={isTransferring}
            loadingText="Đang ký & chuyển..."
            disabled={!recipient}
            onClick={handleTransfer}
            icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
          >
            Xác Nhận Chuyển Nhượng
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Lợi ích kinh tế của cơ chế Web3 */}
        <div className="p-3.5 bg-indigo-950/40 border border-indigo-700/50 rounded-xl text-xs space-y-1.5 text-indigo-200">
          <div className="font-bold flex items-center space-x-1.5 text-indigo-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Cơ Chế Bán Sổ Tránh Phạt (Secondary Market [Q1]):</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Thay vì phải <strong>rút trước hạn và bị phạt 5%</strong> số tiền gốc, bạn có thể thỏa thuận chuyển giao NFT này cho người mua. Người nhận sẽ trở thành chủ sở hữu on-chain duy nhất và được nhận trọn vẹn vốn gốc cùng lãi suất khi sổ đáo hạn.
          </p>
        </div>

        {/* Thông tin sổ chuyển giao */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Thông Số Giá Trị Của Sổ:</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-400 text-[11px]">Tiền gốc chuyển nhượng:</span>
              <div className="text-sm font-bold text-white tabular-nums mt-0.5">
                {formatUnits6(principal)} USDC
              </div>
            </div>

            <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800/80">
              <span className="text-slate-400 text-[11px]">Lãi toàn kỳ cam kết:</span>
              <div className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                +{formatUnits6(plannedInterest)} USDC ({formatBps(aprBpsAtOpen)})
              </div>
            </div>
          </div>

          <div className="space-y-1 pt-1.5 border-t border-slate-800/80 text-slate-300">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Ngày đáo hạn:</span>
              </span>
              <span className="font-semibold text-white">{formatTimestamp(maturityAt)}</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">Tổng dòng tiền người nhận sẽ hưởng:</span>
              <span className="font-bold text-emerald-300 tabular-nums font-mono">
                {formatUnits6(totalMaturityPayout)} USDC
              </span>
            </div>
          </div>
        </div>

        {/* Ô nhập địa chỉ ví người nhận */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Địa chỉ ví người nhận (Recipient Address):</span>
            <span className="text-[11px] text-slate-400">Chuẩn EVM (0x...)</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="0x... Địa chỉ ví người mua hoặc ví đối tác"
              disabled={isTransferring}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-10 py-2.5 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />
            <div className="absolute right-3 top-2.5 text-slate-500">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-rose-950/60 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center space-x-1.5 mt-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 leading-normal">
          * Sau khi giao dịch hoàn tất, NFT sẽ chuyển hẳn sang ví người nhận. Bạn sẽ không còn quyền tất toán khoản tiền này nữa.
        </p>
      </div>
    </Modal>
  );
};
