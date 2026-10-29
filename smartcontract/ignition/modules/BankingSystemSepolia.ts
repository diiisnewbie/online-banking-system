import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Tham số tối ưu cho môi trường Live Testnet (Sepolia)
// Kỳ hạn 1 phút, Grace Period 1 phút (sau 1 phút nữa Auto-Renew kích hoạt)
const SEPOLIA_FUND_AMOUNT = 100_000_000_000n; // 100,000 USDC cho Vault
const SEPOLIA_GRACE_PERIOD_SECONDS = 60n;     // 1 phút ân hạn (60 giây)
const SEPOLIA_TIME_UNIT_SECONDS = 60n;         // 1 đơn vị kỳ hạn = 60 giây (1 phút)

export default buildModule("BankingSystemSepolia", (m) => {
  const deployer = m.getAccount(0);

  // 1. Deploy Contracts
  const usdc = m.contract("MockUSDC");
  const vault = m.contract("VaultManager", [usdc, deployer]);

  // Plan 0: Kỳ hạn 1 phút (1 * 60s = 60s)
  const core = m.contract("SavingCore", [
    usdc,
    vault,
    deployer,
    SEPOLIA_GRACE_PERIOD_SECONDS, // 60s grace period (1 phút)
    1n,                           // Plan 0: 1 phút
    500n,                         // 5.00% APR
    500n,                         // 5.00% phạt rút sớm
    10_000_000n,                  // Min: 10 USDC
    10_000_000_000n,              // Max: 10,000 USDC
    SEPOLIA_TIME_UNIT_SECONDS,    // TimeUnit = 60s (1 phút)
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

  // 4. Seed Thêm Plan 1 (Kỳ hạn 3 phút) & Plan 2 (Kỳ hạn 5 phút)
  const plan1 = m.call(
    core,
    "createPlan",
    [3n, 700n, 10_000_000n, 50_000_000_000n, 500n], // 3 phút, 7% APR
    { id: "createPlan3Minutes", after: [wire] }
  );

  const plan2 = m.call(
    core,
    "createPlan",
    [5n, 1000n, 10_000_000n, 50_000_000_000n, 500n], // 5 phút, 10% APR
    { id: "createPlan5Minutes", after: [plan1] }
  );

  return { usdc, vault, core };
});
