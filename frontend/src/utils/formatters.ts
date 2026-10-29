/**
 * Format số dư token 6 decimals thành chuỗi định dạng dễ đọc (ví dụ: 1,000.50 USDC)
 */
export function formatUnits6(amount: bigint | undefined): string {
  if (amount === undefined) return '0.00';
  const isNegative = amount < 0n;
  const abs = isNegative ? -amount : amount;
  const whole = abs / 1_000_000n;
  const fraction = abs % 1_000_000n;
  const fractionStr = fraction.toString().padStart(6, '0').slice(0, 2);
  const formattedWhole = Number(whole).toLocaleString('en-US');
  return `${isNegative ? '-' : ''}${formattedWhole}.${fractionStr}`;
}

/**
 * Format lãi suất bps thành phần trăm (ví dụ: 225n -> "2.25%")
 */
export function formatBps(bps: bigint | undefined): string {
  if (bps === undefined) return '0.00%';
  const whole = bps / 100n;
  const frac = (bps % 100n).toString().padStart(2, '0');
  return `${whole}.${frac}%`;
}

/**
 * Format Unix timestamp (giây) thành chuỗi ngày giờ địa phương
 */
export function formatTimestamp(timestamp: bigint | undefined): string {
  if (!timestamp || timestamp === 0n) return '--';
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatTenorUnit(tenorVal: bigint, timeUnit: bigint = 86400n): string {
  if (timeUnit <= 60n) {
    return `${tenorVal.toString()} Phút`;
  }
  return `${tenorVal.toString()} Ngày`;
}

/**
 * Tính toán và format thời gian đếm ngược còn lại
 * @param maturityAt Mốc thời gian đáo hạn (giây)
 * @param currentSimulatedTime Thời gian EVM mô phỏng hiện tại (giây)
 */
export function formatCountdown(maturityAt: bigint, currentSimulatedTime: bigint): string {
  if (maturityAt <= currentSimulatedTime) {
    return 'Đã đáo hạn';
  }
  const diffSeconds = Number(maturityAt - currentSimulatedTime);
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  if (days > 0) {
    return `${days} ngày ${hours} giờ ${minutes} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ ${minutes} phút ${seconds} giây`;
  }
  return `${minutes} phút ${seconds} giây`;
}
