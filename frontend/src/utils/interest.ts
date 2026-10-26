/**
 * Replica độc lập công thức tính lãi _calcInterest từ smart contract
 * @param principal Tiền gốc (6 decimals, dạng BigInt)
 * @param aprBps Lãi suất năm theo bps (ví dụ 225n cho 2.25%)
 * @param tenorSeconds Kỳ hạn tính bằng giây (ví dụ 90n * 86400n)
 * @returns Tiền lãi (6 decimals, làm tròn floor)
 */
export function calculatePreviewInterest(
  principal: bigint,
  aprBps: bigint,
  tenorSeconds: bigint
): bigint {
  if (principal === 0n || aprBps === 0n || tenorSeconds === 0n) {
    return 0n;
  }
  const SECONDS_PER_YEAR = 365n * 86400n;
  const BPS_DIVISOR = 10000n;
  return (principal * aprBps * tenorSeconds) / (SECONDS_PER_YEAR * BPS_DIVISOR);
}
