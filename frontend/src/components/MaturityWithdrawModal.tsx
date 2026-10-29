import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate } from '../contracts/types';
import { formatUnits6, formatTimestamp } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastContext';
import {
  ArrowDownToLine,
  CheckCircle2,
  Coins,
  ShieldCheck,
} from 'lucide-react';

interface MaturityWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: DepositCertificate | null;
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  onSuccess: () => Promise<void>;
}

type TxStatus = 'idle' | 'waiting_signature' | 'confirming' | 'success';

export const MaturityWithdrawModal: React.FC<MaturityWithdrawModalProps> = ({
  isOpen,
  onClose,
  certificate,
  savingCore,
  vault,
  usdc,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  if (!isOpen || !certificate) return null;

  const tenorSeconds = certificate.maturityAt - certificate.startAt;
  const plannedInterest = calculatePreviewInterest(
    certificate.principal,
    certificate.aprBpsAtOpen,
    tenorSeconds
  );
  const totalPayout = certificate.principal + plannedInterest;

  const handleWithdraw = async () => {
    if (!savingCore) return;
    setTxStatus('waiting_signature');
    setErrorMsg(null);
    setTxHash(null);

    try {
      // Pre-check Vault balance để dự đoán C1
      let isVaultShort = false;
      if (vault && usdc) {
        const vAddr = await vault.getAddress();
        const bal = await usdc.balanceOf(vAddr);
        if (BigInt(bal) < plannedInterest) {
          isVaultShort = true;
        }
      }

      const tx = await savingCore.withdrawAtMaturity(certificate.depositId);
      setTxStatus('confirming');
      setTxHash(tx.hash);

      const receipt = await tx.wait();
      setTxStatus('success');

      const successText = isVaultShort
        ? 'Đã rút 100% gốc! Tiền lãi tạm thời được hoãn và ghi nợ C1 để nhận sau.'
        : 'Rút gốc và lãi đúng hạn thành công trọn vẹn!';

      addToast('success', successText, {
        title: 'Tất Toán Thành Công',
        txHash: receipt?.hash || tx.hash,
      });

      await onSuccess();
      setTimeout(() => {
        setTxStatus('idle');
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Maturity withdraw failed:', err);
      const parsed = parseContractError(err, { core: savingCore, vault });
      setErrorMsg(parsed);
      setTxStatus('idle');
      addToast('error', parsed, { title: 'Tất Toán Thất Bại' });
    }
  };

  const handleModalClose = () => {
    if (txStatus === 'waiting_signature' || txStatus === 'confirming') return;
    setTxStatus('idle');
    setErrorMsg(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title="Xác Nhận Tất Toán Đúng Hạn"
      subtitle={`Sổ tiết kiệm NFT #${certificate.depositId.toString()} đã hoàn thành kỳ hạn`}
      icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
      maxWidth="md"
    >
      {/* Error notification */}
      {errorMsg && (
        <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Success notification */}
      {txStatus === 'success' && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>Giao dịch hoàn tất! Tiền đã được chuyển vào ví cá nhân.</span>
        </div>
      )}

      {/* Financial Breakdown Table */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
        <div className="flex justify-between items-center text-slate-300">
          <span>Tiền gốc ban đầu (Principal):</span>
          <span className="font-mono font-bold text-white tabular-nums">
            {formatUnits6(certificate.principal)} USDC
          </span>
        </div>

        <div className="flex justify-between items-center text-emerald-400">
          <span>Tiền lãi cam kết (Snapshot APR):</span>
          <span className="font-mono font-bold tabular-nums">
            +{formatUnits6(plannedInterest)} USDC
          </span>
        </div>

        <div className="flex justify-between items-center text-slate-400 text-[11px] pt-1 border-t border-slate-800/60">
          <span>Ngày đáo hạn:</span>
          <span className="text-slate-300">{formatTimestamp(certificate.maturityAt)}</span>
        </div>

        <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm">
          <span className="font-bold text-slate-200">Tổng thực nhận về ví:</span>
          <span className="font-mono font-black text-emerald-400 tabular-nums">
            {formatUnits6(totalPayout)} USDC
          </span>
        </div>
      </div>

      <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 space-y-1">
        <div className="flex items-center space-x-1.5 font-semibold text-slate-300">
          <Coins className="w-3.5 h-3.5 text-indigo-400" />
          <span>Cơ chế bảo vệ thanh khoản Bonus C1:</span>
        </div>
        <p>
          Ngân hàng cam kết hoàn trả 100% gốc ngay lập tức. Trong tình huống Vault thiếu thanh khoản trả lãi, số tiền lãi sẽ tự động ghi nợ để bạn nhận sau không mất mát.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 pt-2">
        <Button
          variant="secondary"
          size="md"
          disabled={txStatus === 'waiting_signature' || txStatus === 'confirming'}
          onClick={handleModalClose}
          className="flex-1"
        >
          Hủy Bỏ
        </Button>

        <Button
          variant="emerald"
          size="md"
          isLoading={txStatus === 'waiting_signature' || txStatus === 'confirming'}
          loadingText={
            txStatus === 'waiting_signature'
              ? 'Đang chờ ví ký...'
              : 'Đang xác nhận trên chain...'
          }
          disabled={txStatus === 'success'}
          onClick={handleWithdraw}
          className="flex-1"
          icon={txStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <ArrowDownToLine className="w-4 h-4" />}
        >
          {txStatus === 'success' ? 'Đã Hoàn Tất' : 'Xác Nhận Rút Đúng Hạn'}
        </Button>
      </div>

      {txHash && (
        <div className="text-center font-mono text-[10px] text-slate-400 pt-1">
          Tx: {txHash.slice(0, 12)}...{txHash.slice(-8)}
        </div>
      )}
    </Modal>
  );
};
