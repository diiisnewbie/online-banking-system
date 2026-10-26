import React from 'react';
import { SavingPlan } from '../contracts/types';
import { formatBps, formatUnits6 } from '../utils/formatters';
import { ShieldCheck, TrendingUp, AlertCircle, Calendar } from 'lucide-react';

interface PlansListProps {
  plans: SavingPlan[];
  isLoading: boolean;
  error: string | null;
  onSelectPlan?: (plan: SavingPlan) => void;
}

export const PlansList: React.FC<PlansListProps> = ({
  plans,
  isLoading,
  error,
  onSelectPlan,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <span>Gói Tiết Kiệm Kỳ Hạn (On-Chain Plans)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Đọc trực tiếp từ hàm <code className="text-indigo-300">getAllPlans()</code> trên smart contract SavingCore [D29]
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-700/60 text-slate-400 text-sm">
          Đang truy vấn danh sách gói từ blockchain...
        </div>
      )}

      {error && plans.length === 0 && !isLoading && (
        <div className="p-6 bg-slate-800/30 rounded-xl border border-dashed border-slate-700 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-indigo-400/80 mx-auto" />
          <p className="text-sm font-medium text-slate-300">
            Khung hiển thị gói tiết kiệm on-chain đã sẵn sàng (N3 Scaffold).
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Dữ liệu sẽ tự động được nạp đầy đủ ở Phase 4 sau khi deploy contract và seed 3 gói on-chain.
          </p>
        </div>
      )}

      {plans.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.planId.toString()}
              className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/40">
                    Gói #{plan.planId.toString()}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      plan.enabled
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30'
                        : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
                    }`}
                  >
                    {plan.enabled ? 'Đang mở' : 'Tạm dừng'}
                  </span>
                </div>

                <div>
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {formatBps(plan.aprBps)}
                  </div>
                  <div className="text-xs text-slate-400 font-medium">Lãi suất năm (APR)</div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-700/60 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400 flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Kỳ hạn:</span>
                    </span>
                    <span className="font-semibold text-white">{plan.tenorDays.toString()} ngày</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Gửi tối thiểu:</span>
                    <span>
                      {plan.minDeposit === 0n ? 'Không giới hạn' : `${formatUnits6(plan.minDeposit)} USDC`}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Gửi tối đa:</span>
                    <span>
                      {plan.maxDeposit === 0n ? 'Không giới hạn' : `${formatUnits6(plan.maxDeposit)} USDC`}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-400">Phạt rút sớm:</span>
                    <span className="text-amber-400 font-medium">
                      {formatBps(plan.earlyWithdrawPenaltyBps)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onSelectPlan && onSelectPlan(plan)}
                disabled={!plan.enabled}
                className="mt-5 w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Mở sổ tiết kiệm</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
