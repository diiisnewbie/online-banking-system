import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Tham số tối ưu cho môi trường Live Testnet (Sepolia)
// Cho phép demo chu kỳ đầy đủ (Mở sổ -> Đáo hạn -> Hết Grace -> Auto-Renew) trong vòng 5-10 phút thực tế.
const SEPOLIA_FUND_AMOUNT = 100_000_000_000n; // 100,000 USDC cho Vault
const SEPOLIA_USER_MINT = 20_000_000_000n;    // 20,000 USDC cho deployer

// Grace period trên Sepolia: 2 phút (120 giây) để bot kịp trigger demo
const SEPOLIA_GRACE_PERIOD_SECONDS = 120n;

export default buildModule("BankingSystemSepolia", (m) => {
  const deployer = m.getAccount(0);

  // 1. Deploy Contracts
  const usdc = m.contract("MockUSDC");
  const vault = m.contract("VaultManager", [usdc, deployer]);

  // Plan 0: Gói kiểm thử siêu tốc (5 phút - 300 giây)
  // Lưu ý: SavingCore nhận defaultTenorDays dạng ngày (uint256 tenorDays)
  // Để hỗ trợ gói theo ngày chuẩn:
  // Plan 0: 1 ngày (86,400s)
  const core = m.contract("SavingCore", [
    usdc,
    vault,
    deployer,
    SEPOLIA_GRACE_PERIOD_SECONDS, // 120s grace period
    1n,                           // Plan 0: 1 ngày
    500n,                         // 5.00% APR
    500n,                         // 5.00% phạt rút sớm
    10_000_000n,                  // Min: 10 USDC
    10_000_000_000n,              // Max: 10,000 USDC
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

  // 4. Seed Thêm Plan 1 (Kỳ hạn 7 ngày) & Plan 2 (Kỳ hạn 30 ngày)
  const plan1 = m.call(
    core,
    "createPlan",
    [7n, 700n, 10_000_000n, 50_000_000_000n, 500n],
    { id: "createPlan7Days", after: [wire] }
  );

  const plan2 = m.call(
    core,
    "createPlan",
    [30n, 1000n, 10_000_000n, 50_000_000_000n, 500n],
    { id: "createPlan30Days", after: [plan1] }
  );

  return { usdc, vault, core };
});

