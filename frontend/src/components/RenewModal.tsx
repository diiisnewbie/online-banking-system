import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps, formatTimestamp, formatTenorUnit } from '../utils/formatters';
import { calculatePreviewInterest } from '../utils/interest';
import { parseContractError } from '../utils/errors';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useToast } from './ui/ToastContext';
import { RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Calendar } from 'lucide-react';

interface RenewModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: DepositCertificate | null;
  plans: SavingPlan[];
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  currentSimulatedTime?: bigint;
  timeUnit?: bigint;
  onSuccess: () => Promise<void>;
}

type TxStatus = 'idle' | 'waiting_signature' | 'confirming' | 'success';

export const RenewModal: React.FC<RenewModalProps> = ({
  isOpen,
  onClose,
  certificate,
  plans,
  savingCore,
  vault,
  usdc,
  currentSimulatedTime,
  timeUnit,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<bigint>(0n);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

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
      setTxStatus('idle');
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

  // Ngày đáo hạn mới ước tính
  const unit = timeUnit || 86400n;
  const nowSec = currentSimulatedTime || BigInt(Math.floor(Date.now() / 1000));
  const newTenorSeconds = targetPlan ? targetPlan.tenorDays * unit : 0n;
  const newMaturityAt = nowSec + newTenorSeconds;

  // Kiểm tra thanh khoản Vault
  const isVaultInsufficient = vaultBalance < oldInterest;

  // Kiểm tra hạn mức gói mới
  let limitError: string | null = null;
  if (targetPlan) {
    if (targetPlan.minDeposit > 0n && newPrincipal < targetPlan.minDeposit) {
      limitError = `Gốc mới (${formatUnits6(newPrincipal)} USDC) nhỏ hơn mức tối thiểu (${formatUnits6(targetPlan.minDeposit)} USDC)`;
    } else if (targetPlan.maxDeposit > 0n && newPrincipal > targetPlan.maxDeposit) {
      limitError = `Gốc mới (${formatUnits6(newPrincipal)} USDC) vượt mức tối đa (${formatUnits6(targetPlan.maxDeposit)} USDC)`;
    }
  }

  const handleRenew = async () => {
    if (!savingCore || isVaultInsufficient || limitError) return;
    setTxStatus('waiting_signature');
    setErrorMsg(null);
    setTxHash(null);

    try {
      const tx = await savingCore.renewDeposit(certificate.depositId, selectedPlanId);
      setTxStatus('confirming');
      setTxHash(tx.hash);

      const receipt = await tx.wait();
      setTxStatus('success');

      addToast(
        'success',
        `Tái tục thành công! Sổ mới đã được tạo với gốc mới ${formatUnits6(newPrincipal)} USDC (đã nhập lãi kép).`,
        {
          title: 'Tái Tục Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );

      await onSuccess();
      setTimeout(() => {
        setTxStatus('idle');
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Renew failed:', err);
      const parsed = parseContractError(err, { core: savingCore, vault });
      setErrorMsg(parsed);
      setTxStatus('idle');
      addToast('error', parsed, { title: 'Tái Tục Thất Bại' });
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
      title="Tái Tục Sổ Tiết Kiệm (Manual Renew)"
      subtitle={`Nhập lãi vào vốn gốc và gia hạn kỳ hạn mới cho NFT #${certificate.depositId.toString()}`}
      icon={<RefreshCw className="w-5 h-5 text-indigo-400" />}
      maxWidth="lg"
    >
      {errorMsg && (
        <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Cảnh báo thiếu thanh khoản Vault */}
      {isVaultInsufficient && (
        <div className="p-3 bg-amber-950/50 border border-amber-800/50 rounded-xl text-xs text-amber-300 space-y-1">
          <div className="flex items-center space-x-1.5 font-bold text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Quỹ trả lãi Vault hiện không đủ tiền nhập lãi:</span>
          </div>
          <p>
            Cần {formatUnits6(oldInterest)} USDC để nhập gốc, nhưng Vault chỉ còn {formatUnits6(vaultBalance)} USDC. Giao dịch tái tục sẽ bị hoàn tác. Bạn nên chọn <strong>Rút đúng hạn</strong> để nhận 100% gốc ngay và hoãn trả lãi theo cơ chế C1.
          </p>
        </div>
      )}

      {/* Financial Summary */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
        <div className="flex justify-between items-center text-slate-300">
          <span>Tiền gốc kỳ cũ:</span>
          <span className="font-mono text-white tabular-nums">{formatUnits6(certificate.principal)} USDC</span>
        </div>

        <div className="flex justify-between items-center text-emerald-400">
          <span>Tiền lãi kỳ cũ (Chuyển từ Vault sang):</span>
          <span className="font-mono font-bold tabular-nums">+{formatUnits6(oldInterest)} USDC</span>
        </div>

        <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm">
          <span className="font-bold text-slate-200">Vốn gốc kỳ mới (Compound):</span>
          <span className="font-mono font-black text-indigo-300 tabular-nums">
            {formatUnits6(newPrincipal)} USDC
          </span>
        </div>

        {targetPlan && (
          <div className="border-t border-slate-800/80 pt-2 space-y-1.5 text-slate-400 text-[11px]">
            <div className="flex justify-between items-center">
              <span>Gói mới được chọn:</span>
              <span className="font-semibold text-white">
                Gói #{targetPlan.planId.toString()} ({targetPlan.tenorDays.toString()} ngày - {formatBps(targetPlan.aprBps)})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Ngày đáo hạn mới dự kiến:</span>
              </span>
              <span className="font-semibold text-slate-200">
                {formatTimestamp(newMaturityAt)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Chọn gói mới */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-300">Chọn Gói Cho Kỳ Tiếp Theo:</label>
        <div className="grid grid-cols-3 gap-2">
          {plans
            .filter((p) => p.enabled)
            .map((p) => {
              const isSelected = selectedPlanId === p.planId;
              return (
                <button
                  key={p.planId.toString()}
                  type="button"
                  onClick={() => setSelectedPlanId(p.planId)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    isSelected
                      ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] font-mono text-slate-400">Gói #{p.planId.toString()}</div>
                  <div className="text-indigo-400 text-sm font-black tabular-nums">
                    {formatTenorUnit(p.tenorDays, unit)}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-bold tabular-nums">{formatBps(p.aprBps)}/năm</div>
                </button>
              );
            })}
        </div>
        {limitError && (
          <div className="flex items-center space-x-1.5 text-rose-400 text-xs mt-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{limitError}</span>
          </div>
        )}
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
          Đóng
        </Button>

        <Button
          variant="primary"
          size="md"
          isLoading={txStatus === 'waiting_signature' || txStatus === 'confirming'}
          loadingText={
            txStatus === 'waiting_signature'
              ? 'Đang chờ ví ký...'
              : 'Đang xác nhận tái tục...'
          }
          disabled={txStatus === 'success' || isVaultInsufficient || !!limitError}
          onClick={handleRenew}
          className="flex-1"
          icon={txStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
        >
          {txStatus === 'success' ? 'Đã Tái Tục' : 'Xác Nhận Tái Tục'}
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
