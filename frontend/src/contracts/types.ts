export enum DepositStatus {
  Active = 0,
  Withdrawn = 1,
  ManualRenewed = 2,
  AutoRenewed = 3,
}

export interface SavingPlan {
  planId: bigint;
  tenorDays: bigint;
  aprBps: bigint;
  minDeposit: bigint;
  maxDeposit: bigint;
  earlyWithdrawPenaltyBps: bigint;
  enabled: boolean;
}

export interface DepositCertificate {
  depositId: bigint;
  planId: bigint;
  principal: bigint;
  startAt: bigint;
  maturityAt: bigint;
  aprBpsAtOpen: bigint;
  penaltyBpsAtOpen: bigint;
  status: DepositStatus;
}
