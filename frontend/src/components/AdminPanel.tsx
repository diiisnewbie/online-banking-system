import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { formatUnits6 } from '../utils/formatters';
import { parseContractError } from '../utils/errors';
import {
  Shield,
  Coins,
  Pause,
  Play,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
} from 'lucide-react';

interface AdminPanelProps {
  savingCore: ethers.Contract | null;
  vault: ethers.Contract | null;
  usdc: ethers.Contract | null;
  account: string | null;
  onSuccess: () => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  savingCore,
  vault,
  usdc,
  account,
  onSuccess,
}) => {
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

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadAdminData = async () => {
    if (!savingCore || !vault || !usdc) return;
    try {
      const vAddr = await vault.getAddress();
      const [cOwner, vOwner, pausedState, fReceiver, vBal, committed, uBal] = await Promise.all([
        savingCore.owner(),
        vault.owner(),
        vault.paused(),
        vault.feeReceiver(),
        usdc.balanceOf(vAddr),
        savingCore.totalCommittedInterest(),
        account ? usdc.balanceOf(account) : 0n,
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
  }, [savingCore, vault, usdc, account]);

  const isUserCoreOwner =
    account && coreOwner && account.toLowerCase() === coreOwner.toLowerCase();
  const isUserVaultOwner =
    account && vaultOwner && account.toLowerCase() === vaultOwner.toLowerCase();

  // Tính hạn mức an toàn tối đa cho phép rút khỏi Vault theo Solvency Guard C2
  const maxSafeWithdraw = vaultBalance > committedInterest ? vaultBalance - committedInterest : 0n;

  // 1. Nạp quỹ Fund Vault
  const handleFundVault = async () => {
    if (!vault || !usdc || !fundAmountStr) return;
    setIsLoading(true);
    setActionMsg(null);
    try {
      const amount = ethers.parseUnits(fundAmountStr, 6);
      const vAddr = await vault.getAddress();
      const currentAllowance = await usdc.allowance(account, vAddr);

      if (BigInt(currentAllowance) < amount) {
        const approveTx = await usdc.approve(vAddr, amount);
        await approveTx.wait();
      }

      const tx = await vault.fundVault(amount);
      await tx.wait();
      setActionMsg({ type: 'success', text: `Nạp thành công ${fundAmountStr} USDC vào quỹ trả lãi!` });
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: parseContractError(err, { core: savingCore, vault }) });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Rút quỹ Withdraw Vault
  const handleWithdrawVault = async () => {
    if (!vault || !withdrawAmountStr) return;
    setIsLoading(true);
    setActionMsg(null);
    try {
      const amount = ethers.parseUnits(withdrawAmountStr, 6);
      const tx = await vault.withdrawVault(amount);
      await tx.wait();
      setActionMsg({ type: 'success', text: `Rút thành công ${withdrawAmountStr} USDC từ quỹ Vault!` });
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: parseContractError(err, { core: savingCore, vault }) });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Tạm dừng / Tiếp tục hệ thống
  const handleTogglePause = async () => {
    if (!vault) return;
    setIsLoading(true);
    setActionMsg(null);
    try {
      const tx = isPaused ? await vault.unpause() : await vault.pause();
      await tx.wait();
      setActionMsg({
        type: 'success',
        text: isPaused ? 'Đã bỏ tạm dừng (Unpaused) hệ thống thành công!' : 'Đã tạm dừng (Paused) khẩn cấp hệ thống!',
      });
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: parseContractError(err, { core: savingCore, vault }) });
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Cập nhật feeReceiver
  const handleSetFeeReceiver = async () => {
    if (!vault || !newFeeReceiver || !ethers.isAddress(newFeeReceiver)) {
      setActionMsg({ type: 'error', text: 'Địa chỉ ví thu phạt không hợp lệ.' });
      return;
    }
    setIsLoading(true);
    setActionMsg(null);
    try {
      const tx = await vault.setFeeReceiver(newFeeReceiver);
      await tx.wait();
      setActionMsg({ type: 'success', text: 'Cập nhật ví nhận phạt rút sớm thành công!' });
      setNewFeeReceiver('');
      await loadAdminData();
      await onSuccess();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: parseContractError(err, { core: savingCore, vault }) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Verification Header */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-950/80 text-indigo-400 rounded-xl border border-indigo-700/50">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Bảng Quản Trị Hệ Thống (Bank Admin)</h3>
            <p className="text-xs text-slate-400">
              Kiểm soát thanh khoản quỹ trả lãi, Solvency Guard C2 và chế độ khẩn cấp.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span
            className={`px-3 py-1 rounded-full font-medium border ${
              isUserVaultOwner
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            Vault: {isUserVaultOwner ? 'Owner' : 'Không có quyền'}
          </span>
          <span
            className={`px-3 py-1 rounded-full font-medium border ${
              isUserCoreOwner
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            Core: {isUserCoreOwner ? 'Owner' : 'Không có quyền'}
          </span>
        </div>
      </div>

      {/* Global Alerts */}
      {actionMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-start space-x-2.5 ${
            actionMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-800/60 text-rose-300'
          }`}
        >
          {actionMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Grid 2 Cột: Quản Trị Thanh Khoản & Khẩn Cấp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Solvency Guard & Quản Lý Quỹ Vault */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
              <Coins className="w-4 h-4" />
              <span>Quản Trị Thanh Khoản Quỹ Trả Lãi (Vault)</span>
            </div>
          </div>

          {/* So sánh Balance vs Committed */}
          <div className="grid grid-cols-2 gap-3 bg-slate-800/50 p-4 rounded-xl border border-slate-700/60 text-xs">
            <div>
              <div className="text-slate-400">Số Dư Quỹ (Vault Balance):</div>
              <div className="font-mono text-base font-extrabold text-white mt-1">
                {formatUnits6(vaultBalance)} USDC
              </div>
            </div>
            <div>
              <div className="text-slate-400">Nghĩa Vụ Cam Kết (C2 Committed):</div>
              <div className="font-mono text-base font-extrabold text-amber-400 mt-1">
                {formatUnits6(committedInterest)} USDC
              </div>
            </div>
            <div className="col-span-2 pt-2 border-t border-slate-700/80 flex justify-between items-center">
              <span className="text-slate-300">Hạn mức tối đa được phép rút:</span>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {formatUnits6(maxSafeWithdraw)} USDC
              </span>
            </div>
          </div>

          {/* Form Nạp Quỹ */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between text-xs">
              <label className="font-semibold text-slate-300">Nạp thêm tiền vào Vault (Fund Vault):</label>
              <span className="text-slate-400">Ví: {formatUnits6(userUsdcBalance)} USDC</span>
            </div>
            <div className="flex space-x-2">
              <input
                type="number"
                value={fundAmountStr}
                onChange={(e) => setFundAmountStr(e.target.value)}
                placeholder="5000"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleFundVault}
                disabled={isLoading || !isUserVaultOwner}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowDownToLine className="w-3.5 h-3.5" />}
                <span>Nạp Quỹ</span>
              </button>
            </div>
          </div>

          {/* Form Rút Quỹ (Có Chốt Chặn Solvency Guard C2) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Rút vốn khỏi Vault (Withdraw Vault):</label>
            <div className="flex space-x-2">
              <input
                type="number"
                value={withdrawAmountStr}
                onChange={(e) => setWithdrawAmountStr(e.target.value)}
                placeholder="1000"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleWithdrawVault}
                disabled={isLoading || !isUserVaultOwner}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpFromLine className="w-3.5 h-3.5" />}
                <span>Rút Vốn</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              * Solvency Guard C2 sẽ tự động revert nếu số tiền rút làm cho số dư Vault nhỏ hơn tổng nghĩa vụ cam kết ({formatUnits6(committedInterest)} USDC).
            </p>
          </div>
        </div>

        {/* Card 2: Chế Độ Khẩn Cấp & Cấu Hình Ví Thu Phạt */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Chế Độ Khẩn Cấp & Ví Thu Phạt</span>
            </div>
          </div>

          {/* Trạng thái Pause */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/60 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Trạng Thái Hệ Thống:</div>
              <div className="text-sm font-extrabold mt-0.5 flex items-center space-x-2">
                {isPaused ? (
                  <span className="text-rose-400 flex items-center space-x-1.5">
                    <Lock className="w-4 h-4" />
                    <span>ĐANG TẠM DỪNG (PAUSED)</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>HOẠT ĐỘNG BÌNH THƯỜNG</span>
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleTogglePause}
              disabled={isLoading || !isUserVaultOwner}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                isPaused
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Bỏ Tạm Dừng (Unpause)</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Tạm Dừng Khẩn Cấp</span>
                </>
              )}
            </button>
          </div>

          {/* Cấu hình Fee Receiver */}
          <div className="space-y-2 pt-1">
            <div className="text-xs space-y-1">
              <label className="font-semibold text-slate-300">Ví Nhận Phạt Rút Sớm (Fee Receiver):</label>
              <div className="font-mono text-[11px] text-slate-400 bg-slate-800 p-2 rounded-lg break-all">
                {feeReceiver || 'Đang tải...'}
              </div>
            </div>

            <div className="flex space-x-2">
              <input
                type="text"
                value={newFeeReceiver}
                onChange={(e) => setNewFeeReceiver(e.target.value)}
                placeholder="0x... Địa chỉ ví mới"
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSetFeeReceiver}
                disabled={isLoading || !isUserVaultOwner || !newFeeReceiver}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition"
              >
                Cập Nhật
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              * Dùng để tách biệt ví nhận phạt (ví dụ Account #2) để chứng minh dòng tiền phạt khi quay demo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

