import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { formatUnits6, getExplorerTxUrl } from '../utils/formatters';
import { Card } from './ui/Card';
import { Skeleton } from './ui/Skeleton';
import {
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Gift,
  ShieldAlert,
  Clock,
  ExternalLink,
} from 'lucide-react';

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

const getCachedLogs = (acc: string): LogItem[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`banking_activity_log_${acc.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveCachedLogs = (acc: string, items: LogItem[]) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`banking_activity_log_${acc.toLowerCase()}`, JSON.stringify(items.slice(0, 100)));
  } catch {}
};

export const ActivityLog: React.FC<ActivityLogProps> = ({
  savingCore,
  account,
  refreshTrigger,
}) => {
  const [logs, setLogs] = useState<LogItem[]>(() => (account ? getCachedLogs(account) : []));
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (account) {
      const cached = getCachedLogs(account);
      if (cached.length > 0) {
        setLogs(cached);
      }
    }
  }, [account]);

  useEffect(() => {
    let isCancelled = false;

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
        const [openEvents, withdrawEvents, renewEvents, claimEvents, deferredEvents, penaltyEvents] =
          await Promise.all([
            savingCore.queryFilter(savingCore.filters.DepositOpened(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.Withdrawn(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.Renewed(null, null), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.InterestClaimed(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.InterestDeferred(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.PenaltyCharged(null, null), fromBlock).catch(() => []),
          ]);

        if (isCancelled) return;

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
          const isEarly = Boolean(ev.args.isEarly);
          const interest = BigInt(ev.args.interest);
          const principal = BigInt(ev.args.principal);

          let displayAmount = `+${formatUnits6(principal + interest)} USDC`;
          let displayTitle = `Rút đúng hạn NFT #${ev.args.depositId.toString()} (+${formatUnits6(interest)} USDC lãi)`;

          if (isEarly) {
            // Tìm sự kiện phạt tương ứng để trừ chính xác
            const matchedPenalty = (penaltyEvents as any[]).find(
              (p) => p.args && p.args.depositId && p.args.depositId.toString() === ev.args.depositId.toString()
            );
            const penalty = matchedPenalty ? BigInt(matchedPenalty.args.penalty) : (principal * 500n) / 10000n;
            const actualReceived = principal > penalty ? principal - penalty : 0n;

            displayTitle = `Rút trước hạn NFT #${ev.args.depositId.toString()} (Phạt: -${formatUnits6(penalty)} USDC)`;
            displayAmount = `+${formatUnits6(actualReceived)} USDC`;
          }

          items.push({
            id: `withdrawn-${ev.transactionHash}-${ev.args.depositId}`,
            type: isEarly ? 'early' : 'withdraw',
            depositId: ev.args.depositId.toString(),
            title: displayTitle,
            amount: displayAmount,
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
            title: `Tái tục sổ cũ #${ev.args.oldDepositId.toString()} ➔ NFT #${ev.args.newDepositId.toString()}`,
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
            title: `Hoãn trả lãi (C1 Ghi Nợ) NFT #${ev.args.depositId.toString()}`,
            amount: `+${formatUnits6(BigInt(ev.args.amount))} USDC (Ghi Nợ)`,
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
          });
        }

        // 5. Claim events (C1)
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

        // Hợp nhất dữ liệu mới với dữ liệu cache cũ để không bị mất log nếu RPC trả về thiếu
        const existingCached = getCachedLogs(account);
        const map = new Map<string, LogItem>();
        existingCached.forEach((it) => map.set(it.id, it));
        items.forEach((it) => map.set(it.id, it));

        const mergedItems = Array.from(map.values());
        mergedItems.sort((a, b) => b.blockNumber - a.blockNumber);

        if (!isCancelled) {
          if (mergedItems.length > 0) {
            setLogs(mergedItems);
            saveCachedLogs(account, mergedItems);
          }
        }
      } catch (err) {
        console.warn('Lỗi đọc logs activity từ RPC:', err);
        // Nếu lỗi RPC, giữ nguyên logs cache đã có thay vì xoá sạch
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchLogs();

    return () => {
      isCancelled = true;
    };
  }, [savingCore, account, refreshTrigger]);

  return (
    <Card className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5 text-white font-extrabold text-base">
          <div className="p-2 rounded-xl bg-indigo-950/60 border border-indigo-700/40 text-indigo-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <span>Lịch Sử Giao Dịch On-Chain</span>
            <div className="text-[11px] text-slate-400 font-normal">
              Truy vấn trực tiếp từ các sự kiện indexed trên hợp đồng SavingCore
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Tổng: <strong className="text-slate-200">{logs.length}</strong> sự kiện
        </div>
      </div>

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="space-y-3 py-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : logs.length > 0 ? (
        <div className="divide-y divide-slate-800/80 max-h-96 overflow-y-auto pr-1">
          {logs.map((log) => {
            let iconElement = <ArrowDownLeft className="w-4 h-4" />;
            let badgeBg = 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50';
            let amountColor = 'text-emerald-400';

            if (log.type === 'open') {
              iconElement = <ArrowUpRight className="w-4 h-4" />;
              badgeBg = 'bg-indigo-950/70 text-indigo-400 border border-indigo-800/50';
              amountColor = 'text-slate-300';
            } else if (log.type === 'early') {
              iconElement = <ShieldAlert className="w-4 h-4" />;
              badgeBg = 'bg-rose-950/70 text-rose-400 border border-rose-800/50';
              amountColor = 'text-amber-400';
            } else if (log.type === 'renew') {
              iconElement = <RefreshCw className="w-4 h-4" />;
              badgeBg = 'bg-purple-950/70 text-purple-300 border border-purple-800/50';
              amountColor = 'text-purple-300';
            } else if (log.type === 'deferred') {
              iconElement = <Clock className="w-4 h-4" />;
              badgeBg = 'bg-amber-950/70 text-amber-400 border border-amber-800/50';
              amountColor = 'text-amber-300';
            } else if (log.type === 'claim') {
              iconElement = <Gift className="w-4 h-4" />;
              badgeBg = 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50';
              amountColor = 'text-emerald-400';
            }

            return (
              <div
                key={log.id}
                className="py-3 flex items-center justify-between text-xs hover:bg-slate-950/40 px-2 rounded-xl transition"
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl ${badgeBg} shrink-0`}>
                    {iconElement}
                  </div>
                  <div>
                    <div className="font-bold text-slate-200 text-xs">{log.title}</div>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono mt-0.5">
                      <span>Block #{log.blockNumber}</span>
                      <span>•</span>
                      <a
                        href={getExplorerTxUrl(log.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 text-slate-400 hover:text-indigo-300 transition"
                        title="Xem trên Sepolia Etherscan"
                      >
                        <span>Tx: {log.txHash.slice(0, 8)}...{log.txHash.slice(-6)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className={`font-mono font-black text-sm tabular-nums ${amountColor}`}>
                  {log.amount}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center space-y-2">
          <Activity className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-xs font-semibold text-slate-300">Chưa có giao dịch on-chain nào</div>
          <div className="text-[11px] text-slate-400">
            Các hoạt động mở sổ, tất toán, nhận lãi và tái tục sẽ hiển thị tại đây.
          </div>
        </div>
      )}
    </Card>
  );
};
