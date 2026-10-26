// Địa chỉ hợp đồng SavingCore đọc từ biến môi trường (hoặc fallback).
// Lưu ý: Địa chỉ VaultManager và MockUSDC được hook useBankingContracts
// tự động truy vấn từ getter public immutable `core.vault()` và `core.usdc()`.
export const SAVING_CORE_ADDRESS =
  import.meta.env.VITE_SAVING_CORE_ADDRESS || '0x0000000000000000000000000000000000000000';
