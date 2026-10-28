import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { formatUnits6 } from '../utils/formatters';
import { Activity, ArrowUpRight, ArrowDownLeft, RefreshCw, Loader2 } from 'lucide-react';

interface ActivityLogProps {
  savingCore: ethers.Contract | null;
  account: string | null;
  refreshTrigger: number;
}

interface LogItem {
  id: string;
  type: 'open' | 'withdraw' | 'early' | 'renew' | 'deferred' | 'claim';
  depositId: string;
  title: string;
  amount: string;
  blockNumber: number;
  txHash: string;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({
  savingCore,
  account,
  refreshTrigger,
}) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const fetchLogs = async () => {
      if (!savingCore || !account) {
        setLogs([]);
        return;
      }
      setIsLoading(true);
      try {
        const currentBlock = await savingCore.runner?.provider?.getBlockNumber();
        const fromBlock = currentBlock ? Math.max(0, currentBlock - 10000) : 0;

        // Query events from SavingCore
        const [openEvents, withdrawEvents, renewEvents, claimEvents, deferredEvents] =
          await Promise.all([
            savingCore.queryFilter(savingCore.filters.DepositOpened(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.Withdrawn(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.Renewed(null, null), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.InterestClaimed(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.InterestDeferred(null, account), fromBlock).catch(() => []),
          ]);

        const items: LogItem[] = [];

        // 1. Open events
        for (const ev of openEvents as any[]) {
          items.push({
            id: `open-${ev.transactionHash}-${ev.args.depositId}`,
            type: 'open',
            depositId: ev.args.depositId.toString(),
            title: `Mở sổ tiết kiệm NFT #${ev.args.depositId.toString()} (Gói #${ev.args.planId.toString()})`,
            amount: `-${formatUnits6(BigInt(ev.args.principal))} USDC`,
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
          });
        }

        // 2. Withdrawn events
        for (const ev of withdrawEvents as any[]) {
          const isEarly = ev.args.isEarly;
          const interest = BigInt(ev.args.interest);
          const principal = BigInt(ev.args.principal);

          items.push({
            id: `withdrawn-${ev.transactionHash}-${ev.args.depositId}`,
            type: isEarly ? 'early' : 'withdraw',
            depositId: ev.args.depositId.toString(),
            title: isEarly
              ? `Rút trước hạn NFT #${ev.args.depositId.toString()} (Chịu phạt)`
              : `Rút đúng hạn NFT #${ev.args.depositId.toString()} (+${formatUnits6(interest)} lãi)`,
            amount: `+${formatUnits6(principal + interest)} USDC`,
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
          });
        }

        // 3. Renewed events
        for (const ev of renewEvents as any[]) {
          items.push({
            id: `renew-${ev.transactionHash}-${ev.args.newDepositId}`,
            type: 'renew',
            depositId: ev.args.newDepositId.toString(),
            title: `Tái tục sổ cũ #${ev.args.oldDepositId.toString()} -> NFT mới #${ev.args.newDepositId.toString()}`,
            amount: `+${formatUnits6(BigInt(ev.args.newPrincipal))} USDC (Gốc mới)`,
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
          });
        }

        // 4. Deferred events (C1)
        for (const ev of deferredEvents as any[]) {
          items.push({
            id: `deferred-${ev.transactionHash}-${ev.args.depositId}`,
            type: 'deferred',
            depositId: ev.args.depositId.toString(),
            title: `Hoãn trả lãi (C1) cho NFT #${ev.args.depositId.toString()}`,
            amount: `+${formatUnits6(BigInt(ev.args.amount))} USDC (Nợ)`,
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
          });
        }

        // 4. Claim events (C1)
        for (const ev of claimEvents as any[]) {
          items.push({
            id: `claim-${ev.transactionHash}-${ev.args.depositId}`,
            type: 'claim',
            depositId: ev.args.depositId.toString(),
            title: `Đã nhận nợ lãi (Claim C1) NFT #${ev.args.depositId.toString()}`,
            amount: `+${formatUnits6(BigInt(ev.args.amount))} USDC`,
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
          });
        }

        // Sắp xếp theo block giảm dần
        items.sort((a, b) => b.blockNumber - a.blockNumber);
        setLogs(items);
      } catch (err) {
        console.warn('Lỗi đọc logs activity:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, [savingCore, account, refreshTrigger]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
      <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm border-b border-slate-800 pb-3">
        <Activity className="w-4 h-4" />
        <span>Lịch Sử Giao Dịch On-Chain Gần Đây (Activity Log)</span>
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center space-x-2 text-slate-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Đang truy vấn sự kiện on-chain...</span>
        </div>
      ) : logs.length > 0 ? (
        <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto pr-1">
          {logs.map((log) => (
            <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-2 rounded-xl ${
                    log.type === 'open'
                      ? 'bg-indigo-950/70 text-indigo-400'
                      : log.type === 'early'
                      ? 'bg-amber-950/70 text-amber-400'
                      : log.type === 'deferred'
                      ? 'bg-purple-950/70 text-purple-400'
                      : 'bg-emerald-950/70 text-emerald-400'
                  }`}
                >
                  {log.type === 'open' ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : log.type === 'renew' ? (
                    <RefreshCw className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-slate-200">{log.title}</div>
                  <div className="font-mono text-[10px] text-slate-500">
                    Block #{log.blockNumber} • Tx: {log.txHash.slice(0, 10)}...{log.txHash.slice(-6)}
                  </div>
                </div>
              </div>

              <div
                className={`font-mono font-bold ${
                  log.type === 'open'
                    ? 'text-slate-400'
                    : log.type === 'deferred'
                    ? 'text-purple-300'
                    : 'text-emerald-400'
                }`}
              >
                {log.amount}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-slate-500">
          Chưa có giao dịch on-chain nào được ghi nhận cho ví này.
        </div>
      )}
    </div>
  );
};
