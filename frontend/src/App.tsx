import { useState } from 'react';
import { useWeb3 } from './hooks/useWeb3';
import { useBankingContracts } from './hooks/useBankingContracts';
import { usePlans } from './hooks/usePlans';
import { Navbar } from './components/Navbar';
import { PlansList } from './components/PlansList';
import { Faucet } from './components/Faucet';
import { DevTimeTravelModal } from './components/DevTimeTravelModal';
import { Shield, Sparkles } from 'lucide-react';

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

  const { savingCore, usdc, savingCoreAddress } = useBankingContracts(provider, signer);
  const { plans, isLoading: plansLoading, error: plansError } = usePlans(savingCore);

  const [isTimeTravelOpen, setIsTimeTravelOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <Navbar
        account={account}
        chainId={chainId}
        isConnecting={isConnecting}
        currentSimulatedTime={currentSimulatedTime}
        onConnect={connectWallet}
        onOpenTimeTravel={() => setIsTimeTravelOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Web3 / Network Errors */}
        {web3Error && (
          <div className="p-4 bg-rose-950/60 border border-rose-800/60 rounded-xl text-rose-300 text-sm">
            {web3Error}
          </div>
        )}

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900/60 via-slate-800/80 to-slate-900 border border-indigo-500/20 p-6 sm:p-8">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Phase 3 — Frontend Web3 Scaffold Clean Build</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Hệ Thống Tiết Kiệm Kỳ Hạn On-Chain
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Mỗi khoản gửi tiết kiệm được đúc thành một chứng chỉ NFT ERC-721 với lãi suất cam kết bất biến (Snapshot APR), hỗ trợ tự động tái tục (Backdate) và chuyển nhượng tự do trên thị trường thứ cấp.
            </p>
          </div>
        </div>

        {/* Faucet Component */}
        <Faucet account={account} usdcContract={usdc} />

        {/* Plans List Component (Read from SavingCore.getAllPlans) */}
        <PlansList plans={plans} isLoading={plansLoading} error={plansError} />

        {/* Technical Architecture Info Panel */}
        <div className="p-5 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Thông Tin Hạ Tầng Web3 & Ràng Buộc Kỹ Thuật (N3)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <div className="font-semibold text-slate-300">SavingCore Address:</div>
              <div className="font-mono text-[11px] text-indigo-300 break-all mt-1">
                {savingCoreAddress}
              </div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <div className="font-semibold text-slate-300">EVM Time Sync:</div>
              <div className="text-slate-300 mt-1">
                Đồng hồ hiển thị theo block.timestamp kèm giải thuật bù offset, không dùng Date.now() máy tính [Q5].
              </div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <div className="font-semibold text-slate-300">Auto Contract Discovery:</div>
              <div className="text-slate-300 mt-1">
                Địa chỉ Vault và USDC được tự động truy vấn từ getter public immutable core.vault() và core.usdc().
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        DeFi Banking System — Built with React 18, Vite 6, TailwindCSS 3 & Ethers v6
      </footer>

      {/* Dev Time Travel Modal */}
      <DevTimeTravelModal
        isOpen={isTimeTravelOpen}
        onClose={() => setIsTimeTravelOpen(false)}
        chainId={chainId}
        onSuccess={syncBlockTime}
      />
    </div>
  );
}

export default App;
