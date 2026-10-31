import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { DepositCertificate } from '../contracts/types';
import { getCertificateTxCache, saveCertificateTxInfo } from '../utils/txStorage';

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
      const txCache = getCertificateTxCache();

      const parsedCerts: DepositCertificate[] = rawCerts.map((c: any) => {
        const dId = BigInt(c.depositId);
        const cached = txCache[dId.toString()];

        return {
          depositId: dId,
          planId: BigInt(c.planId),
          principal: BigInt(c.principal),
          startAt: BigInt(c.startAt),
          maturityAt: BigInt(c.maturityAt),
          aprBpsAtOpen: BigInt(c.aprBpsAtOpen),
          penaltyBpsAtOpen: BigInt(c.penaltyBpsAtOpen),
          status: Number(c.status),
          openTxHash: cached?.openTxHash,
          settleTxHash: cached?.settleTxHash,
          isEarly: cached?.isEarly,
          principalPaid: cached?.principalPaid ? BigInt(cached.principalPaid) : undefined,
          interestPaid: cached?.interestPaid ? BigInt(cached.interestPaid) : undefined,
          penaltyDeducted: cached?.penaltyDeducted ? BigInt(cached.penaltyDeducted) : undefined,
          renewedToDepositId: cached?.renewedToId ? BigInt(cached.renewedToId) : undefined,
        };
      });

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

      // 3. Quét sự kiện nền (Background Event Enrichment) để lấy txHash và chi tiết rút sớm/đúng hạn
      (async () => {
        try {
          const currentBlock = await savingCore.runner?.provider?.getBlockNumber();
          const fromBlock = currentBlock ? Math.max(0, currentBlock - 20000) : 0;

          const [openEvents, withdrawEvents, renewEvents] = await Promise.all([
            savingCore.queryFilter(savingCore.filters.DepositOpened(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.Withdrawn(null, account), fromBlock).catch(() => []),
            savingCore.queryFilter(savingCore.filters.Renewed(null, null), fromBlock).catch(() => []),
          ]);

          let hasUpdates = false;

          parsedCerts.forEach((cert) => {
            const idStr = cert.depositId.toString();

            // Tìm open event
            const openEv: any = (openEvents as any[]).find(
              (ev) => ev.args && ev.args.depositId && ev.args.depositId.toString() === idStr
            );
            if (openEv && openEv.transactionHash && cert.openTxHash !== openEv.transactionHash) {
              cert.openTxHash = openEv.transactionHash;
              saveCertificateTxInfo(idStr, { openTxHash: openEv.transactionHash });
              hasUpdates = true;
            }

            // Tìm withdraw event
            const withEv: any = (withdrawEvents as any[]).find(
              (ev) => ev.args && ev.args.depositId && ev.args.depositId.toString() === idStr
            );
            if (withEv && withEv.transactionHash) {
              const isEarly = Boolean(withEv.args.isEarly);
              const pPaid = BigInt(withEv.args.principal);
              const iPaid = BigInt(withEv.args.interest);
              const penalty = isEarly ? (cert.principal * cert.penaltyBpsAtOpen) / 10000n : 0n;

              cert.settleTxHash = withEv.transactionHash;
              cert.isEarly = isEarly;
              cert.principalPaid = pPaid;
              cert.interestPaid = iPaid;
              cert.penaltyDeducted = penalty;

              saveCertificateTxInfo(idStr, {
                settleTxHash: withEv.transactionHash,
                isEarly,
                principalPaid: pPaid.toString(),
                interestPaid: iPaid.toString(),
                penaltyDeducted: penalty.toString(),
              });
              hasUpdates = true;
            }

            // Tìm renew event
            const renEv: any = (renewEvents as any[]).find(
              (ev) => ev.args && ev.args.oldDepositId && ev.args.oldDepositId.toString() === idStr
            );
            if (renEv && renEv.transactionHash) {
              const nextId = BigInt(renEv.args.newDepositId);
              cert.settleTxHash = renEv.transactionHash;
              cert.renewedToDepositId = nextId;

              saveCertificateTxInfo(idStr, {
                settleTxHash: renEv.transactionHash,
                renewedToId: nextId.toString(),
              });
              hasUpdates = true;
            }
          });

          if (hasUpdates) {
            setCertificates([...parsedCerts]);
          }
        } catch (enrichErr) {
          console.warn('Background event enrichment error:', enrichErr);
        }
      })();
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

