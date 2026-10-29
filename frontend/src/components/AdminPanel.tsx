import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { SavingPlan } from '../contracts/types';
import { formatUnits6, formatBps, formatTenorUnit } from '../utils/formatters';
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
  Layers,
  Ban,
  Power,
  Plus,
  Edit3,
} from 'lucide-react';
import { Modal } from './ui/Modal';

interface AdminPanelProps {
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  account: string | null;
  plans?: SavingPlan[];
  timeUnit?: bigint;
  refreshTrigger?: number;
  onSuccess: () => Promise<void>;
  onRefetchPlans?: () => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  savingCore,
  vault,
  usdc,
  account,
  plans,
  timeUnit,
  refreshTrigger,
  onSuccess,
  onRefetchPlans,
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
  const [togglingPlanId, setTogglingPlanId] = useState<bigint | null>(null);

  // States for Plan Management
  const [isUpdateAprModalOpen, setIsUpdateAprModalOpen] = useState<boolean>(false);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<SavingPlan | null>(null);
  const [newAprInput, setNewAprInput] = useState<string>('');
  const [isSubmittingApr, setIsSubmittingApr] = useState<boolean>(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createUnit, setCreateUnit] = useState<'minutes' | 'days'>('minutes');
  const [createTenor, setCreateTenor] = useState<string>('5');
  const [createApr, setCreateApr] = useState<string>('2.25');
  const [createPenalty, setCreatePenalty] = useState<string>('5.0');
  const [createMinDeposit, setCreateMinDeposit] = useState<string>('10');
  const [createMaxDeposit, setCreateMaxDeposit] = useState<string>('100000');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

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

  // 5. Bật / Vô hiệu hóa gói tiết kiệm (enablePlan / disablePlan)
  const handleTogglePlan = async (planId: bigint, currentlyEnabled: boolean) => {
    if (!savingCore) return;
    setTogglingPlanId(planId);
    try {
      const tx = currentlyEnabled
        ? await savingCore.disablePlan(planId)
        : await savingCore.enablePlan(planId);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Đã ${currentlyEnabled ? 'vô hiệu hóa' : 'kích hoạt lại'} Gói #${planId.toString()} thành công!`,
        {
          title: 'Quản Lý Gói Tiết Kiệm',
          txHash: receipt?.hash || tx.hash,
        }
      );
      if (onRefetchPlans) await onRefetchPlans();
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      console.error('Toggle plan failed:', err);
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Thao Tác Thất Bại' });
    } finally {
      setTogglingPlanId(null);
    }
  };

  // Mở modal sửa APR
  const handleOpenEditApr = (plan: SavingPlan) => {
    setSelectedPlanForEdit(plan);
    const currentPercent = (Number(plan.aprBps) / 100).toString();
    setNewAprInput(currentPercent);
    setIsUpdateAprModalOpen(true);
  };

  // 6. Cập nhật APR gói (updatePlan)
  const handleUpdateApr = async () => {
    if (!savingCore || !selectedPlanForEdit) return;
    const aprNum = parseFloat(newAprInput);
    if (isNaN(aprNum) || aprNum <= 0 || aprNum > 100) {
      addToast('error', 'Lãi suất APR phải lớn hơn 0% và không vượt quá 100% (10,000 BPS).', {
        title: 'APR Không Hợp Lệ',
      });
      return;
    }

    setIsSubmittingApr(true);
    try {
      const newAprBps = BigInt(Math.round(aprNum * 100));
      const tx = await savingCore.updatePlan(selectedPlanForEdit.planId, newAprBps);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Cập nhật thành công APR Gói #${selectedPlanForEdit.planId.toString()} thành ${aprNum}%!`,
        {
          title: 'Cập Nhật APR Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );
      setIsUpdateAprModalOpen(false);
      setSelectedPlanForEdit(null);
      if (onRefetchPlans) await onRefetchPlans();
      await onSuccess();
    } catch (err: any) {
      console.error('Update plan APR failed:', err);
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Cập Nhật APR Thất Bại' });
    } finally {
      setIsSubmittingApr(false);
    }
  };

  // 7. Tạo gói tiết kiệm mới (createPlan)
  const handleCreatePlan = async () => {
    if (!savingCore) return;
    const tenorNum = parseInt(createTenor, 10);
    const aprNum = parseFloat(createApr);
    const penaltyNum = parseFloat(createPenalty);
    const minNum = parseFloat(createMinDeposit);
    const maxNum = createMaxDeposit ? parseFloat(createMaxDeposit) : 0;

    if (isNaN(tenorNum) || tenorNum < 1 || tenorNum > 3650) {
      addToast('error', 'Kỳ hạn phải từ 1 đến 3650 đơn vị.', { title: 'Kỳ Hạn Không Hợp Lệ' });
      return;
    }
    if (isNaN(aprNum) || aprNum <= 0 || aprNum > 100) {
      addToast('error', 'APR phải từ 0.01% đến 100.00%.', { title: 'APR Không Hợp Lệ' });
      return;
    }
    if (isNaN(penaltyNum) || penaltyNum < 0 || penaltyNum > 100) {
      addToast('error', 'Tỷ lệ phạt rút sớm phải từ 0% đến 100%.', { title: 'Phạt Rút Sớm Không Hợp Lệ' });
      return;
    }
    if (isNaN(minNum) || minNum < 0) {
      addToast('error', 'Số tiền gửi tối thiểu không hợp lệ.', { title: 'Hạn Mức Không Hợp Lệ' });
      return;
    }
    if (maxNum > 0 && maxNum < minNum) {
      addToast('error', 'Hạn mức tối đa phải lớn hơn hoặc bằng tối thiểu.', { title: 'Hạn Mức Không Hợp Lệ' });
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const tenorBn = BigInt(tenorNum);
      const aprBpsBn = BigInt(Math.round(aprNum * 100));
      const penaltyBpsBn = BigInt(Math.round(penaltyNum * 100));
      const minDepositBn = ethers.parseUnits(minNum.toString(), 6);
      const maxDepositBn = maxNum > 0 ? ethers.parseUnits(maxNum.toString(), 6) : 0n;
      const unitSeconds = createUnit === 'minutes' ? 60n : 86400n;

      const tx = savingCore.createPlanWithCustomUnit
        ? await savingCore.createPlanWithCustomUnit(tenorBn, aprBpsBn, minDepositBn, maxDepositBn, penaltyBpsBn, unitSeconds)
        : await savingCore.createPlan(tenorBn, aprBpsBn, minDepositBn, maxDepositBn, penaltyBpsBn);
      const receipt = await tx.wait();
      addToast(
        'success',
        `Tạo mới gói kỳ hạn ${tenorNum} ${createUnit === 'minutes' ? 'Phút' : 'Ngày'}, APR ${aprNum}% thành công!`,
        {
          title: 'Tạo Gói Mới Thành Công',
          txHash: receipt?.hash || tx.hash,
        }
      );
      setIsCreateModalOpen(false);
      setCreateTenor('5');
      setCreateApr('2.25');
      setCreatePenalty('5.0');
      setCreateMinDeposit('10');
      setCreateMaxDeposit('100000');
      if (onRefetchPlans) await onRefetchPlans();
      await onSuccess();
    } catch (err: any) {
      console.error('Create plan failed:', err);
      const errText = parseContractError(err, { core: savingCore, vault });
      addToast('error', errText, { title: 'Tạo Gói Thất Bại' });
    } finally {
      setIsSubmittingCreate(false);
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

      {/* Card 3: Quản Lý Gói Tiết Kiệm (Tạo, Sửa APR, Bật / Vô hiệu hóa) */}
      <Card variant="default" className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-950/80 text-indigo-400 rounded-xl border border-indigo-800/40">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Quản Lý Gói Tiết Kiệm (Plan Controls)</h3>
              <p className="text-xs text-slate-400">
                Thêm gói mới, điều chỉnh lãi suất APR, hoặc bật / vô hiệu hóa nhận khoản gửi mới.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="info">
              {plans?.length || 0} Gói trên hệ thống
            </Badge>
            <Button
              variant="primary"
              size="sm"
              disabled={!isUserCoreOwner}
              disabledReason={!isUserCoreOwner ? 'Chỉ Owner của SavingCore mới có quyền tạo gói' : undefined}
              onClick={() => setIsCreateModalOpen(true)}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Tạo Gói Mới
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {plans && plans.length > 0 ? (
            plans.map((p) => {
              const isCurrentlyEnabled = p.enabled;
              const isToggling = togglingPlanId === p.planId;
              return (
                <div
                  key={p.planId.toString()}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                    isCurrentlyEnabled
                      ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                      : 'bg-rose-950/15 border-rose-900/40 opacity-80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-indigo-300 border border-slate-800">
                        Gói #{p.planId.toString()}
                      </span>
                      <Badge variant={isCurrentlyEnabled ? 'success' : 'danger'} dot>
                        {isCurrentlyEnabled ? 'Đang mở' : 'Đã vô hiệu hóa'}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between">
                      <div className="text-xl font-black text-white tabular-nums">
                        {formatTenorUnit(p.tenorDays, p.timeUnit || timeUnit)}
                      </div>
                      <div className="text-sm font-bold text-emerald-400 tabular-nums">
                        APR {formatBps(p.aprBps)}
                      </div>
                    </div>

                    <div className="mt-1 text-[11px] text-slate-400 flex justify-between">
                      <span>Phạt rút sớm: <strong className="text-amber-400">{formatBps(p.earlyWithdrawPenaltyBps)}</strong></span>
                      <span>Hạn mức: <strong className="text-slate-300">{p.minDeposit > 0n ? formatUnits6(p.minDeposit) : '0'} USDC</strong></span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!isUserCoreOwner}
                      disabledReason={!isUserCoreOwner ? 'Chỉ Owner của SavingCore mới có quyền sửa APR' : undefined}
                      onClick={() => handleOpenEditApr(p)}
                      icon={<Edit3 className="w-3.5 h-3.5" />}
                    >
                      Sửa APR
                    </Button>
                    <Button
                      variant={isCurrentlyEnabled ? 'danger' : 'emerald'}
                      size="sm"
                      isLoading={isToggling}
                      loadingText="..."
                      disabled={!isUserCoreOwner}
                      disabledReason={!isUserCoreOwner ? 'Chỉ Owner của SavingCore mới có quyền đổi trạng thái gói' : undefined}
                      onClick={() => handleTogglePlan(p.planId, isCurrentlyEnabled)}
                      icon={isCurrentlyEnabled ? <Ban className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                    >
                      {isCurrentlyEnabled ? 'Vô Hiệu Hóa' : 'Kích Hoạt'}
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-8 text-center text-slate-500 text-xs">
              Chưa có gói tiết kiệm nào trên hệ thống
            </div>
          )}
        </div>
      </Card>

      {/* Modal: Sửa APR Gói */}
      <Modal
        isOpen={isUpdateAprModalOpen}
        onClose={() => {
          if (!isSubmittingApr) setIsUpdateAprModalOpen(false);
        }}
        title={`Cập Nhật APR - Gói #${selectedPlanForEdit?.planId.toString() ?? ''}`}
        subtitle={`Kỳ hạn ${selectedPlanForEdit ? formatTenorUnit(selectedPlanForEdit.tenorDays, selectedPlanForEdit.timeUnit || timeUnit) : ''} (Hiện tại: ${selectedPlanForEdit ? formatBps(selectedPlanForEdit.aprBps) : ''})`}
        icon={<Edit3 className="w-5 h-5 text-indigo-400" />}
        footer={
          <>
            <Button
              variant="ghost"
              size="md"
              disabled={isSubmittingApr}
              onClick={() => setIsUpdateAprModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isSubmittingApr}
              loadingText="Đang lưu..."
              onClick={handleUpdateApr}
            >
              Lưu Cập Nhật
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl text-xs text-amber-300">
            Lưu ý: Thay đổi APR chỉ áp dụng cho các sổ mở mới hoặc các sổ tự động tái tục sau thời điểm cập nhật. Các sổ đang chạy vẫn giữ nguyên mức lãi suất đã chốt ban đầu.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Lãi suất APR mới (% / năm):
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={newAprInput}
                onChange={(e) => setNewAprInput(e.target.value)}
                placeholder="Ví dụ: 8.5"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 pr-12 tabular-nums"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">%</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Quy đổi: {newAprInput ? Math.round(parseFloat(newAprInput || '0') * 100) : 0} BPS (Basis Points).
            </p>
          </div>
        </div>
      </Modal>

      {/* Modal: Tạo Gói Mới */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          if (!isSubmittingCreate) setIsCreateModalOpen(false);
        }}
        title="Tạo Gói Tiết Kiệm Mới (Create Plan)"
        subtitle="Thiết lập kỳ hạn, lãi suất APR và điều kiện phạt rút sớm trên Smart Contract"
        icon={<Plus className="w-5 h-5 text-indigo-400" />}
        footer={
          <>
            <Button
              variant="ghost"
              size="md"
              disabled={isSubmittingCreate}
              onClick={() => setIsCreateModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              size="md"
              isLoading={isSubmittingCreate}
              loadingText="Đang tạo..."
              onClick={handleCreatePlan}
            >
              Tạo Gói Mới
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Chọn đơn vị thời gian: Phút (test demo) hoặc Ngày (chuẩn) */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Đơn vị thời gian cho gói này:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCreateUnit('minutes')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                  createUnit === 'minutes'
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>⚡ Phút (Test Demo)</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateUnit('days')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center space-x-1.5 ${
                  createUnit === 'days'
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>📅 Ngày (Chuẩn Đề)</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              {createUnit === 'minutes'
                ? '⚡ Gói theo phút: Đáo hạn và ân hạn tính bằng phút, thích hợp mở sổ quay demo và kích hoạt Auto-Renew ngay.'
                : '📅 Gói theo ngày: Chuẩn đề bài (1 ngày = 86,400 giây).'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Kỳ hạn ({createUnit === 'minutes' ? 'phút' : 'ngày'}):
              </label>
              <input
                type="number"
                min="1"
                max="3650"
                value={createTenor}
                onChange={(e) => setCreateTenor(e.target.value)}
                placeholder={createUnit === 'minutes' ? '5' : '90'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 tabular-nums"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {createUnit === 'minutes' ? 'Kỳ hạn tính bằng phút (1 phút = 60s)' : 'Kỳ hạn tính bằng ngày (1 ngày = 86,400s)'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Lãi suất APR (% / năm):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={createApr}
                  onChange={(e) => setCreateApr(e.target.value)}
                  placeholder="2.25"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 pr-8 tabular-nums"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">%</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Gợi ý MSSV (A=1): 2.25% ({createApr ? Math.round(parseFloat(createApr || '0') * 100) : 0} BPS)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Phạt rút trước hạn (%):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={createPenalty}
                  onChange={(e) => setCreatePenalty(e.target.value)}
                  placeholder="5.0"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 pr-8 tabular-nums"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-bold">%</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Gợi ý MSSV (B=4): 5.00% ({createPenalty ? Math.round(parseFloat(createPenalty || '0') * 100) : 0} BPS)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Gửi tối thiểu (USDC):
              </label>
              <input
                type="number"
                min="0"
                value={createMinDeposit}
                onChange={(e) => setCreateMinDeposit(e.target.value)}
                placeholder="10"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 tabular-nums"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Mặc định theo đề: 10 USDC
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Gửi tối đa (USDC - bỏ trống nếu không giới hạn):
            </label>
            <input
              type="number"
              min="0"
              value={createMaxDeposit}
              onChange={(e) => setCreateMaxDeposit(e.target.value)}
              placeholder="100000"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 tabular-nums"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Mặc định theo đề: 100,000 USDC (hoặc 0 nếu không giới hạn)
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
