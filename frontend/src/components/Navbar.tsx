import React, { useState } from 'react';
import {
  Wallet,
  Activity,
  FastForward,
  RefreshCw,
  Coins,
  Copy,
  Check,
  AlertTriangle,
  Landmark,
  TrendingUp,
  FolderCheck,
  Shield,
  PlusCircle,
} from 'lucide-react';
import { formatTimestamp, formatUnits6 } from '../utils/formatters';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export type NavTab = 'plans' | 'certificates' | 'admin' | 'activity';

interface NavbarProps {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  currentSimulatedTime: bigint;
  userBalance?: bigint | null;
  activeTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  isOwner?: boolean;
  activeCertsCount?: number;
  onOpenDeposit?: () => void;
  onConnect: () => void;
  onSwitchNetwork?: () => void;
  onOpenTimeTravel?: () => void;
  onRefreshAll?: () => Promise<void>;
}

export const Navbar: React.FC<NavbarProps> = ({
  account,
  chainId,
  isConnecting,
  currentSimulatedTime,
  userBalance,
  activeTab = 'plans',
  onSelectTab,
  isOwner = false,
  activeCertsCount = 0,
  onOpenDeposit,
  onConnect,
  onSwitchNetwork,
  onOpenTimeTravel,
  onRefreshAll,
}) => {
  const targetChainId = Number(import.meta.env.VITE_CHAIN_ID || 31337);
  const isHardhat = chainId === 31337;
  const isWrongNetwork = account !== null && chainId !== targetChainId;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleManualRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRefreshAll && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefreshAll();
      } finally {
        setTimeout(() => setIsRefreshing(false), 500);
      }
    }
  };

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-xl sticky top-0 z-40 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Bar: Brand, Info, Wallet */}
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/20">
              <Landmark className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-extrabold text-base text-white tracking-tight flex items-center space-x-1.5">
                <span>Term Deposit Bank</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  dApp
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                On-chain NFT Certificates
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          {onSelectTab && (
            <nav className="hidden lg:flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
              <button
                onClick={() => onSelectTab('plans')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'plans'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Gói Tiết Kiệm</span>
              </button>

              <button
                onClick={() => onSelectTab('certificates')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'certificates'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <FolderCheck className="w-3.5 h-3.5" />
                <span>Sổ Của Tôi</span>
                {activeCertsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold">
                    {activeCertsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => onSelectTab('activity')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                  activeTab === 'activity'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Lịch Sử</span>
              </button>

              {isOwner && (
                <button
                  onClick={() => onSelectTab('admin')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                    activeTab === 'admin'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800/40'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span>Admin</span>
                </button>
              )}
            </nav>
          )}

          {/* Controls: Time travel, Network, Balance, Wallet */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            {/* Quick Open Deposit Button */}
            {onOpenDeposit && account && (
              <Button
                variant="primary"
                size="sm"
                icon={<PlusCircle className="w-3.5 h-3.5" />}
                onClick={onOpenDeposit}
                className="hidden sm:inline-flex"
              >
                Mở Sổ Mới
              </Button>
            )}

            {/* EVM Simulated Clock & Time-Travel Button */}
            {isHardhat && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={onOpenTimeTravel}
                  title="Nhấn để mở công cụ tua nhanh thời gian EVM (Dev Tool)"
                  className="flex items-center space-x-1.5 bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/60 px-2.5 py-1.5 rounded-lg transition text-xs font-mono text-indigo-300 shadow-sm"
                >
                  <FastForward className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden xl:inline font-medium text-slate-400">EVM:</span>
                  <span className="text-white font-semibold">{formatTimestamp(currentSimulatedTime)}</span>
                </button>

                {onRefreshAll && (
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    title="Đồng bộ lại thời gian và làm mới toàn bộ dữ liệu on-chain"
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                  </button>
                )}
              </div>
            )}

            {/* Network Badge & Switcher */}
            {account && (
              <>
                {isWrongNetwork ? (
                  <div className="flex items-center space-x-1.5">
                    <span className="px-2.5 py-1 bg-rose-950/80 border border-rose-700/60 text-rose-300 rounded-lg text-xs font-semibold flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Sai mạng: {chainId}</span>
                    </span>
                    {onSwitchNetwork && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={onSwitchNetwork}
                      >
                        Đổi sang {targetChainId === 11155111 ? 'Sepolia' : 'Hardhat'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <Badge variant="success" dot className="hidden md:inline-flex">
                    {chainId === 11155111 ? 'Sepolia Testnet' : isHardhat ? 'Hardhat 31337' : `Chain: ${chainId}`}
                  </Badge>
                )}
              </>
            )}

            {/* User Balance Badge */}
            {account && userBalance !== undefined && userBalance !== null && (
              <div
                title="Số dư ví MockUSDC cá nhân"
                className="hidden sm:flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg text-xs font-mono text-emerald-400"
              >
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold tabular-nums">{formatUnits6(userBalance)} USDC</span>
              </div>
            )}

            {/* Connect Button / Address with Copy */}
            {account ? (
              <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-mono">
                <div className="flex items-center space-x-1.5 px-2 py-1 text-slate-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={handleCopyAddress}
                  title="Sao chép địa chỉ ví"
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <Button
                variant="primary"
                size="md"
                isLoading={isConnecting}
                loadingText="Đang kết nối..."
                icon={<Wallet className="w-4 h-4" />}
                onClick={onConnect}
              >
                Kết nối ví
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        {onSelectTab && (
          <div className="lg:hidden flex items-center justify-between border-t border-slate-800/60 py-2 overflow-x-auto gap-2">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => onSelectTab('plans')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
                  activeTab === 'plans'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Gói</span>
              </button>

              <button
                onClick={() => onSelectTab('certificates')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
                  activeTab === 'certificates'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderCheck className="w-3.5 h-3.5" />
                <span>Sổ Của Tôi</span>
                {activeCertsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-bold">
                    {activeCertsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => onSelectTab('activity')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
                  activeTab === 'activity'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Lịch Sử</span>
              </button>

              {isOwner && (
                <button
                  onClick={() => onSelectTab('admin')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
                    activeTab === 'admin'
                      ? 'bg-indigo-600 text-white'
                      : 'text-amber-400 hover:text-amber-300'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
              )}
            </div>

            {onOpenDeposit && account && (
              <Button
                variant="primary"
                size="sm"
                icon={<PlusCircle className="w-3 h-3" />}
                onClick={onOpenDeposit}
                className="whitespace-nowrap"
              >
                Mở Sổ
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
