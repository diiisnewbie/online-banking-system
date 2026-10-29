import React, { useState } from 'react';
import { ethers } from 'ethers';
import { FastForward, Clock, AlertTriangle, Sparkles } from 'lucide-react';
import { formatTimestamp } from '../utils/formatters';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { useToast } from './ui/ToastContext';

interface DevTimeTravelModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number | null;
  currentSimulatedTime?: bigint;
  onSuccess: (newBlockTimestamp?: bigint) => Promise<void>;
}

const LOCAL_RPC_URL = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';

export const DevTimeTravelModal: React.FC<DevTimeTravelModalProps> = ({
  isOpen,
  onClose,
  chainId,
  currentSimulatedTime,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [customDays, setCustomDays] = useState<string>('90');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guard: Only available in DEV and on local chainId 31337
  if (!isOpen || !import.meta.env.DEV || chainId !== 31337) {
    return null;
  }

  const travelTime = async (seconds: number) => {
    setIsSubmitting(true);
    try {
      // Connect to dedicated JsonRpcProvider to avoid MetaMask RPC filtering
      const devProvider = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
      await devProvider.send('evm_increaseTime', [seconds]);
      await devProvider.send('evm_mine', []);

      // Lấy ngay block timestamp mới nhất vừa mine để update UI lập tức
      const latestBlock = await devProvider.getBlock('latest');
      if (latestBlock) {
        await onSuccess(BigInt(latestBlock.timestamp));
      } else {
        await onSuccess();
      }

      const days = (seconds / 86400).toFixed(1);
      addToast('success', `Đã tua nhanh thành công ${days} ngày trên blockchain local!`, {
        title: 'Tua Thời Gian EVM',
      });
      onClose();
    } catch (err: any) {
      console.error('Time travel failed:', err);
      addToast('error', 'Lỗi tua thời gian: ' + (err?.message || 'EVM RPC failed'), {
        title: 'Thao Tác Thất Bại',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center space-x-2">
          <span>Tua Nhanh Thời Gian EVM</span>
          <Badge variant="danger" size="sm">
            DEV ONLY
          </Badge>
        </div>
      }
      subtitle="Mô phỏng bước nhảy thời gian blockchain để kiểm thử đáo hạn & ân hạn"
      icon={<FastForward className="w-5 h-5 text-indigo-400" />}
      maxWidth="md"
    >
      {/* Current Simulated Time Display */}
      <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>Thời gian EVM hiện tại:</span>
        </div>
        <div className="font-mono text-xs font-bold text-white tabular-nums">
          {formatTimestamp(currentSimulatedTime)}
        </div>
      </div>

      {/* Warning info */}
      <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-amber-300">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          Chỉ hoạt động trên node Hardhat (Chain 31337). Công cụ gọi trực tiếp <code>evm_increaseTime</code> và <code>evm_mine</code> qua provider riêng để không phụ thuộc vào bộ đệm của MetaMask.
        </span>
      </div>

      {/* Quick travel buttons */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300">Các mốc tua nhanh thử nghiệm:</label>
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            variant="secondary"
            size="md"
            disabled={isSubmitting}
            onClick={() => travelTime(86400 + 10)}
            className="w-full justify-start text-xs font-normal"
            icon={<Clock className="w-3.5 h-3.5 text-indigo-400" />}
          >
            <span>+1 Ngày (86,400s)</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={isSubmitting}
            onClick={() => travelTime(259200 + 10)}
            className="w-full justify-start text-xs font-normal text-amber-300"
            icon={<Clock className="w-3.5 h-3.5 text-amber-400" />}
          >
            <span>+3 Ngày (Hết Grace)</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={isSubmitting}
            onClick={() => travelTime(30 * 86400 + 10)}
            className="w-full justify-start text-xs font-normal"
            icon={<Clock className="w-3.5 h-3.5 text-indigo-400" />}
          >
            <span>+30 Ngày (Đáo hạn Plan 1)</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            disabled={isSubmitting}
            onClick={() => travelTime(90 * 86400 + 10)}
            className="w-full justify-start text-xs font-normal text-emerald-300"
            icon={<Clock className="w-3.5 h-3.5 text-emerald-400" />}
          >
            <span>+90 Ngày (Đáo hạn Plan 0)</span>
          </Button>

          <Button
            variant="outline"
            size="md"
            disabled={isSubmitting}
            onClick={() => travelTime(100 * 86400 + 10)}
            className="col-span-2 text-indigo-300 border-indigo-700/50 hover:bg-indigo-950/40 text-xs font-normal"
            icon={<Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
          >
            <span>+100 Ngày (Kịch bản Bot trễ TC-14 / Backdate bù lãi)</span>
          </Button>
        </div>
      </div>

      {/* Custom Days Input */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <label className="text-xs font-semibold text-slate-300">Tùy chỉnh số ngày:</label>
        <div className="flex space-x-2">
          <input
            type="number"
            min="1"
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            className="flex-1 bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 tabular-nums"
            placeholder="Nhập số ngày cần tua..."
          />
          <Button
            variant="primary"
            size="md"
            disabled={isSubmitting || !customDays}
            isLoading={isSubmitting}
            onClick={() => {
              const days = parseFloat(customDays);
              if (days > 0) travelTime(Math.round(days * 86400) + 10);
            }}
          >
            Tua Ngay
          </Button>
        </div>
      </div>
    </Modal>
  );
};
