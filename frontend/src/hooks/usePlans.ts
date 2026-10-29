import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { SavingPlan } from '../contracts/types';

export function usePlans(savingCore: ethers.Contract | null) {
  const [plans, setPlans] = useState<SavingPlan[]>([]);
  const [timeUnit, setTimeUnit] = useState<bigint>(86400n);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!savingCore) return;
    setIsLoading(true);
    setError(null);
    try {
      const [rawPlans, tu] = await Promise.all([
        savingCore.getAllPlans(),
        savingCore.timeUnit().catch(() => 86400n),
      ]);
      const contractTimeUnit = tu ? BigInt(tu) : 86400n;
      if (tu) {
        setTimeUnit(contractTimeUnit);
      }
      const parsedPlans: SavingPlan[] = await Promise.all(
        rawPlans.map(async (p: any) => {
          const planTu = await savingCore.getPlanTimeUnit(p.planId).catch(() => contractTimeUnit);
          return {
            planId: BigInt(p.planId),
            tenorDays: BigInt(p.tenorDays),
            aprBps: BigInt(p.aprBps),
            minDeposit: BigInt(p.minDeposit),
            maxDeposit: BigInt(p.maxDeposit),
            earlyWithdrawPenaltyBps: BigInt(p.earlyWithdrawPenaltyBps),
            enabled: Boolean(p.enabled),
            timeUnit: BigInt(planTu),
          };
        })
      );
      setPlans(parsedPlans);
    } catch (err: any) {
      console.warn('getAllPlans failed (expected if not deployed yet):', err);
      setError(err?.message || 'Không thể đọc danh sách gói on-chain');
    } finally {
      setIsLoading(false);
    }
  }, [savingCore]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return { plans, timeUnit, isLoading, error, refetchPlans: fetchPlans };
}
