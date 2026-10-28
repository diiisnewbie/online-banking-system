import { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from './hooks/useWeb3';
import { useBankingContracts } from './hooks/useBankingContracts';
import { usePlans } from './hooks/usePlans';
import { useCertificates } from './hooks/useCertificates';
import { Navbar } from './components/Navbar';
import { PlansList } from './components/PlansList';
import { Faucet } from './components/Faucet';
import { CertificatesList } from './components/CertificatesList';
import { AdminPanel } from './components/AdminPanel';
import { ActivityLog } from './components/ActivityLog';
import { OpenDepositModal } from './components/OpenDepositModal';
import { EarlyWithdrawModal } from './components/EarlyWithdrawModal';
import { RenewModal } from './components/RenewModal';
import { DevTimeTravelModal } from './components/DevTimeTravelModal';
import { SavingPlan, DepositCertificate, DepositStatus } from './contracts/types';
import {
  TrendingUp,
  FolderCheck,
  Shield,
  Activity,
  Sparkles,
} from 'lucide-react';

export function App() {
  const {
    account,
    chainId,
    isConnecting,
    error: web3Error,
    provider,
    signer,
    currentSimulatedTime,
    syncBlockTime,
    connectWallet,
  } = useWeb3();

  const { savingCore, vault, usdc, savingCoreAddress } = useBankingContracts(provider, signer);
  const { plans, isLoading: plansLoading, error: plansError, refetchPlans } = usePlans(savingCore);

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const {
    certificates,
    unpaidMap,
    isLoading: certsLoading,
    refetch: refetchCerts,
  } = useCertificates(savingCore, account, refreshTrigger);

  // Grace period query from savingCore.gracePeriod()
  const [gracePeriod, setGracePeriod] = useState<bigint>(259200n); // default 3 days
  useEffect(() => {
    if (savingCore) {
      savingCore.gracePeriod().then((gp: any) => setGracePeriod(BigInt(gp))).catch(() => {});
    }
  }, [savingCore]);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'plans' | 'certificates' | 'admin' | 'activity'>('plans');

  // Modals state
  const [isTimeTravelOpen, setIsTimeTravelOpen] = useState(false);
  const [isOpenDepositModalOpen, setIsOpenDepositModalOpen] = useState(false);
  const [selectedPlanForOpen, setSelectedPlanForOpen] = useState<SavingPlan | undefined>(undefined);

  const [selectedCertForEarly, setSelectedCertForEarly] = useState<DepositCertificate | null>(null);
  const [selectedCertForRenew, setSelectedCertForRenew] = useState<DepositCertificate | null>(null);

  // User personal USDC balance state
  const [userBalance, setUserBalance] = useState<bigint | null>(null);

  const fetchUserBalance = useCallback(async () => {
    if (!account || !usdc) {
      setUserBalance(null);
      return;
    }
    try {
      const bal = await usdc.balanceOf(account);
      setUserBalance(BigInt(bal));
    } catch (err) {
      console.warn('Lỗi đọc số dư USDC:', err);
    }
  }, [account, usdc]);

  useEffect(() => {
    fetchUserBalance();
  }, [fetchUserBalance, refreshTrigger]);

  // Global refresh handler after transactions or time-travel
  const handleTxSuccess = async (newTimestamp?: bigint) => {
    setRefreshTrigger((prev) => prev + 1);
    await Promise.all([
      syncBlockTime(newTimestamp),
      refetchPlans(),
      refetchCerts(),
      fetchUserBalance(),
    ]);
    // Kiểm tra lại sau 500ms để đảm bảo đồng bộ hoàn toàn với blockchain
    setTimeout(() => {
      fetchUserBalance();
      refetchCerts();
    }, 500);
  };

  const activeCertsCount = certificates.filter((c) => c.status === DepositStatus.Active).length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      <Navbar
        account={account}
        chainId={chainId}
        isConnecting={isConnecting}
        currentSimulatedTime={currentSimulatedTime}
        userBalance={userBalance}
        onConnect={connectWallet}
        onOpenTimeTravel={() => setIsTimeTravelOpen(true)}
        onRefreshAll={() => handleTxSuccess()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Web3 / Network Errors */}
        {web3Error && (
          <div className="p-4 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-sm">
            {web3Error}
          </div>
        )}

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-800/80 to-slate-900 border border-indigo-500/20 p-6 sm:p-7 shadow-xl">
          <div className="max-w-2xl space-y-2.5">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Hệ Thống Tiết Kiệm Trực Tuyến On-Chain (EVM Bank)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Term Deposit Banking System với ERC-721 NFT
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Chứng chỉ tiền gửi NFT đại diện quyền sở hữu dòng tiền. Lãi suất cam kết bất biến (Snapshot APR), hỗ trợ tất toán đúng hạn, rút sớm (phạt 5%), tái tục tự động bù lãi (Backdate), và hoãn trả lãi an toàn (Bonus C1).
            </p>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                activeTab === 'plans'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <span>Gói Tiết Kiệm (Plans)</span>
            </button>

            <button
              onClick={() => setActiveTab('certificates')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                activeTab === 'certificates'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
              }`}
            >
              <FolderCheck className="w-4 h-4 text-indigo-400" />
              <span>Sổ Tiết Kiệm Của Tôi</span>
              {activeCertsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-900 text-[10px] font-bold">
                  {activeCertsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                activeTab === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
              }`}
            >
              <Shield className="w-4 h-4 text-amber-400" />
              <span>Quản Trị Hệ Thống (Admin)</span>
            </button>

            <button
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
                activeTab === 'activity'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border border-slate-700/60'
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Lịch Sử Giao Dịch</span>
            </button>
          </div>

          {/* Faucet Component Inline */}
          <div className="w-full sm:w-auto">
            <Faucet
              account={account}
              usdcContract={usdc}
              balance={userBalance}
              onMintSuccess={handleTxSuccess}
            />
          </div>
        </div>

        {/* Tab 1: Plans View */}
        {activeTab === 'plans' && (
          <div className="space-y-6">
            <PlansList
              plans={plans}
              isLoading={plansLoading}
              error={plansError}
              onSelectPlan={(plan) => {
                setSelectedPlanForOpen(plan);
                setIsOpenDepositModalOpen(true);
              }}
            />
          </div>
        )}

        {/* Tab 2: Certificates View */}
        {activeTab === 'certificates' && (
          <CertificatesList
            certificates={certificates}
            unpaidMap={unpaidMap}
            currentSimulatedTime={currentSimulatedTime}
            gracePeriod={gracePeriod}
            plans={plans}
            savingCore={savingCore}
            vault={vault}
            usdc={usdc}
            isLoading={certsLoading}
            onOpenEarlyModal={(cert) => setSelectedCertForEarly(cert)}
            onOpenRenewModal={(cert) => setSelectedCertForRenew(cert)}
            onSuccess={handleTxSuccess}
            onOpenDepositModal={() => {
              setSelectedPlanForOpen(undefined);
              setIsOpenDepositModalOpen(true);
            }}
            onOpenTimeTravel={() => setIsTimeTravelOpen(true)}
            onRefreshAll={() => handleTxSuccess()}
          />
        )}

        {/* Tab 3: Admin Panel View */}
        {activeTab === 'admin' && (
          <AdminPanel
            savingCore={savingCore}
            vault={vault}
            usdc={usdc}
            account={account}
            refreshTrigger={refreshTrigger}
            onSuccess={handleTxSuccess}
          />
        )}

        {/* Tab 4: Activity Log View */}
        {activeTab === 'activity' && (
          <ActivityLog
            savingCore={savingCore}
            account={account}
            refreshTrigger={refreshTrigger}
          />
        )}

        {/* Technical Architecture Info Panel */}
        <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Thông Tin Triển Khai On-Chain (Hardhat Local Chain)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <div className="font-semibold text-slate-300">SavingCore Address:</div>
              <div className="font-mono text-[11px] text-indigo-300 break-all mt-0.5">
                {savingCoreAddress}
              </div>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <div className="font-semibold text-slate-300">EVM Simulated Clock:</div>
              <div className="text-slate-300 mt-0.5">
                Đồng hồ hiển thị theo block timestamp + offset, đảm bảo kiểm tra biên thời gian chính xác [Q5].
              </div>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <div className="font-semibold text-slate-300">Cơ chế Solvency Guard:</div>
              <div className="text-slate-300 mt-0.5">
                Khóa rút cạn vốn khỏi Vault khi có khoản gửi Active hoặc nợ C1 [D25].
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        Online Banking Term Deposit System — React 18, Vite 6, TailwindCSS 4 & Ethers v6
      </footer>

      {/* Modals */}
      <OpenDepositModal
        isOpen={isOpenDepositModalOpen}
        onClose={() => setIsOpenDepositModalOpen(false)}
        plans={plans}
        initialPlanId={selectedPlanForOpen?.planId}
        savingCore={savingCore}
        usdc={usdc}
        account={account}
        onSuccess={handleTxSuccess}
      />

      <EarlyWithdrawModal
        isOpen={selectedCertForEarly !== null}
        onClose={() => setSelectedCertForEarly(null)}
        certificate={selectedCertForEarly}
        savingCore={savingCore}
        vault={vault}
        onSuccess={handleTxSuccess}
      />

      <RenewModal
        isOpen={selectedCertForRenew !== null}
        onClose={() => setSelectedCertForRenew(null)}
        certificate={selectedCertForRenew}
        plans={plans}
        savingCore={savingCore}
        vault={vault}
        usdc={usdc}
        onSuccess={handleTxSuccess}
      />

      <DevTimeTravelModal
        isOpen={isTimeTravelOpen}
        onClose={() => setIsTimeTravelOpen(false)}
        chainId={chainId}
        onSuccess={async (newTimestamp) => {
          await handleTxSuccess(newTimestamp);
        }}
      />
    </div>
  );
}

export default App;
