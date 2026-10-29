// smartcontract/config/variant.ts
// MSSV: 22699741
export const A = 1;   // chu so CUOI MSSV (1)
export const B = 4;   // chu so KE CUOI MSSV (4)

export const VARIANT = {
  gracePeriodSeconds: ((A % 3) + 2) * 86400,  // 259_200 (3 ngay)
  defaultAprBps: 200 + A * 25,                 // 225 bps (2.25%/nam)
  earlyPenaltyBps: 300 + B * 50,               // 500 bps (5.00%)
  defaultTenorDays: B % 2 === 0 ? 90 : 180,    // 90 ngay
} as const;

// Dung bigint de nhat quan voi BigInt so sanh trong test (tranh Number/BigInt mismatch)
export const PLAN0_MIN_DEPOSIT = 10_000_000n;       // 10 USDC
export const PLAN0_MAX_DEPOSIT = 100_000_000_000n;  // 100,000 USDC