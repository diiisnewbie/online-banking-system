import React, { useState } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate, DepositStatus, SavingPlan } from '../contracts/types';
import { CertificateCard } from './CertificateCard';
import { FolderCheck, History, PlusCircle, AlertTriangle, Loader2 } from 'lucide-react';

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
  onSuccess: () => Promise<void>;
  onOpenDepositModal: () => void;
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
  onSuccess,
  onOpenDepositModal,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  const activeCerts = certificates.filter((c) => c.status === DepositStatus.Active);
  const historyCerts = certificates.filter((c) => c.status !== DepositStatus.Active);

  return (
    <div className="space-y-5">
      {/* Tab Switcher & Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'active'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderCheck className="w-4 h-4" />
            <span>Sổ Đang Hoạt Động</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                activeTab === 'active' ? 'bg-indigo-800 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {activeCerts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-2 ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Lịch Sử Tất Toán</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-mono ${
                activeTab === 'history'
                  ? 'bg-indigo-800 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {historyCerts.length}
            </span>
          </button>
        </div>

        <button
          onClick={onOpenDepositModal}
          className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-lg shadow-indigo-950/40"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Mở Sổ Tiết Kiệm Mới</span>
        </button>
      </div>

      {/* Cảnh báo phòng ngừa lừa đảo thứ cấp ở Tab Lịch Sử [Q1] */}
      {activeTab === 'history' && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-300 flex items-start space-x-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <div>
            <strong className="text-amber-200">Cảnh báo thị trường thứ cấp [Q1]:</strong> Các chứng chỉ trong danh sách này đã được tất toán hoặc đã tái tục sang kỳ hạn mới. Chúng không còn giá trị rút gốc hay nhận lãi. Nếu bạn mua lại NFT này trên sàn giao dịch NFT thứ cấp, bạn sẽ không thể rút được tiền.
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
          <p className="text-xs">Đang tải danh sách chứng chỉ tiền gửi từ blockchain...</p>
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
                onSuccess={onSuccess}
              />
            ))}
          </div>
        ) : (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 bg-indigo-950/80 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto border border-indigo-800/50">
              <FolderCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Chưa Có Sổ Tiết Kiệm Đang Hoạt Động</h4>
              <p className="text-xs text-slate-400">
                Hãy mở sổ tiết kiệm đầu tiên để nhận chứng chỉ NFT với lãi suất snapshot bất biến!
              </p>
            </div>
            <button
              onClick={onOpenDepositModal}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center space-x-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Gửi Tiền Ngay</span>
            </button>
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
              onSuccess={onSuccess}
            />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400 max-w-md mx-auto">
          Chưa có lịch sử tất toán nào được ghi nhận.
        </div>
      )}
    </div>
  );
};

