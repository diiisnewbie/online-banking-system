import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Tham so toi uu cho moi truong Live Testnet (Sepolia)
// Ky han 1 phut, Grace Period 1 phut (sau 1 phut nua Auto-Renew kich hoat)
const SEPOLIA_FUND_AMOUNT = 100_000_000_000n; // 100,000 USDC cho Vault
const SEPOLIA_GRACE_PERIOD_SECONDS = 60n;     // 1 phut an han (60 giay)
const SEPOLIA_TIME_UNIT_SECONDS = 60n;         // 1 don vi ky han = 60 giay (1 phut)

export default buildModule("BankingSystemSepolia", (m) => {
  const deployer = m.getAccount(0);

  // 1. Deploy Contracts
  const usdc = m.contract("MockUSDC");
  const vault = m.contract("VaultManager", [usdc, deployer]);

  // Plan 0: Ky han 1 phut (1 * 60s = 60s)
  const core = m.contract("SavingCore", [
    usdc,
    vault,
    deployer,
    SEPOLIA_GRACE_PERIOD_SECONDS, // 60s grace period (1 phut)
    1n,                           // Plan 0: 1 phut
    225n,                         // 2.25% APR (225 bps theo MSSV A=1)
    500n,                         // 5.00% phat rut som (500 bps theo MSSV B=4)
    10_000_000n,                  // Min: 10 USDC
    10_000_000_000n,              // Max: 10,000 USDC
    SEPOLIA_TIME_UNIT_SECONDS,    // TimeUnit = 60s (1 phut)
  ]);

  // 2. Wire SavingCore to VaultManager
  const wire = m.call(vault, "setSavingCore", [core]);

  // 3. Mint & Fund Vault
  const mintDeployer = m.call(usdc, "mint", [deployer, SEPOLIA_FUND_AMOUNT], { id: "mintDeployer" });
  const approveVault = m.call(usdc, "approve", [vault, SEPOLIA_FUND_AMOUNT], {
    id: "approveVault",
    after: [mintDeployer],
  });
  const fund = m.call(vault, "fundVault", [SEPOLIA_FUND_AMOUNT], {
    id: "fundVault",
    after: [approveVault, wire],
  });

  // 4. Seed Them Plan 1 (Ky han 3 phut) & Plan 2 (Ky han 5 phut)
  const plan1 = m.call(
    core,
    "createPlan",
    [3n, 700n, 10_000_000n, 50_000_000_000n, 500n], // 3 phut, 7% APR
    { id: "createPlan3Minutes", after: [wire] }
  );

  const plan2 = m.call(
    core,
    "createPlan",
    [5n, 1000n, 10_000_000n, 50_000_000_000n, 500n], // 5 phut, 10% APR
    { id: "createPlan5Minutes", after: [plan1] }
  );

  return { usdc, vault, core };
});