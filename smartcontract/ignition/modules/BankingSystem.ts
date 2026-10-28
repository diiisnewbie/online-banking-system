import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../../config/variant.js";

const FUND_AMOUNT = 10_000_000_000n; // 10,000 USDC
const USER_MINT = 10_000_000_000n;   // 10,000 USDC cho test accounts

export default buildModule("BankingSystem", (m) => {
  const deployer = m.getAccount(0);
  const testUser1 = m.getAccount(1);
  const testUser2 = m.getAccount(2);

  // 1. Deploy Contracts
  const usdc = m.contract("MockUSDC");
  const vault = m.contract("VaultManager", [usdc, deployer]);
  const core = m.contract("SavingCore", [
    usdc,
    vault,
    deployer,
    BigInt(VARIANT.gracePeriodSeconds),
    BigInt(VARIANT.defaultTenorDays),
    BigInt(VARIANT.defaultAprBps),
    BigInt(VARIANT.earlyPenaltyBps),
    PLAN0_MIN_DEPOSIT,
    PLAN0_MAX_DEPOSIT,
  ]);

  // 2. Wire SavingCore to VaultManager
  const wire = m.call(vault, "setSavingCore", [core]);

  // 3. Mint & Fund Vault (id rieng biet cho tung call)
  const mintDeployer = m.call(usdc, "mint", [deployer, FUND_AMOUNT], { id: "mintDeployer" });
  const approveVault = m.call(usdc, "approve", [vault, FUND_AMOUNT], {
    id: "approveVault",
    after: [mintDeployer],
  });
  const fund = m.call(vault, "fundVault", [FUND_AMOUNT], {
    id: "fundVault",
    after: [approveVault, wire],
  });

  // 4. Seed Test Accounts (id rieng biet cho tung call)
  m.call(usdc, "mint", [testUser1, USER_MINT], { id: "mintAcc1" });
  m.call(usdc, "mint", [testUser2, USER_MINT], { id: "mintAcc2" });

  // 5. Seed Plans tuan tu co ID rieng biet
  const plan1 = m.call(
    core,
    "createPlan",
    [30n, 300n, 10_000_000n, 50_000_000_000n, BigInt(VARIANT.earlyPenaltyBps)],
    { id: "createPlan1", after: [wire] }
  );

  const plan2 = m.call(
    core,
    "createPlan",
    [90n, 225n, 0n, 0n, BigInt(VARIANT.earlyPenaltyBps)],
    { id: "createPlan2", after: [plan1] }
  );

  return { usdc, vault, core };
});