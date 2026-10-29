import React from 'react';
import { SavingPlan } from '../contracts/types';
import { formatBps, formatUnits6 } from '../utils/formatters';
import { TrendingUp, AlertCircle, Calendar, Coins } from 'lucide-react';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { CardSkeleton } from './ui/Skeleton';

interface PlansListProps {
  plans: SavingPlan[];
  isLoading: boolean;
  error: string | null;
  timeUnit?: bigint;
  onSelectPlan?: (plan: SavingPlan) => void;
}

export const PlansList: React.FC<PlansListProps> = ({
  plans,
  isLoading,
  error,
  timeUnit,
  onSelectPlan,
}) => {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            <span>Các Gói Tiết Kiệm Kỳ Hạn</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Lãi suất cam kết cố định theo mô hình Snapshot APR, không chịu rủi ro biến động thị trường.
          </p>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          Nguồn: <code className="text-indigo-400">SavingCore.getAllPlans()</code>
        </div>
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {/* Error / Empty Scaffold */}
      {error && plans.length === 0 && !isLoading && (
        <Card className="p-8 text-center space-y-3 max-w-md mx-auto border-dashed">
          <div className="w-12 h-12 bg-rose-950/60 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-800/50">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Chưa Có Gói Tiết Kiệm Nào</h4>
            <p className="text-xs text-slate-400 mt-1">
              {error || 'Vui lòng kiểm tra kết nối với node blockchain Hardhat.'}
            </p>
          </div>
        </Card>
      )}

      {/* Plans Grid */}
      {plans.length > 0 && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const isEnabled = plan.enabled;

            return (
              <Card
                key={plan.planId.toString()}
                variant="interactive"
                className={`p-6 flex flex-col justify-between relative overflow-hidden transition-all ${
                  !isEnabled ? 'opacity-60 grayscale-[40%]' : ''
                }`}
              >
                {/* Decorative Top Accent line */}
                {isEnabled && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-emerald-400" />
                )}

                <div className="space-y-4">
                  {/* Card Header: Plan ID + Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
                      Gói #{plan.planId.toString()}
                    </span>

                    <Badge variant={isEnabled ? 'success' : 'danger'} dot={isEnabled}>
                      {isEnabled ? 'Đang mở' : 'Tạm dừng'}
                    </Badge>
                  </div>

                  {/* Tenor Display (To, rõ ràng) */}
                  <div className="pt-1">
                    <div className="flex items-baseline space-x-1.5">
                      <span className="text-3xl font-black text-white tracking-tight tabular-nums">
                        {plan.tenorDays.toString()}
                      </span>
                      <span className="text-sm font-bold text-slate-400">
                        {timeUnit && timeUnit <= 60n ? 'Phút' : 'Ngày'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">Kỳ hạn gửi cố định</div>
                  </div>

                  {/* APR (Nổi bật) */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">Lãi suất năm (APR)</div>
                      <div className="text-2xl font-black text-emerald-400 tracking-tight tabular-nums mt-0.5">
                        {formatBps(plan.aprBps)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-medium">Phạt rút sớm</div>
                      <div className="text-sm font-bold text-amber-400 tabular-nums mt-0.5">
                        {formatBps(plan.earlyWithdrawPenaltyBps)}
                      </div>
                    </div>
                  </div>

                  {/* Parameters Details */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/60 text-xs">
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <Coins className="w-3.5 h-3.5 text-slate-500" />
                        <span>Gửi tối thiểu:</span>
                      </span>
                      <span className="font-semibold text-slate-200 tabular-nums">
                        {plan.minDeposit === 0n ? 'Không giới hạn' : `${formatUnits6(plan.minDeposit)} USDC`}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <Coins className="w-3.5 h-3.5 text-slate-500" />
                        <span>Gửi tối đa:</span>
                      </span>
                      <span className="font-semibold text-slate-200 tabular-nums">
                        {plan.maxDeposit === 0n ? 'Không giới hạn' : `${formatUnits6(plan.maxDeposit)} USDC`}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>Thời gian ân hạn:</span>
                      </span>
                      <span className="font-semibold text-slate-300">3 Ngày</span>
                    </div>
                  </div>
                </div>

                {/* Action CTA */}
                <div className="pt-6">
                  <Button
                    variant={isEnabled ? 'primary' : 'secondary'}
                    size="md"
                    disabled={!isEnabled}
                    disabledReason={!isEnabled ? 'Gói tiết kiệm này hiện đang tạm dừng tiếp nhận' : undefined}
                    onClick={() => onSelectPlan && onSelectPlan(plan)}
                    className="w-full"
                    icon={<TrendingUp className="w-4 h-4" />}
                  >
                    {isEnabled ? 'Gửi Tiết Kiệm' : 'Đã Tạm Dừng'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
