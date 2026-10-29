import { useState, useEffect, useCallback, useRef } from 'react';
import { useWeb3 } from './hooks/useWeb3';
import { useBankingContracts } from './hooks/useBankingContracts';
import { usePlans } from './hooks/usePlans';
import { useCertificates } from './hooks/useCertificates';
import { Navbar, NavTab } from './components/Navbar';
import { PlansList } from './components/PlansList';
import { Faucet } from './components/Faucet';
import { CertificatesList } from './components/CertificatesList';
import { AdminPanel } from './components/AdminPanel';
import { ActivityLog } from './components/ActivityLog';
import { OpenDepositModal } from './components/OpenDepositModal';
import { EarlyWithdrawModal } from './components/EarlyWithdrawModal';
import { MaturityWithdrawModal } from './components/MaturityWithdrawModal';
import { RenewModal } from './components/RenewModal';
import { DevTimeTravelModal } from './components/DevTimeTravelModal';
import { SavingPlan, DepositCertificate, DepositStatus } from './contracts/types';
import { useToast } from './components/ui/ToastContext';
import {
  Shield,
  Sparkles,
  Lock,
  PlusCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './components/ui/Button';

export function App() {
  const { addToast } = useToast();
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

  const { savingCore, vault, usdc, savingCoreAddress } = useBankingContracts(provider, signer, chainId);
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
  const [activeTab, setActiveTab] = useState<NavTab>('plans');

  // System status & ownership
  const [isSystemPaused, setIsSystemPaused] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);

  useEffect(() => {
    const checkSystem = async () => {
      if (!vault && !savingCore) return;
      try {
        if (vault) {
          const paused = await vault.paused();
          setIsSystemPaused(paused);
        }
        if (account) {
          const [coreOwner, vaultOwner] = await Promise.all([
            savingCore ? savingCore.owner().catch(() => null) : null,
            vault ? vault.owner().catch(() => null) : null,
          ]);
          const userLower = account.toLowerCase();
          const match =
            (coreOwner && coreOwner.toLowerCase() === userLower) ||
            (vaultOwner && vaultOwner.toLowerCase() === userLower);
          setIsOwner(!!match);
        } else {
          setIsOwner(false);
        }
      } catch (err) {
        console.warn('Lỗi kiểm tra trạng thái hệ thống:', err);
      }
    };
    checkSystem();
  }, [vault, savingCore, account, refreshTrigger]);

  // Modals state
  const [isTimeTravelOpen, setIsTimeTravelOpen] = useState(false);
  const [isOpenDepositModalOpen, setIsOpenDepositModalOpen] = useState(false);
  const [selectedPlanForOpen, setSelectedPlanForOpen] = useState<SavingPlan | undefined>(undefined);

  const [selectedCertForEarly, setSelectedCertForEarly] = useState<DepositCertificate | null>(null);
  const [selectedCertForMaturity, setSelectedCertForMaturity] = useState<DepositCertificate | null>(null);
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
  const handleTxSuccess = useCallback(async (newTimestamp?: bigint) => {
    setRefreshTrigger((prev) => prev + 1);
    await Promise.all([
      syncBlockTime(newTimestamp),
      refetchPlans(),
      refetchCerts(),
      fetchUserBalance(),
    ]);
    setTimeout(() => {
      fetchUserBalance();
      refetchCerts();
    }, 500);
  }, [syncBlockTime, refetchPlans, refetchCerts, fetchUserBalance]);

  // Real-time synchronization with on-chain events (Auto-Renew by Keeper Bot, etc.)
  const lastNextIdRef = useRef<bigint>(0n);

  useEffect(() => {
    if (!savingCore) return;

    // 1. Listen for Renewed event (Auto-Renew or Manual Renew)
    const onRenewed = async (oldDepositId: any, newDepositId: any) => {
      await handleTxSuccess();
      addToast(
        'info',
        `Sổ tiết kiệm #${oldDepositId.toString()} vừa được tự động tái tục (Auto-Renew) sang NFT mới #${newDepositId.toString()}!`,
        {
          title: 'Auto-Renew Thành Công',
        }
      );
    };

    const onDepositOpened = async () => {
      await handleTxSuccess();
    };

    const onWithdrawn = async () => {
      await handleTxSuccess();
    };

    try {
      savingCore.on('Renewed', onRenewed);
      savingCore.on('DepositOpened', onDepositOpened);
      savingCore.on('Withdrawn', onWithdrawn);
    } catch (e) {
      console.warn('Could not attach contract event listeners:', e);
    }

    // 2. Background polling interval (every 3 seconds)
    // Ensures UI automatically catches changes even if WebSocket/filter drops in local node
    const pollInterval = setInterval(async () => {
      try {
        const nextId = await savingCore.nextDepositId();
        if (lastNextIdRef.current !== 0n && BigInt(nextId) !== lastNextIdRef.current) {
          // New deposit or auto-renew occurred on-chain!
          await handleTxSuccess();
        }
        lastNextIdRef.current = BigInt(nextId);
        // Silently refresh certs and balance in background
        if (account) {
          refetchCerts(true);
          fetchUserBalance();
        }
      } catch (err) {
        // ignore polling errors
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      try {
        savingCore.off('Renewed', onRenewed);
        savingCore.off('DepositOpened', onDepositOpened);
        savingCore.off('Withdrawn', onWithdrawn);
      } catch {}
    };
  }, [savingCore, account, handleTxSuccess, addToast, refetchCerts, fetchUserBalance]);

  const activeCertsCount = certificates.filter((c) => c.status === DepositStatus.Active).length;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">
        {/* Paused Banner toàn trang khi hệ thống đang bị dừng khẩn cấp */}
        {isSystemPaused && (
          <div className="bg-rose-950/90 border-b border-rose-800/80 px-4 py-2.5 text-center text-xs font-semibold text-rose-200 flex items-center justify-center space-x-2 sticky top-0 z-50 backdrop-blur-md">
            <Lock className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
            <span>
              CẢNH BÁO: Hệ thống đang trong trạng thái TẠM DỪNG KHẨN CẤP (Paused) bởi Quản trị viên. Các giao dịch mở sổ và tái tục tạm thời bị vô hiệu.
            </span>
          </div>
        )}

        <Navbar
          account={account}
          chainId={chainId}
          isConnecting={isConnecting}
          currentSimulatedTime={currentSimulatedTime}
          userBalance={userBalance}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isOwner={isOwner}
          activeCertsCount={activeCertsCount}
          onOpenDeposit={() => {
            setSelectedPlanForOpen(undefined);
            setIsOpenDepositModalOpen(true);
          }}
          onConnect={connectWallet}
          onSwitchNetwork={connectWallet}
          onOpenTimeTravel={() => setIsTimeTravelOpen(true)}
          onRefreshAll={() => handleTxSuccess()}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          {/* Web3 / Network Errors */}
          {web3Error && (
            <div className="p-4 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs sm:text-sm flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{web3Error}</span>
            </div>
          )}

          {/* Top Banner / Hero Summary */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border border-slate-800 p-6 sm:p-7 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-2xl space-y-2">
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>On-Chain Term Deposit Banking</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Tiết Kiệm Kỳ Hạn Với Chứng Chỉ NFT (ERC-721)
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                  Lãi suất cam kết bất biến (Snapshot APR), minh bạch on-chain. Hỗ trợ rút đúng hạn, rút trước hạn với phí phạt 5%, tái tục tự động bù lãi (Backdate), và cơ chế hoãn trả lãi an toàn (Bonus C1).
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Button
                  variant="primary"
                  size="lg"
                  icon={<PlusCircle className="w-4 h-4" />}
                  onClick={() => {
                    setSelectedPlanForOpen(undefined);
                    setIsOpenDepositModalOpen(true);
                  }}
                >
                  Mở Sổ Tiết Kiệm
                </Button>
              </div>
            </div>
          </div>

          {/* Faucet bar inline */}
          <Faucet
            account={account}
            usdcContract={usdc}
            balance={userBalance}
            onMintSuccess={handleTxSuccess}
          />

          {/* Main Views Container */}
          <div className="pt-2">
            {/* Tab 1: Plans View */}
            {activeTab === 'plans' && (
              <PlansList
                plans={plans}
                isLoading={plansLoading}
                error={plansError}
                onSelectPlan={(plan) => {
                  setSelectedPlanForOpen(plan);
                  setIsOpenDepositModalOpen(true);
                }}
              />
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
                onOpenMaturityModal={(cert) => setSelectedCertForMaturity(cert)}
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
          </div>

          {/* Technical Architecture Info Panel */}
          <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-300">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Thông Số Kiến Trúc Hợp Đồng On-Chain (Hardhat Node)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="font-semibold text-slate-300">SavingCore Contract:</div>
                <div className="font-mono text-[11px] text-indigo-400 break-all mt-1">
                  {savingCoreAddress || 'Đang kết nối...'}
                </div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="font-semibold text-slate-300">Đồng Hồ Giả Lập EVM:</div>
                <div className="text-slate-400 mt-1">
                  Tính toán theo Block timestamp + offset thực, kiểm soát biên đáo hạn chính xác tuyệt đối.
                </div>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <div className="font-semibold text-slate-300">Bảo Vệ Solvency Guard C2:</div>
                <div className="text-slate-400 mt-1">
                  Tự động khóa lệnh rút quỹ khi số dư Vault chạm ngưỡng bảo đảm nghĩa vụ cam kết.
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
          Term Deposit Banking dApp — React 18, Tailwind CSS v3 & Ethers v6
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
          currentSimulatedTime={currentSimulatedTime}
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

        <MaturityWithdrawModal
          isOpen={selectedCertForMaturity !== null}
          onClose={() => setSelectedCertForMaturity(null)}
          certificate={selectedCertForMaturity}
          savingCore={savingCore}
          vault={vault}
          usdc={usdc}
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
          currentSimulatedTime={currentSimulatedTime}
          onSuccess={handleTxSuccess}
        />

        <DevTimeTravelModal
          isOpen={isTimeTravelOpen}
          onClose={() => setIsTimeTravelOpen(false)}
          chainId={chainId}
          currentSimulatedTime={currentSimulatedTime}
          onSuccess={async (newTimestamp) => {
            await handleTxSuccess(newTimestamp);
          }}
        />
      </div>
  );
}

export default App;
