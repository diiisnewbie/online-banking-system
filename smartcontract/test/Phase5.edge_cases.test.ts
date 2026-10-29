import { expect } from "chai";
import { network } from "hardhat";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("Phase 5 -- Edge Cases & Boundary Error Coverage Suite", function () {
  async function deployFixture() {
    const [deployer, user] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    const vault = await VaultManager.deploy(usdc.target, deployer.address);

    const SavingCore = await ethers.getContractFactory("SavingCore");
    const core = await SavingCore.deploy(
      usdc.target,
      vault.target,
      deployer.address,
      BigInt(VARIANT.gracePeriodSeconds),
      BigInt(VARIANT.defaultTenorDays),
      BigInt(VARIANT.defaultAprBps),
      BigInt(VARIANT.earlyPenaltyBps),
      PLAN0_MIN_DEPOSIT,
      PLAN0_MAX_DEPOSIT,
      0n
    );

    await vault.setSavingCore(core.target);

    // Fund user and vault
    await usdc.mint(deployer.address, 10_000_000_000n);
    await usdc.connect(deployer).approve(vault.target, 10_000_000_000n);
    await vault.connect(deployer).fundVault(10_000_000_000n);

    await usdc.mint(user.address, 10_000_000_000n);
    await usdc.connect(user).approve(core.target, 10_000_000_000n);

    return { usdc, vault, core, deployer, user, MockUSDC, VaultManager, SavingCore };
  }

  it("EC-01 -- VaultManager constructor reverts ZeroAddress when usdc is address(0)", async function () {
    const { VaultManager, deployer } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      VaultManager.deploy(ethers.ZeroAddress, deployer.address)
    ).to.be.revertedWithCustomError(VaultManager, "ZeroAddress");
  });

  it("EC-02 -- SavingCore constructor reverts ZeroAddress when usdc or vault is address(0)", async function () {
    const { SavingCore, usdc, vault, deployer } = await networkHelpers.loadFixture(deployFixture);

    // usdc is ZeroAddress
    await expect(
      SavingCore.deploy(
        ethers.ZeroAddress,
        vault.target,
        deployer.address,
        BigInt(VARIANT.gracePeriodSeconds),
        BigInt(VARIANT.defaultTenorDays),
        BigInt(VARIANT.defaultAprBps),
        BigInt(VARIANT.earlyPenaltyBps),
        PLAN0_MIN_DEPOSIT,
        PLAN0_MAX_DEPOSIT,
        0n
      )
    ).to.be.revertedWithCustomError(SavingCore, "ZeroAddress");

    // vault is ZeroAddress
    await expect(
      SavingCore.deploy(
        usdc.target,
        ethers.ZeroAddress,
        deployer.address,
        BigInt(VARIANT.gracePeriodSeconds),
        BigInt(VARIANT.defaultTenorDays),
        BigInt(VARIANT.defaultAprBps),
        BigInt(VARIANT.earlyPenaltyBps),
        PLAN0_MIN_DEPOSIT,
        PLAN0_MAX_DEPOSIT,
        0n
      )
    ).to.be.revertedWithCustomError(SavingCore, "ZeroAddress");
  });

  it("EC-03 -- SavingCore.enablePlan reverts PlanNotFound for non-existent planId", async function () {
    const { core, deployer } = await networkHelpers.loadFixture(deployFixture);
    await expect(core.connect(deployer).enablePlan(999))
      .to.be.revertedWithCustomError(core, "PlanNotFound")
      .withArgs(999);
  });

  it("EC-04 -- SavingCore.getPlan reverts PlanNotFound for non-existent planId", async function () {
    const { core } = await networkHelpers.loadFixture(deployFixture);
    await expect(core.getPlan(999))
      .to.be.revertedWithCustomError(core, "PlanNotFound")
      .withArgs(999);
  });

  it("EC-05 -- renewDeposit reverts PlanNotFound when newPlanId is non-existent", async function () {
    const { core, user } = await networkHelpers.loadFixture(deployFixture);
    await core.connect(user).openDeposit(0, 1_000_000_000n); // Deposit ID 1

    // Fast-forward past maturity (90 days)
    await networkHelpers.time.increase(90 * 86400 + 1);

    await expect(core.connect(user).renewDeposit(1, 999))
      .to.be.revertedWithCustomError(core, "PlanNotFound")
      .withArgs(999);
  });

  it("EC-06 -- renewDeposit reverts InvalidDepositAmount when newPrincipal < minDeposit of new plan", async function () {
    const { core, deployer, user } = await networkHelpers.loadFixture(deployFixture);

    // Create Plan 1 with very high minDeposit (5,000 USDC)
    await core.connect(deployer).createPlan(
      30n,
      300n,
      5_000_000_000n, // minDeposit: 5,000 USDC
      50_000_000_000n, // maxDeposit: 50,000 USDC
      500n
    ); // Plan ID 1

    // User opens Cert #1 in Plan 0 with 10 USDC (10_000_000 units)
    await core.connect(user).openDeposit(0, 10_000_000n);

    // Fast-forward past maturity (90 days)
    await networkHelpers.time.increase(90 * 86400 + 1);

    // newPrincipal ~ 10.05 USDC < 5,000 USDC minDeposit of Plan 1 -> reverts InvalidDepositAmount
    await expect(core.connect(user).renewDeposit(1, 1))
      .to.be.revertedWithCustomError(core, "InvalidDepositAmount");
  });
});

