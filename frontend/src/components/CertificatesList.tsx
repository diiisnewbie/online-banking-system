import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, DepositStatus, SavingPlan } from '../contracts/types';
import { CertificateCard } from './CertificateCard';
import { CardSkeleton } from './ui/Skeleton';
import { Button } from './ui/Button';
import { FolderCheck, History, PlusCircle, AlertTriangle, FastForward, RefreshCw } from 'lucide-react';

interface CertificatesListProps {
  certificates: DepositCertificate[];
  unpaidMap: Record<string, bigint>;
  currentSimulatedTime: bigint;
  gracePeriod: bigint;
  plans: SavingPlan[];
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  isLoading: boolean;
  onOpenEarlyModal: (cert: DepositCertificate) => void;
  onOpenRenewModal: (cert: DepositCertificate) => void;
  onOpenMaturityModal?: (cert: DepositCertificate) => void;
  onOpenTransferModal?: (cert: DepositCertificate) => void;
  onSuccess: () => Promise<void>;
  onOpenDepositModal: () => void;
  onOpenTimeTravel?: () => void;
  onRefreshAll?: () => Promise<void>;
}

export const CertificatesList: React.FC<CertificatesListProps> = ({
  certificates,
  unpaidMap,
  currentSimulatedTime,
  gracePeriod,
  plans,
  savingCore,
  vault,
  usdc,
  isLoading,
  onOpenEarlyModal,
  onOpenRenewModal,
  onOpenMaturityModal,
  onOpenTransferModal,
  onSuccess,
  onOpenDepositModal,
  onOpenTimeTravel,
  onRefreshAll,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    if (onRefreshAll && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefreshAll();
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  const activeCerts = certificates.filter((c) => c.status === DepositStatus.Active);
  const historyCerts = certificates.filter((c) => c.status !== DepositStatus.Active);

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-950/70 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'active'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FolderCheck className="w-4 h-4" />
            <span>Đang Hoạt Động</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'active'
                  ? 'bg-indigo-800 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {activeCerts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Lịch Sử Tất Toán</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'history'
                  ? 'bg-indigo-800 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {historyCerts.length}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {onOpenTimeTravel && (
            <Button
              variant="secondary"
              size="sm"
              icon={<FastForward className="w-3.5 h-3.5 text-indigo-400" />}
              onClick={onOpenTimeTravel}
            >
              Tua Thời Gian
            </Button>
          )}

          {onRefreshAll && (
            <Button
              variant="secondary"
              size="sm"
              isLoading={isRefreshing}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={handleManualRefresh}
            >
              Làm Mới
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            icon={<PlusCircle className="w-3.5 h-3.5" />}
            onClick={onOpenDepositModal}
          >
            Mở Sổ Tiết Kiệm Mới
          </Button>
        </div>
      </div>

      {/* Cảnh báo phòng ngừa lừa đảo thứ cấp ở Tab Lịch Sử [Q1] */}
      {activeTab === 'history' && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-start space-x-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-200">Cảnh báo thị trường thứ cấp (Secondary Market Warning):</span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Các chứng chỉ tiền gửi NFT này đã được tất toán rút hết gốc hoặc đã tái tục sang kỳ hạn mới. Chúng không còn giá trị tài chính on-chain. Vui lòng không mua lại các NFT đã đóng sổ này trên OpenSea hoặc các NFT Marketplace.
            </p>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : activeTab === 'active' ? (
        activeCerts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeCerts.map((cert) => (
              <CertificateCard
                key={cert.depositId.toString()}
                certificate={cert}
                unpaidInterest={unpaidMap[cert.depositId.toString()] || 0n}
                currentSimulatedTime={currentSimulatedTime}
                gracePeriod={gracePeriod}
                plans={plans}
                savingCore={savingCore}
                vault={vault}
                usdc={usdc}
                onOpenEarlyModal={onOpenEarlyModal}
                onOpenRenewModal={onOpenRenewModal}
                onOpenMaturityModal={onOpenMaturityModal}
                onOpenTransferModal={onOpenTransferModal}
                onSuccess={onSuccess}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-4 max-w-md mx-auto">
            <div className="w-14 h-14 bg-indigo-950/60 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-800/40 shadow-inner">
              <FolderCheck className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">Chưa Có Sổ Tiết Kiệm Nào</h4>
              <p className="text-xs text-slate-400">
                Hãy mở sổ tiết kiệm đầu tiên để nhận chứng chỉ NFT với lãi suất Snapshot APR bất biến!
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<PlusCircle className="w-4 h-4" />}
              onClick={onOpenDepositModal}
            >
              Mở Sổ Tiết Kiệm Ngay
            </Button>
          </div>
        )
      ) : historyCerts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {historyCerts.map((cert) => (
            <CertificateCard
              key={cert.depositId.toString()}
              certificate={cert}
              unpaidInterest={unpaidMap[cert.depositId.toString()] || 0n}
              currentSimulatedTime={currentSimulatedTime}
              gracePeriod={gracePeriod}
              plans={plans}
              savingCore={savingCore}
              vault={vault}
              usdc={usdc}
              onOpenEarlyModal={onOpenEarlyModal}
              onOpenRenewModal={onOpenRenewModal}
              onOpenMaturityModal={onOpenMaturityModal}
              onSuccess={onSuccess}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-10 text-center space-y-2 max-w-md mx-auto">
          <History className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-semibold text-slate-300">Chưa Có Lịch Sử Tất Toán</h4>
          <p className="text-xs text-slate-500">
            Các sổ tiết kiệm sau khi tất toán hoặc tái tục sẽ được lưu trữ an toàn tại đây.
          </p>
        </div>
      )}
    </div>
  );
};
