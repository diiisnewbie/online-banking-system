import React, { useState } from 'react';
import { Wallet, Activity, FastForward, RefreshCw, Coins } from 'lucide-react';
import { formatTimestamp, formatUnits6 } from '../utils/formatters';

interface NavbarProps {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  currentSimulatedTime: bigint;
  userBalance?: bigint | null;
  onConnect: () => void;
  onOpenTimeTravel?: () => void;
  onRefreshAll?: () => Promise<void>;
}

export const Navbar: React.FC<NavbarProps> = ({
  account,
  chainId,
  isConnecting,
  currentSimulatedTime,
  userBalance,
  onConnect,
  onOpenTimeTravel,
  onRefreshAll,
}) => {
  const isHardhat = chainId === 31337;
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            DS
          </div>
          <div>
            <div className="font-bold text-base text-white tracking-wide">
              DeFi Saving System
            </div>
            <div className="text-xs text-slate-400 font-mono">
              NFT-backed Term Deposits
            </div>
          </div>
        </div>

        {/* Time & Network & Wallet info */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* EVM Simulated Clock & Time-Travel Button */}
          {isHardhat && (
            <div className="flex items-center space-x-1.5">
              <button
                onClick={onOpenTimeTravel}
                title="Nhấn để mở công cụ tua nhanh thời gian EVM (Dev Tool)"
                className="flex items-center space-x-1.5 bg-indigo-950/70 hover:bg-indigo-900/80 border border-indigo-700/60 px-2.5 py-1.5 rounded-lg cursor-pointer transition text-xs font-mono text-indigo-300 shadow-sm"
              >
                <FastForward className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline font-semibold">Tua Thời Gian:</span>
                <span className="text-white">{formatTimestamp(currentSimulatedTime)}</span>
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

          {/* Network Badge */}
          {account && (
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-slate-800 border-slate-700">
              <Activity
                className={`w-3 h-3 ${isHardhat ? 'text-emerald-400' : 'text-amber-400'}`}
              />
              <span className={isHardhat ? 'text-slate-200' : 'text-amber-300'}>
                {isHardhat ? 'Hardhat 31337' : `Chain: ${chainId ?? 'Unknown'}`}
              </span>
            </div>
          )}

          {/* User Balance Badge */}
          {account && userBalance !== undefined && userBalance !== null && (
            <div
              title="Số dư ví MockUSDC cá nhân"
              className="hidden sm:flex items-center space-x-1.5 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg text-xs font-mono text-emerald-300 shadow-sm"
            >
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold">{formatUnits6(userBalance)} USDC</span>
            </div>
          )}

          {/* Connect Button / Address */}
          {account ? (
            <div className="flex items-center space-x-2 bg-indigo-950/60 border border-indigo-500/40 px-3 py-1.5 rounded-lg text-xs font-mono text-indigo-200">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {account.slice(0, 6)}...{account.slice(-4)}
              </span>
            </div>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-md shadow-indigo-600/30 disabled:opacity-50"
            >
              <Wallet className="w-4 h-4" />
              <span>{isConnecting ? 'Đang kết nối...' : 'Kết nối ví'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
