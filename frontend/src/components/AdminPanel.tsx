import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { formatUnits6 } from '../utils/formatters';
import { parseContractError } from '../utils/errors';
import { useToast } from './ui/ToastContext';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Stat } from './ui/Stat';
import {
  Shield,
  Coins,
  Pause,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
  Wallet,
  Activity,
} from 'lucide-react';

interface AdminPanelProps {
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  account: string | null;
  refreshTrigger?: number;
  onSuccess: () => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  savingCore,
  vault,
  usdc,
  account,
  refreshTrigger,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [coreOwner, setCoreOwner] = useState<string | null>(null);
  const [vaultOwner, setVaultOwner] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [feeReceiver, setFeeReceiver] = useState<string | null>(null);

  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [committedInterest, setCommittedInterest] = useState<bigint>(0n);
  const [userUsdcBalance, setUserUsdcBalance] = useState<bigint>(0n);

  const [fundAmountStr, setFundAmountStr] = useState<string>('5000');
  const [withdrawAmountStr, setWithdrawAmountStr] = useState<string>('1000');
  const [newFeeReceiver, setNewFeeReceiver] = useState<string>('');

  const [isFunding, setIsFunding] = useState<boolean>(false);
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [isPausing, setIsPausing] = useState<boolean>(false);
  const [isSettingFee, setIsSettingFee] = useState<boolean>(false);

  const loadAdminData = async () => {
    if (!savingCore || !vault || !usdc) return;
    try {
      const vAddr = await vault.getAddress();
      const [cOwner, vOwner, pausedState, fReceiver, vBal, committed, uBal] = await Promise.all([
        savingCore.owner().catch(() => null),
        vault.owner().catch(() => null),
        vault.paused().catch(() => false),
        vault.feeReceiver().catch(() => null),
        usdc.balanceOf(vAddr).catch(() => 0n),
        savingCore.totalCommittedInterest().catch(() => 0n),
        account ? usdc.balanceOf(account).catch(() => 0n) : 0n,
      ]);

      setCoreOwner(cOwner);
      setVaultOwner(vOwner);
      setIsPaused(pausedState);
      setFeeReceiver(fReceiver);
      setVaultBalance(BigInt(vBal));
      setCommittedInterest(BigInt(committed));
      setUserUsdcBalance(BigInt(uBal));
    } catch (err) {
      console.warn('Lỗi đọc dữ liệu Admin:', err);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [savingCore, vault, usdc, account, refreshTrigger]);

  const isUserCoreOwner =
    account && coreOwner && account.toLowerCase() === coreOwner.toLowerCase();
  const isUserVaultOwner =
    account && vaultOwner && account.toLowerCase() === vaultOwner.toLowerCase();

  // Tính hạn mức an toàn tối đa cho phép rút khỏi Vault theo Solvency Guard C2
  const maxSafeWithdraw = vaultBalance > committedInterest ? vaultBalance - committedInterest : 0n;

  // Tính Coverage Ratio (%) và phân màu
  let coverageRatio = 100;
  let coverageColor = 'bg-emerald-500';
  let coverageTextColor = 'text-emerald-400';
  let coverageBadgeVariant: 'success' | 'warning' | 'danger' = 'success';
  let coverageStatusText = 'Bảo đảm an toàn tuyệt đối (100%+)';

  if (committedInterest > 0n) {
    coverageRatio = Math.round(Number((vaultBalance * 100n) / committedInterest));
    if (coverageRatio >= 100) {
      coverageColor = 'bg-emerald-500';
      coverageTextColor = 'text-emerald-400';
      coverageBadgeVariant = 'success';
      coverageStatusText = 'Bảo đảm thanh khoản an toàn';
    } else if (coverageRatio >= 60) {
      coverageColor = 'bg-amber-500';
      coverageTextColor = 'text-amber-400';
      coverageBadgeVariant = 'warning';
      coverageStatusText = 'Cảnh báo: Dưới mức cam kết';
    } else {
      coverageColor = 'bg-rose-500';
      coverageTextColor = 'text-rose-400';
      coverageBadgeVariant = 'danger';
      coverageStatusText = 'Báo động: Nguy cơ kích hoạt nợ C1';
    }
  }

  // 1. Nạp quỹ Fund Vault
  const handleFundVault = async () => {
    if (!vault || !usdc || !fundAmountStr) return;
    setIsFunding(true);
    try {
      const amount = ethers.parseUnits(fundAmountStr, 6);
      const vAddr = await vault.getAddress();
      const currentAllowance = await usdc.allowance(account, vAddr);

      if (BigInt(currentAllowance) < amount) {
        const approveTx = await usdc.approve(vAddr, amount);
        await approveTx.wait();
      }

      const tx = await vault.fundVault(amount);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Nạp thành công ${fundAmountStr} USDC vào quỹ dự trữ trả lãi (Vault)!`,
        {
          title: 'Nạp Quỹ Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Nạp Quỹ Thất Bại' });
    } finally {
      setIsFunding(false);
    }
  };

  // 2. Rút quỹ Withdraw Vault
  const handleWithdrawVault = async () => {
    if (!vault || !withdrawAmountStr) return;
    setIsWithdrawing(true);
    try {
      const amount = ethers.parseUnits(withdrawAmountStr, 6);
      const tx = await vault.withdrawVault(amount);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Rút thành công ${withdrawAmountStr} USDC từ quỹ Vault về ví admin!`,
        {
          title: 'Rút Vốn Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Rút Vốn Bị Chặn (Solvency Guard)' });
    } finally {
      setIsWithdrawing(false);
    }
  };

  // 3. Tạm dừng / Tiếp tục hệ thống
  const handleTogglePause = async () => {
    if (!vault) return;
    setIsPausing(true);
    try {
      const tx = isPaused ? await vault.unpause() : await vault.pause();
      const receipt = await tx.wait();
      addToast(
        isPaused ? 'success' : 'warning',
        isPaused
          ? 'Hệ thống đã được gỡ tạm dừng (Unpaused). Mọi giao dịch hoạt động lại bình thường.'
          : 'Hệ thống đã được tạm dừng khẩn cấp (Paused). Các thao tác mở sổ và tái tục đã bị khóa.',
        {
          title: isPaused ? 'Đã Tiếp Tục Hệ Thống' : 'Đã Tạm Dừng Khẩn Cấp',
          txHash: receipt?.hash || tx.hash,
        }
      );
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Thao Tác Thất Bại' });
    } finally {
      setIsPausing(false);
    }
  };

  // 4. Cập nhật feeReceiver
  const handleSetFeeReceiver = async () => {
    if (!vault || !newFeeReceiver || !ethers.isAddress(newFeeReceiver)) {
      addToast('error', 'Địa chỉ ví thu phạt không hợp lệ.', { title: 'Địa Chỉ Sai' });
      return;
    }
    setIsSettingFee(true);
    try {
      const tx = await vault.setFeeReceiver(newFeeReceiver);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Đã cập nhật ví nhận phạt rút sớm thành: ${newFeeReceiver.slice(0, 8)}...${newFeeReceiver.slice(-6)}`,
        {
          title: 'Cập Nhật Fee Receiver',
          txHash: receipt?.hash || tx.hash,
        }
      );
      setNewFeeReceiver('');
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Cập Nhật Thất Bại' });
    } finally {
      setIsSettingFee(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Verification Header */}
      <Card className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-indigo-500/20 bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-950/80 text-indigo-400 rounded-2xl border border-indigo-700/50 shadow-inner">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-white text-lg tracking-tight flex items-center space-x-2">
              <span>Bảng Điều Khiển Quản Trị Hệ Thống (Bank Admin)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Giám sát thanh khoản dự trữ, Solvency Guard C2 và cơ chế kiểm soát khẩn cấp.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <Badge variant={isUserVaultOwner ? 'success' : 'neutral'} dot={!!isUserVaultOwner}>
            Vault Owner: {isUserVaultOwner ? 'Có quyền' : 'Không có quyền'}
          </Badge>
          <Badge variant={isUserCoreOwner ? 'success' : 'neutral'} dot={!!isUserCoreOwner}>
            Core Owner: {isUserCoreOwner ? 'Có quyền' : 'Không có quyền'}
          </Badge>
        </div>
      </Card>

      {/* 2 Thẻ Số Liệu Lớn & Thanh Coverage Solvency Guard C2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Stat
          label="Số Dư Quỹ Trả Lãi (Vault Balance)"
          value={`${formatUnits6(vaultBalance)} USDC`}
          subValue="Tổng tài sản thanh khoản thực tế trong hợp đồng VaultManager"
          icon={<Coins className="w-5 h-5 text-emerald-400" />}
          variant="emerald"
        />

        <Stat
          label="Tổng Nghĩa Vụ Trả Lãi (Total Committed Interest)"
          value={`${formatUnits6(committedInterest)} USDC`}
          subValue="Cam kết bất biến đã cấp cho các sổ đang hoạt động (Solvency Guard C2)"
          icon={<Activity className="w-5 h-5 text-amber-400" />}
          variant="amber"
        />
      </div>

      {/* Thanh Tỷ Lệ Bảo Đảm Thanh Khoản (Coverage Ratio Bar) */}
      <Card className="p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <span>Tỷ Lệ Bảo Đảm Thanh Khoản (Solvency Coverage Ratio)</span>
              <Badge variant={coverageBadgeVariant} dot size="sm">
                {coverageStatusText}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-400">
              Công thức: (Vault Balance ÷ Total Committed) × 100%
            </div>
          </div>

          <div className="text-right">
            <span className={`text-2xl font-black tabular-nums tracking-tight ${coverageTextColor}`}>
              {committedInterest === 0n ? '100% (An toàn)' : `${coverageRatio}%`}
            </span>
          </div>
        </div>

        {/* Progress Bar đổi màu xanh -> vàng -> đỏ */}
        <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden p-0.5 border border-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${coverageColor}`}
            style={{ width: `${Math.min(100, Math.max(5, coverageRatio))}%` }}
          />
        </div>

        {/* Hạn mức rút an toàn */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
          <div className="text-slate-400">
            Hạn Mức Rút Vốn An Toàn Cho Phép: <code className="text-slate-300">max(0, Balance − Committed)</code>
          </div>
          <div className="font-mono font-black text-sm text-emerald-400 tabular-nums">
            {formatUnits6(maxSafeWithdraw)} USDC
          </div>
        </div>
      </Card>

      {/* Grid 2 Cột: Quản Lý Nạp / Rút & Chế Độ Khẩn Cấp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Nạp & Rút Vốn */}
        <Card className="p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
              <Wallet className="w-4 h-4" />
              <span>Nạp & Rút Quỹ Trả Lãi (Vault Liquidity)</span>
            </div>
          </div>

          {/* Form Nạp Quỹ */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label className="font-semibold text-slate-300">Nạp thêm vốn vào Vault (Fund Vault):</label>
              <span className="text-slate-400 text-[11px]">
                Ví của bạn: <strong className="text-slate-200 tabular-nums">{formatUnits6(userUsdcBalance)}</strong> USDC
              </span>
            </div>
            <div className="flex space-x-2">
              <input
                type="number"
                value={fundAmountStr}
                onChange={(e) => setFundAmountStr(e.target.value)}
                placeholder="5000"
                className="flex-1 bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 tabular-nums"
              />
              <Button
                variant="primary"
                size="md"
                isLoading={isFunding}
                loadingText="Đang nạp..."
                disabled={!isUserVaultOwner}
                disabledReason={!isUserVaultOwner ? 'Chỉ Owner của VaultManager mới có quyền nạp' : undefined}
                onClick={handleFundVault}
                icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
              >
                Nạp Quỹ
              </Button>
            </div>
          </div>

          {/* Form Rút Quỹ (Có Chốt Chặn Solvency Guard C2) */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex justify-between text-xs">
              <label className="font-semibold text-slate-300">Rút vốn khỏi Vault (Withdraw Vault):</label>
              <span className="text-slate-400 text-[11px]">
                Tối đa: <strong className="text-emerald-400 tabular-nums">{formatUnits6(maxSafeWithdraw)}</strong> USDC
              </span>
            </div>
            <div className="flex space-x-2">
              <input
                type="number"
                value={withdrawAmountStr}
                onChange={(e) => setWithdrawAmountStr(e.target.value)}
                placeholder="1000"
                className="flex-1 bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 tabular-nums"
              />
              <Button
                variant="danger"
                size="md"
                isLoading={isWithdrawing}
                loadingText="Đang rút..."
                disabled={!isUserVaultOwner || maxSafeWithdraw === 0n}
                disabledReason={
                  !isUserVaultOwner
                    ? 'Chỉ Owner mới có quyền rút vốn'
                    : maxSafeWithdraw === 0n
                    ? 'Hạn mức rút an toàn = 0 do toàn bộ quỹ đang cam kết trả lãi'
                    : undefined
                }
                onClick={handleWithdrawVault}
                icon={<ArrowUpFromLine className="w-3.5 h-3.5" />}
              >
                Rút Vốn
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              * Solvency Guard C2 sẽ tự động revert nếu số tiền rút làm giảm số dư Vault xuống thấp hơn tổng nghĩa vụ đã cam kết ({formatUnits6(committedInterest)} USDC).
            </p>
          </div>
        </Card>

        {/* Card 2: Chế Độ Khẩn Cấp & Cấu Hình Ví Thu Phạt */}
        <Card className="p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Chế Độ Khẩn Cấp & Cấu Hình Ví Phạt</span>
            </div>
          </div>

          {/* Trạng thái Pause */}
          <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-400 font-medium">Trạng Thái Toàn Hệ Thống:</div>
              <div className="text-sm font-extrabold mt-1 flex items-center space-x-2">
                {isPaused ? (
                  <span className="text-rose-400 flex items-center space-x-1.5">
                    <Lock className="w-4 h-4 animate-pulse" />
                    <span>TẠM DỪNG (PAUSED)</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>HOẠT ĐỘNG BÌNH THƯỜNG</span>
                  </span>
                )}
              </div>
            </div>

            <Button
              variant={isPaused ? 'emerald' : 'danger'}
              size="md"
              isLoading={isPausing}
              loadingText="Đang xử lý..."
              disabled={!isUserVaultOwner}
              disabledReason={!isUserVaultOwner ? 'Chỉ Owner của VaultManager mới có quyền đổi trạng thái' : undefined}
              onClick={handleTogglePause}
              icon={isPaused ? <Unlock className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            >
              {isPaused ? 'Tiếp Tục (Unpause)' : 'Tạm Dừng Khẩn Cấp'}
            </Button>
          </div>

          {/* Cấu hình Fee Receiver */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="text-xs space-y-1">
              <label className="font-semibold text-slate-300">Ví Nhận Phạt Rút Sớm (Fee Receiver):</label>
              <div className="font-mono text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg break-all border border-slate-800">
                {feeReceiver || 'Đang tải...'}
              </div>
            </div>

            <div className="flex space-x-2">
              <input
                type="text"
                value={newFeeReceiver}
                onChange={(e) => setNewFeeReceiver(e.target.value)}
                placeholder="0x... Địa chỉ ví mới"
                className="flex-1 bg-slate-950/80 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <Button
                variant="secondary"
                size="md"
                isLoading={isSettingFee}
                loadingText="Đang lưu..."
                disabled={!isUserVaultOwner || !newFeeReceiver}
                onClick={handleSetFeeReceiver}
              >
                Cập Nhật
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              * Dùng để tách biệt ví nhận phạt (ví dụ Account #2) để chứng minh dòng tiền phạt khi quay demo.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
