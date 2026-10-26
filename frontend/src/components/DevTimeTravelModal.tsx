import React, { useState } from 'react';
import { ethers } from 'ethers';
import { FastForward, X, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';

interface DevTimeTravelModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number | null;
  onSuccess: () => Promise<void>;
}

const LOCAL_RPC_URL = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';

export const DevTimeTravelModal: React.FC<DevTimeTravelModalProps> = ({
  isOpen,
  onClose,
  chainId,
  onSuccess,
}) => {
  const [customDays, setCustomDays] = useState<string>('90');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Guard: Only available in DEV and on local chainId 31337
  if (!isOpen || !import.meta.env.DEV || chainId !== 31337) {
    return null;
  }

  const travelTime = async (seconds: number) => {
    setIsSubmitting(true);
    setStatusMsg(null);
    try {
      // Connect to dedicated JsonRpcProvider to avoid MetaMask RPC filtering
      const devProvider = new ethers.JsonRpcProvider(LOCAL_RPC_URL);
      await devProvider.send('evm_increaseTime', [seconds]);
      await devProvider.send('evm_mine', []);
      await onSuccess();
      const days = (seconds / 86400).toFixed(1);
      setStatusMsg(`Đã tua nhanh thành công ${days} ngày!`);
      setTimeout(() => {
        setStatusMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Time travel failed:', err);
      setStatusMsg('Lỗi tua thời gian: ' + (err?.message || 'EVM RPC failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl relative space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <FastForward className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">Tua Nhanh Thời Gian (Dev Tool)</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning info */}
        <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-amber-300">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Chỉ khả dụng trong chế độ Development trên Hardhat node. Sử dụng <strong>JsonRpcProvider riêng</strong> gọi trực tiếp <code>evm_increaseTime</code> để không bị MetaMask chặn.
          </span>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/50 rounded-lg text-xs text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Quick travel buttons */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Mốc tua nhanh định sẵn:</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => travelTime(86400)}
              disabled={isSubmitting}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center justify-center space-x-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>+1 Ngày (86,400s)</span>
            </button>
            <button
              onClick={() => travelTime(259200)}
              disabled={isSubmitting}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center justify-center space-x-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>+3 Ngày (Grace)</span>
            </button>
            <button
              onClick={() => travelTime(30 * 86400)}
              disabled={isSubmitting}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center justify-center space-x-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>+30 Ngày (Plan 1)</span>
            </button>
            <button
              onClick={() => travelTime(90 * 86400)}
              disabled={isSubmitting}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center justify-center space-x-1.5"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>+90 Ngày (Plan 0 Đáo hạn)</span>
            </button>
            <button
              onClick={() => travelTime(100 * 86400)}
              disabled={isSubmitting}
              className="col-span-2 p-2.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-200 rounded-lg text-xs font-medium border border-indigo-700/50 transition flex items-center justify-center space-x-1.5"
            >
              <FastForward className="w-3.5 h-3.5 text-indigo-400" />
              <span>+100 Ngày (Kịch bản Bot trễ TC-14 / AR8)</span>
            </button>
          </div>
        </div>

        {/* Custom Days */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-semibold text-slate-300">Tùy chỉnh số ngày:</label>
          <div className="flex space-x-2">
            <input
              type="number"
              min="1"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              placeholder="Nhập số ngày..."
            />
            <button
              onClick={() => {
                const days = parseFloat(customDays);
                if (days > 0) travelTime(Math.round(days * 86400));
              }}
              disabled={isSubmitting || !customDays}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition"
            >
              Tua
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
