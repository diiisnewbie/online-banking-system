import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Thiet lap chuan theo de thi va MSSV 22699741 (A=1, B=4):
// - Plan 0: 90 Ngay (B chan), APR 2.25% (200 + A*25), Phat 5.00% (300 + B*50)
// - Grace Period: 3 ngay (259,200s) = (A % 3 + 2) ngay
// - TimeUnit mac dinh: 86,400s (1 ngay)
const SEPOLIA_FUND_AMOUNT = 100_000_000_000n; // 100,000 USDC cho Vault
const SEPOLIA_GRACE_PERIOD_SECONDS = 259_200n; // 3 ngay an han (259,200 giay)
const SEPOLIA_TIME_UNIT_SECONDS = 86_400n;     // 1 don vi ky han = 86,400 giay (1 ngay)

export default buildModule("BankingSystemSepolia", (m) => {
  const deployer = m.getAccount(0);

  // 1. Deploy Contracts
  const usdc = m.contract("MockUSDC");
  const vault = m.contract("VaultManager", [usdc, deployer]);

  // Plan 0: 90 Ngay, APR 2.25%, Phat 5.00%, Min 10 USDC, Max 100,000 USDC
  const core = m.contract("SavingCore", [
    usdc,
    vault,
    deployer,
    SEPOLIA_GRACE_PERIOD_SECONDS, // 3 ngay an han (259,200s)
    90n,                          // Plan 0: 90 ngay
    225n,                         // 2.25% APR (225 bps theo MSSV A=1)
    500n,                         // 5.00% phat rut som (500 bps theo MSSV B=4)
    10_000_000n,                  // Min: 10 USDC
    100_000_000_000n,             // Max: 100,000 USDC
    SEPOLIA_TIME_UNIT_SECONDS,    // TimeUnit = 86,400s (1 ngay)
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

  // 4. Seed Them Plan 1 (30 Ngay, 3.00% APR) & Plan 2 (180 Ngay, 4.50% APR)
  const plan1 = m.call(
    core,
    "createPlan",
    [30n, 300n, 10_000_000n, 50_000_000_000n, 500n], // 30 ngay, 3.00% APR
    { id: "createPlan30Days", after: [wire] }
  );

  const plan2 = m.call(
    core,
    "createPlan",
    [180n, 450n, 10_000_000n, 100_000_000_000n, 500n], // 180 ngay, 4.50% APR
    { id: "createPlan180Days", after: [plan1] }
  );

  return { usdc, vault, core };
});
