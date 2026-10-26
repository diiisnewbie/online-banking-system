import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { SavingPlan } from '../contracts/types';

export function usePlans(savingCore: ethers.Contract | null) {
  const [plans, setPlans] = useState<SavingPlan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!savingCore) return;
    setIsLoading(true);
    setError(null);
    try {
      const rawPlans = await savingCore.getAllPlans();
      const parsedPlans: SavingPlan[] = rawPlans.map((p: any) => ({
        planId: BigInt(p.planId),
        tenorDays: BigInt(p.tenorDays),
        aprBps: BigInt(p.aprBps),
        minDeposit: BigInt(p.minDeposit),
        maxDeposit: BigInt(p.maxDeposit),
        earlyWithdrawPenaltyBps: BigInt(p.earlyWithdrawPenaltyBps),
        enabled: Boolean(p.enabled),
      }));
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

  return { plans, isLoading, error, refetchPlans: fetchPlans };
}
