// Địa chỉ hợp đồng SavingCore hỗ trợ cả Sepolia Testnet và Hardhat Localhost
export const SEPOLIA_SAVING_CORE =
  import.meta.env.VITE_SAVING_CORE_ADDRESS || '0xd62452220365fE9b42f8C6634A5d4b0A2E9AE83D';
export const LOCAL_SAVING_CORE = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';

export function getSavingCoreAddress(chainId?: number | null): string {
  if (chainId === 31337) return LOCAL_SAVING_CORE;
  return import.meta.env.VITE_SAVING_CORE_ADDRESS || SEPOLIA_SAVING_CORE;
}

export const SAVING_CORE_ADDRESS = getSavingCoreAddress();
