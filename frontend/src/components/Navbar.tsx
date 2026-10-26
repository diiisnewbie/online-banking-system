import React from 'react';
import { Wallet, Clock, Activity } from 'lucide-react';
import { formatTimestamp } from '../utils/formatters';

interface NavbarProps {
  account: string | null;
  chainId: number | null;
  isConnecting: boolean;
  currentSimulatedTime: bigint;
  onConnect: () => void;
  onOpenTimeTravel?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  account,
  chainId,
  isConnecting,
  currentSimulatedTime,
  onConnect,
  onOpenTimeTravel,
}) => {
  const isHardhat = chainId === 31337;

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
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* EVM Simulated Clock */}
          <div
            onClick={onOpenTimeTravel}
            title="Nhấn để mở công cụ tua thời gian (Dev-Only)"
            className="hidden md:flex items-center space-x-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-3 py-1.5 rounded-lg cursor-pointer transition text-xs font-mono text-slate-300"
          >
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>{formatTimestamp(currentSimulatedTime)}</span>
          </div>

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
