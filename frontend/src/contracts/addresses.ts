// Địa chỉ hợp đồng SavingCore hỗ trợ cả Sepolia Testnet và Hardhat Localhost
export const SEPOLIA_SAVING_CORE = '0x04105a1FaCB657EC5adeB8e7A0ab5429A59A953D';
export const LOCAL_SAVING_CORE = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707';

export function getSavingCoreAddress(chainId?: number | null): string {
  if (chainId === 31337) return LOCAL_SAVING_CORE;
  if (chainId === 11155111) return SEPOLIA_SAVING_CORE;
  return import.meta.env.VITE_SAVING_CORE_ADDRESS || SEPOLIA_SAVING_CORE;
}

export const SAVING_CORE_ADDRESS = getSavingCoreAddress();
