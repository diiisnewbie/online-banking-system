import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate } from '../contracts/types';

export function useCertificates(
  savingCore: ethers.Contract | null,
  account: string | null,
  refreshTrigger: number = 0
) {
  const [certificates, setCertificates] = useState<DepositCertificate[]>([]);
  const [unpaidMap, setUnpaidMap] = useState<Record<string, bigint>>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCertificates = useCallback(async (isBackground: boolean = false) => {
    if (!savingCore || !account || account === ethers.ZeroAddress) {
      setCertificates([]);
      setUnpaidMap({});
      return;
    }

    if (!isBackground) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // 1. Lấy toàn bộ chứng chỉ của account on-chain
      const rawCerts = await savingCore.getCertificatesOfOwner(account);

      const parsedCerts: DepositCertificate[] = rawCerts.map((c: any) => ({
        depositId: BigInt(c.depositId),
        planId: BigInt(c.planId),
        principal: BigInt(c.principal),
        startAt: BigInt(c.startAt),
        maturityAt: BigInt(c.maturityAt),
        aprBpsAtOpen: BigInt(c.aprBpsAtOpen),
        penaltyBpsAtOpen: BigInt(c.penaltyBpsAtOpen),
        status: Number(c.status),
      }));

      // 2. Truy vấn số nợ lãi C1 unpaidInterest cho từng cert
      const debtEntries = await Promise.all(
        parsedCerts.map(async (cert) => {
          try {
            const unpaid = await savingCore.unpaidInterest(cert.depositId);
            return [cert.depositId.toString(), BigInt(unpaid)] as const;
          } catch {
            return [cert.depositId.toString(), 0n] as const;
          }
        })
      );

      const debts: Record<string, bigint> = {};
      debtEntries.forEach(([id, debt]) => {
        debts[id] = debt;
      });

      // Sắp xếp chứng chỉ mới nhất lên đầu
      parsedCerts.sort((a, b) => Number(b.depositId - a.depositId));

      setCertificates(parsedCerts);
      setUnpaidMap(debts);
    } catch (err: any) {
      console.error('Error fetching certificates:', err);
      setError(err?.message || 'Không thể tải danh sách chứng chỉ tiền gửi.');
    } finally {
      setIsLoading(false);
    }
  }, [savingCore, account]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates, refreshTrigger]);

  return {
    certificates,
    unpaidMap,
    isLoading,
    error,
    refetch: fetchCertificates,
  };
}

