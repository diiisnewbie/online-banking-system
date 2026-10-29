// Địa chỉ hợp đồng SavingCore đọc từ biến môi trường (hoặc fallback).
// Lưu ý: Địa chỉ VaultManager và MockUSDC được hook useBankingContracts
// tự động truy vấn từ getter public immutable `core.vault()` và `core.usdc()`.
export const SAVING_CORE_ADDRESS =
  import.meta.env.VITE_SAVING_CORE_ADDRESS || '0x04105a1FaCB657EC5adeB8e7A0ab5429A59A953D';
