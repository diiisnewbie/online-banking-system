/**
 * Utility quản lý bộ nhớ đệm TxHash và Metadata tất toán của từng chứng chỉ
 * Giúp giao diện hiển thị ngay lập tức TxHash trên từng card sổ mà không cần đợi RPC quét log lịch sử.
 */

export interface CertificateTxInfo {
  openTxHash?: string;
  settleTxHash?: string;
  isEarly?: boolean;
  principalPaid?: string;
  interestPaid?: string;
  penaltyDeducted?: string;
  renewedToId?: string;
}

const STORAGE_KEY = 'banking_certificate_tx_cache_v2';

export function getCertificateTxCache(): Record<string, CertificateTxInfo> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCertificateTxInfo(depositId: string, info: Partial<CertificateTxInfo>) {
  if (typeof window === 'undefined') return;
  try {
    const cache = getCertificateTxCache();
    cache[depositId] = {
      ...(cache[depositId] || {}),
      ...info,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Could not save certificate tx cache:', err);
  }
}

export function getSingleCertificateTxInfo(depositId: string): CertificateTxInfo | undefined {
  const cache = getCertificateTxCache();
  return cache[depositId];
}
