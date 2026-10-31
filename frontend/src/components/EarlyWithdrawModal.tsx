import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate } from '../contracts/types';
import { formatUnits6, formatBps } from '../utils/formatters';
import { parseContractError } from '../utils/errors';
import { saveCertificateTxInfo } from '../utils/txStorage';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastContext';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface EarlyWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: DepositCertificate | null;
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  onSuccess: () => Promise<void>;
}

type TxStatus = 'idle' | 'waiting_signature' | 'confirming' | 'success';

export const EarlyWithdrawModal: React.FC<EarlyWithdrawModalProps> = ({
  isOpen,
  onClose,
  certificate,
  savingCore,
  vault,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [feeReceiver, setFeeReceiver] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && vault) {
      vault.feeReceiver().then((addr: string) => setFeeReceiver(addr)).catch(() => {});
    }
  }, [isOpen, vault]);

  if (!isOpen || !certificate) return null;

  const principal = certificate.principal;
  const penaltyBps = certificate.penaltyBpsAtOpen;
  const penalty = (principal * penaltyBps) / 10000n;
  const amountToUser = principal - penalty;

  const handleEarlyWithdraw = async () => {
    if (!savingCore) return;
    setTxStatus('waiting_signature');
    setErrorMsg(null);
    setTxHash(null);

    try {
      const tx = await savingCore.earlyWithdraw(certificate.depositId);
      setTxStatus('confirming');
      setTxHash(tx.hash);

      const receipt = await tx.wait();
      setTxStatus('success');

      saveCertificateTxInfo(certificate.depositId.toString(), {
        settleTxHash: receipt?.hash || tx.hash,
        isEarly: true,
        principalPaid: amountToUser.toString(),
        penaltyDeducted: penalty.toString(),
      });

      addToast(
        'warning',
        `Đã rút trước hạn thành công! Thực nhận: ${formatUnits6(amountToUser)} USDC (phí phạt: ${formatUnits6(penalty)} USDC).`,
        {
          title: 'Rút Sớm Hoàn Tất',
          txHash: receipt?.hash || tx.hash,
        }
      );

      await onSuccess();
      setTimeout(() => {
        setTxStatus('idle');
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Early withdraw failed:', err);
      const parsed = parseContractError(err, { core: savingCore, vault });
      setErrorMsg(parsed);
      setTxStatus('idle');
      addToast('error', parsed, { title: 'Rút Sớm Thất Bại' });
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
      title="Xác Nhận Rút Sớm (Trước Hạn)"
      subtitle={`Sổ tiết kiệm NFT #${certificate.depositId.toString()}`}
      icon={<ShieldAlert className="w-5 h-5 text-rose-400" />}
      maxWidth="md"
    >
      {/* Cảnh báo vi phạm kỳ hạn */}
      <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 space-y-1">
        <div className="flex items-center space-x-1.5 font-bold text-rose-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>Cảnh báo vi phạm kỳ hạn cam kết:</span>
        </div>
        <p>
          Bạn đang yêu cầu rút tiền trước ngày đáo hạn. Bạn sẽ <strong>mất toàn bộ 100% tiền lãi</strong> và chịu phí phạt <strong>{formatBps(penaltyBps)}</strong> khấu trừ trực tiếp vào tiền gốc.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Financial Breakdown Table */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
        <div className="flex justify-between items-center text-slate-300">
          <span>Tiền gốc ban đầu:</span>
          <span className="font-mono font-bold text-white tabular-nums">
            {formatUnits6(principal)} USDC
          </span>
        </div>

        <div className="flex justify-between items-center text-rose-400">
          <span>Phí phạt rút sớm ({formatBps(penaltyBps)}):</span>
          <span className="font-mono font-bold tabular-nums">
            -{formatUnits6(penalty)} USDC
          </span>
        </div>

        <div className="flex justify-between items-center text-slate-400">
          <span>Ví nhận tiền phạt (feeReceiver):</span>
          <span className="font-mono text-[11px] text-slate-300">
            {feeReceiver ? `${feeReceiver.slice(0, 8)}...${feeReceiver.slice(-6)}` : 'Vault Fee Receiver'}
          </span>
        </div>

        <div className="flex justify-between items-center text-slate-500">
          <span>Lãi nhận được:</span>
          <span className="font-mono text-slate-500 tabular-nums">0.00 USDC (Hủy toàn bộ)</span>
        </div>

        <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm">
          <span className="font-bold text-slate-200">Thực nhận về ví cá nhân:</span>
          <span className="font-mono font-black text-emerald-400 tabular-nums">
            {formatUnits6(amountToUser)} USDC
          </span>
        </div>
      </div>

      {/* Buttons */}
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
          variant="danger"
          size="md"
          isLoading={txStatus === 'waiting_signature' || txStatus === 'confirming'}
          loadingText={
            txStatus === 'waiting_signature'
              ? 'Đang chờ ví ký...'
              : 'Đang xác nhận trên chain...'
          }
          disabled={txStatus === 'success'}
          onClick={handleEarlyWithdraw}
          className="flex-1"
          icon={txStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        >
          {txStatus === 'success' ? 'Đã Hoàn Tất' : 'Xác Nhận Rút Sớm'}
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
