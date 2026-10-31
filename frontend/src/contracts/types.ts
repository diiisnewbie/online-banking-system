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
  timeUnit?: bigint;
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
  // Metadata mở rộng hỗ trợ Audit & Demo Etherscan
  openTxHash?: string;
  settleTxHash?: string;
  claimTxHash?: string;
  isEarly?: boolean;
  isDeferred?: boolean;
  principalPaid?: bigint;
  interestPaid?: bigint;
  penaltyDeducted?: bigint;
  renewedToDepositId?: bigint;
}
