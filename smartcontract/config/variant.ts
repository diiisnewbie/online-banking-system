// smartcontract/config/variant.ts
export const A = 1;   // ch? s? CU?I MSSV
export const B = 4;   // ch? s? K? CU?I MSSV

export const VARIANT = {
  gracePeriodSeconds: ((A % 3) + 2) * 86400,  // 259_200 (3 ngày)
  defaultAprBps: 200 + A * 25,                 // 225
  earlyPenaltyBps: 300 + B * 50,               // 500
  defaultTenorDays: B % 2 === 0 ? 90 : 180,    // 90
} as const;

// Dùng bigint d? nh?t quán v?i BigInt so sánh trong test (tránh Number/BigInt mismatch)
export const PLAN0_MIN_DEPOSIT = 10_000_000n;       // 10 USDC
export const PLAN0_MAX_DEPOSIT = 100_000_000_000n;  // 100,000 USDC
