import { expect } from "chai";
import hre, { network } from "hardhat";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("Phase 1 -- Setup & Foundation Smoke Tests", function () {
  async function deployDefaultFixture() {
    const [deployer, user, bob, stranger] = await ethers.getSigners();

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

    return { usdc, vault, core, deployer, user, bob, stranger };
  }

  async function deployUnwiredVaultFixture() {
    const [deployer, user, stranger] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    const vault = await VaultManager.deploy(usdc.target, deployer.address);

    return { usdc, vault, deployer, user, stranger };
  }

  // --- S1: Variant, Plan 0, Immutables ---
  describe("S1 -- Variant & Setup Verification [V1, D28, D29, Q7]", function () {
    it("asserts variant constants, initial Plan 0, and immutable references", async function () {
      const { usdc, vault, core } = await networkHelpers.loadFixture(deployDefaultFixture);

      // Assert variant formulas with literals A=1, B=4
      expect(BigInt(VARIANT.gracePeriodSeconds)).to.equal(259_200n);
      expect(BigInt(VARIANT.defaultAprBps)).to.equal(225n);
      expect(BigInt(VARIANT.earlyPenaltyBps)).to.equal(500n);
      expect(BigInt(VARIANT.defaultTenorDays)).to.equal(90n);

      // Assert SavingCore state
      expect(await core.gracePeriod()).to.equal(259_200n);
      expect(await core.planCount()).to.equal(1n);

      // Assert Plan 0 details
      const plan0 = await core.getPlan(0);
      expect(plan0.planId).to.equal(0n);
      expect(plan0.tenorDays).to.equal(90n);
      expect(plan0.aprBps).to.equal(225n);
      expect(plan0.earlyWithdrawPenaltyBps).to.equal(500n);
      expect(plan0.minDeposit).to.equal(PLAN0_MIN_DEPOSIT);
      expect(plan0.maxDeposit).to.equal(PLAN0_MAX_DEPOSIT);
      expect(plan0.enabled).to.equal(true);

      // Assert Immutables
      expect(await core.usdc()).to.equal(usdc.target);
      expect(await core.vault()).to.equal(vault.target);
      expect(await vault.usdc()).to.equal(usdc.target);
    });
  });

  // --- S2: Wiring & Permissions ---
  describe("S2 -- Vault Wiring & Permissions [M11, D3]", function () {
    it("handles setSavingCore correctly (set-once, onlyOwner, zero check)", async function () {
      const { vault, user, stranger } = await networkHelpers.loadFixture(deployUnwiredVaultFixture);

      // Non-owner cannot call setSavingCore
      await expect(
        vault.connect(stranger).setSavingCore(user.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      // Address(0) is rejected
      await expect(
        vault.setSavingCore(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");

      // First call succeeds and emits event
      await expect(vault.setSavingCore(user.address))
        .to.emit(vault, "SavingCoreSet")
        .withArgs(user.address);
      expect(await vault.savingCore()).to.equal(user.address);

      // Second call fails with SavingCoreAlreadySet
      await expect(
        vault.setSavingCore(stranger.address)
      ).to.be.revertedWithCustomError(vault, "SavingCoreAlreadySet");
    });
  });

  // --- S3: openDeposit Happy Path & CEI Proof ---
  describe("S3 -- openDeposit Happy Path & CEI Rollback Proof [M1, D32]", function () {
    it("successfully opens deposit with full certificate and ERC-721 token", async function () {
      const { usdc, core, user } = await networkHelpers.loadFixture(deployDefaultFixture);
      const amount = 1_000_000_000n; // 1,000 USDC

      await usdc.mint(user.address, amount);
      await usdc.connect(user).approve(core.target, amount);

      const tx = await core.connect(user).openDeposit(0, amount);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      expect(await core.nextDepositId()).to.equal(2n);
      expect(await core.ownerOf(1)).to.equal(user.address);
      expect(await core.balanceOf(user.address)).to.equal(1n);
      expect(await core.tokenOfOwnerByIndex(user.address, 0)).to.equal(1n);

      const cert = await core.getCertificate(1);
      expect(cert.depositId).to.equal(1n);
      expect(cert.planId).to.equal(0n);
      expect(cert.principal).to.equal(amount);
      expect(cert.startAt).to.equal(BigInt(block!.timestamp));
      expect(cert.maturityAt).to.equal(BigInt(block!.timestamp) + 90n * 86400n);
      expect(cert.aprBpsAtOpen).to.equal(225n);
      expect(cert.penaltyBpsAtOpen).to.equal(500n);
      expect(cert.status).to.equal(0); // Active

      // Token transfers
      expect(await usdc.balanceOf(user.address)).to.equal(0n);
      expect(await usdc.balanceOf(core.target)).to.equal(amount);

      // Event emission
      await expect(tx)
        .to.emit(core, "DepositOpened")
        .withArgs(1n, user.address, 0n, amount, cert.maturityAt, 225n);
    });

    it("reverts atomically without consuming depositId on allowance/balance failure (CEI)", async function () {
      const { usdc, core, user } = await networkHelpers.loadFixture(deployDefaultFixture);
      const amount = 1_000_000_000n;

      // Case 1: unapproved
      await expect(
        core.connect(user).openDeposit(0, amount)
      ).to.be.revertedWithCustomError(usdc, "ERC20InsufficientAllowance");
      expect(await core.nextDepositId()).to.equal(1n);

      // Case 2: approved but balance 0
      await usdc.connect(user).approve(core.target, amount);
      await expect(
        core.connect(user).openDeposit(0, amount)
      ).to.be.revertedWithCustomError(usdc, "ERC20InsufficientBalance");
      expect(await core.nextDepositId()).to.equal(1n);
    });
  });

  // --- S4: openDeposit Validations ---
  describe("S4 -- openDeposit Validations [M2, D5, D7]", function () {
    it("validates planId, plan disabled status, amount > 0, min and max", async function () {
      const { usdc, core, user } = await networkHelpers.loadFixture(deployDefaultFixture);
      await usdc.mint(user.address, 200_000_000_000n);
      await usdc.connect(user).approve(core.target, 200_000_000_000n);

      // (a) Invalid planId
      await expect(
        core.connect(user).openDeposit(99, 1_000_000_000n)
      ).to.be.revertedWithCustomError(core, "PlanNotFound").withArgs(99n);

      // (b) Disabled plan
      await core.createPlan(30, 300, 10_000_000n, 50_000_000_000n, 500);
      const disabledPlanId = 1n;
      await core.disablePlan(disabledPlanId);
      await expect(
        core.connect(user).openDeposit(disabledPlanId, 1_000_000_000n)
      ).to.be.revertedWithCustomError(core, "PlanDisabled");

      // (c) Amount == 0 on a min=0 plan (proves D7 is checked before minDeposit)
      await core.createPlan(90, 225, 0, 0, 500); // planId 2
      const min0PlanId = 2n;
      await expect(
        core.connect(user).openDeposit(min0PlanId, 0)
      ).to.be.revertedWithCustomError(core, "InvalidDepositAmount");

      // (d) Amount below minDeposit on Plan 0 (min = 10 USDC = 10_000_000)
      await expect(
        core.connect(user).openDeposit(0, 9_999_999n)
      ).to.be.revertedWithCustomError(core, "InvalidDepositAmount");

      // (e) Amount above maxDeposit on Plan 0 (max = 100,000 USDC = 100_000_000_000)
      await expect(
        core.connect(user).openDeposit(0, 100_000_000_001n)
      ).to.be.revertedWithCustomError(core, "InvalidDepositAmount");

      // (f) Exact minDeposit succeeds
      const txMin = await core.connect(user).openDeposit(0, 10_000_000n);
      await txMin.wait();
      expect(await core.ownerOf(1)).to.equal(user.address);

      // (g) Exact maxDeposit succeeds
      const txMax = await core.connect(user).openDeposit(0, 100_000_000_000n);
      await txMax.wait();
      expect(await core.ownerOf(2)).to.equal(user.address);
    });
  });

  // --- S5: Snapshot APR Immutability ---
  describe("S5 -- Snapshot APR Immutability [I1, D11, Q6]", function () {
    it("preserves snapshot APR on existing deposits when admin updates plan APR", async function () {
      const { usdc, core, user } = await networkHelpers.loadFixture(deployDefaultFixture);
      const amount = 1_000_000_000n;
      await usdc.mint(user.address, amount * 2n);
      await usdc.connect(user).approve(core.target, amount * 2n);

      // Open deposit #1 under initial 225 bps
      await core.connect(user).openDeposit(0, amount);
      const cert1Before = await core.getCertificate(1);
      expect(cert1Before.aprBpsAtOpen).to.equal(225n);

      // Admin updates plan 0 to 100 bps
      await expect(core.updatePlan(0, 100))
        .to.emit(core, "PlanUpdated")
        .withArgs(0n, 100n);

      // Deposit #1 must still retain 225 bps
      const cert1After = await core.getCertificate(1);
      expect(cert1After.aprBpsAtOpen).to.equal(225n);
      expect(await core.previewInterest(1)).to.equal(5_547_945n);

      // Open deposit #2 under new APR (100 bps)
      await core.connect(user).openDeposit(0, amount);
      const cert2 = await core.getCertificate(2);
      expect(cert2.aprBpsAtOpen).to.equal(100n);
      // Interest with 100 bps: 1e9 * 100 * 90d / (365d * 10000) = 2_465_753
      expect(await core.previewInterest(2)).to.equal(2_465_753n);
    });
  });

  // --- S6: Plan Enable/Disable Toggling ---
  describe("S6 -- Plan Toggling [P3, Q6]", function () {
    it("handles enablePlan and disablePlan with PlanToggled events and enforces open restrictions", async function () {
      const { usdc, core, user } = await networkHelpers.loadFixture(deployDefaultFixture);
      await usdc.mint(user.address, 1_000_000_000n);
      await usdc.connect(user).approve(core.target, 1_000_000_000n);

      // Disable Plan 0
      await expect(core.disablePlan(0))
        .to.emit(core, "PlanToggled")
        .withArgs(0n, false);
      expect((await core.getPlan(0)).enabled).to.equal(false);

      // Opening under disabled plan reverts
      await expect(
        core.connect(user).openDeposit(0, 1_000_000_000n)
      ).to.be.revertedWithCustomError(core, "PlanDisabled");

      // Non-existent plan toggle reverts
      await expect(core.disablePlan(99)).to.be.revertedWithCustomError(core, "PlanNotFound").withArgs(99n);

      // Re-enable Plan 0
      await expect(core.enablePlan(0))
        .to.emit(core, "PlanToggled")
        .withArgs(0n, true);
      expect((await core.getPlan(0)).enabled).to.equal(true);

      // Now opening succeeds
      const tx = await core.connect(user).openDeposit(0, 1_000_000_000n);
      await tx.wait();
      expect(await core.ownerOf(1)).to.equal(user.address);
    });
  });

  // --- S7: Plan CRUD & Validations ---
  describe("S7 -- Plan CRUD & Parameter Boundaries [P1, P2, D5]", function () {
    it("enforces plan parameters boundaries on createPlan and updatePlan", async function () {
      const { core, stranger } = await networkHelpers.loadFixture(deployDefaultFixture);

      // Valid createPlan creates planId 1 on clean fixture
      await expect(core.createPlan(30, 300, 10_000_000n, 50_000_000_000n, 500))
        .to.emit(core, "PlanCreated")
        .withArgs(1n, 30n, 300n);
      expect(await core.planCount()).to.equal(2n);

      // Invalid tenor
      await expect(core.createPlan(0, 300, 0, 0, 0)).to.be.revertedWithCustomError(core, "InvalidPlanParams");
      await expect(core.createPlan(3651, 300, 0, 0, 0)).to.be.revertedWithCustomError(core, "InvalidPlanParams");

      // Invalid APR (0 and 10001)
      await expect(core.createPlan(30, 0, 0, 0, 0)).to.be.revertedWithCustomError(core, "InvalidPlanParams");
      await expect(core.createPlan(30, 10001, 0, 0, 0)).to.be.revertedWithCustomError(core, "InvalidPlanParams");

      // Invalid penalty
      await expect(core.createPlan(30, 300, 0, 0, 10001)).to.be.revertedWithCustomError(core, "InvalidPlanParams");

      // Invalid min > max
      await expect(
        core.createPlan(30, 300, 100_000_000n, 50_000_000n, 500)
      ).to.be.revertedWithCustomError(core, "InvalidPlanParams");

      // Non-owner createPlan
      await expect(
        core.connect(stranger).createPlan(30, 300, 0, 0, 0)
      ).to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount");

      // updatePlan checks
      await expect(core.updatePlan(99, 300)).to.be.revertedWithCustomError(core, "PlanNotFound").withArgs(99n);
      await expect(core.updatePlan(0, 0)).to.be.revertedWithCustomError(core, "InvalidPlanParams");
      await expect(core.updatePlan(0, 10001)).to.be.revertedWithCustomError(core, "InvalidPlanParams");
      await expect(
        core.connect(stranger).updatePlan(0, 300)
      ).to.be.revertedWithCustomError(core, "OwnableUnauthorizedAccount");
    });
  });

  // --- S8: Emergency Pause ---
  describe("S8 -- Emergency Pause & Rescue Funding [M10, D1, D2]", function () {
    it("blocks user flows while allowing rescue fundVault during pause", async function () {
      const { usdc, vault, core, deployer, user, stranger } = await networkHelpers.loadFixture(deployDefaultFixture);
      const amount = 1_000_000_000n;
      await usdc.mint(user.address, amount);
      await usdc.connect(user).approve(core.target, amount);
      await usdc.mint(deployer.address, amount);
      await usdc.connect(deployer).approve(vault.target, amount);

      // Pause system
      await vault.pause();
      expect(await vault.paused()).to.equal(true);

      // openDeposit is blocked
      await expect(
        core.connect(user).openDeposit(0, amount)
      ).to.be.revertedWithCustomError(core, "SystemPaused");

      // fundVault by owner is NOT blocked (rescue funding)
      await expect(vault.fundVault(amount))
        .to.emit(vault, "VaultFunded")
        .withArgs(deployer.address, amount);

      // fundVault by non-owner is rejected
      await expect(
        vault.connect(stranger).fundVault(amount)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");

      // withdrawVault by owner is blocked with EnforcedPause
      await expect(vault.withdrawVault(amount)).to.be.revertedWithCustomError(vault, "EnforcedPause");

      // Unpause
      await vault.unpause();
      expect(await vault.paused()).to.equal(false);

      // openDeposit works again
      const tx = await core.connect(user).openDeposit(0, amount);
      await tx.wait();
      expect(await core.ownerOf(1)).to.equal(user.address);
    });
  });

  // --- S9: Vault Operations & Access Control ---
  describe("S9 -- Vault Management & Interest Payout Checks [M20, M11, M14, D16, D17, D25]", function () {
    it("handles feeReceiver configuration and withdrawVault balance checks", async function () {
      const { usdc, vault, deployer, user, stranger } = await networkHelpers.loadFixture(deployDefaultFixture);

      // (a) feeReceiver
      expect(await vault.feeReceiver()).to.equal(deployer.address);
      await expect(vault.setFeeReceiver(ethers.ZeroAddress)).to.be.revertedWithCustomError(vault, "ZeroAddress");
      await expect(
        vault.connect(stranger).setFeeReceiver(user.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(vault.setFeeReceiver(user.address))
        .to.emit(vault, "FeeReceiverSet")
        .withArgs(user.address);
      expect(await vault.feeReceiver()).to.equal(user.address);

      // (b) fundVault & withdrawVault
      const fundAmount = 10_000_000_000n;
      await usdc.mint(deployer.address, fundAmount);
      await usdc.approve(vault.target, fundAmount);
      await vault.fundVault(fundAmount);
      expect(await usdc.balanceOf(vault.target)).to.equal(fundAmount);

      // Withdraw > balance
      await expect(vault.withdrawVault(fundAmount + 1n)).to.be.revertedWithCustomError(
        vault,
        "AmountExceedsBalance"
      );

      // Withdraw valid
      await expect(vault.withdrawVault(5_000_000_000n))
        .to.emit(vault, "VaultWithdrawn")
        .withArgs(deployer.address, 5_000_000_000n);
      expect(await usdc.balanceOf(vault.target)).to.equal(5_000_000_000n);
    });

    it("handles payoutInterest access control, liquidity checks, and pause status", async function () {
      const { usdc, vault, deployer, user, stranger } = await networkHelpers.loadFixture(deployUnwiredVaultFixture);
      // Set deployer as mock savingCore to test payout directly
      await vault.setSavingCore(deployer.address);

      // stranger payout reverts with NotSavingCore
      await expect(
        vault.connect(stranger).payoutInterest(user.address, 1_000_000n)
      ).to.be.revertedWithCustomError(vault, "NotSavingCore");

      // payout 0 returns without transfer
      const zeroTx = await vault.payoutInterest(user.address, 0);
      await zeroTx.wait();

      // payout with insufficient liquidity
      await expect(
        vault.payoutInterest(user.address, 1_000_000n)
      ).to.be.revertedWithCustomError(vault, "InsufficientVaultLiquidity");

      // Fund vault then payout succeeds
      await usdc.mint(deployer.address, 5_000_000n);
      await usdc.approve(vault.target, 5_000_000n);
      await vault.fundVault(5_000_000n);

      await expect(vault.payoutInterest(user.address, 2_000_000n))
        .to.emit(vault, "InterestPaid")
        .withArgs(user.address, 2_000_000n);
      expect(await usdc.balanceOf(user.address)).to.equal(2_000_000n);

      // Payout during pause reverts with EnforcedPause (modifier order verified)
      await vault.pause();
      await expect(
        vault.payoutInterest(user.address, 1_000_000n)
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  // --- S10: Reentrancy Attack Protection ---
  describe("S10 -- Reentrancy Guard Verification [M16, Q7, D16, D32]", function () {
    it("reverts reentrancy attempts via onERC721Received with ReentrancyGuardReentrantCall", async function () {
      const { usdc, core } = await networkHelpers.loadFixture(deployDefaultFixture);
      const attackAmount = 1_000_000_000n;

      const ReentrantReceiverFactory = await ethers.getContractFactory("ReentrantReceiver");
      const receiver = await ReentrantReceiverFactory.deploy();

      await usdc.mint(receiver.target, attackAmount * 2n);

      await expect(
        receiver.attack(core.target, usdc.target, attackAmount)
      ).to.be.revertedWithCustomError(core, "ReentrancyGuardReentrantCall");

      expect(await usdc.balanceOf(receiver.target)).to.equal(attackAmount * 2n);
      expect(await usdc.balanceOf(core.target)).to.equal(0n);
      expect(await core.nextDepositId()).to.equal(1n);
    });
  });

  // --- S11: Math Foundations & Golden Number ---
  describe("S11 -- Interest Math & Golden Number Verification [M3, M12, D9]", function () {
    it("computes exact golden number and verifies floor rounding and existence checks", async function () {
      const { usdc, core, user } = await networkHelpers.loadFixture(deployDefaultFixture);

      // (a) Token decimals and open minting
      expect(await usdc.decimals()).to.equal(6);
      await usdc.connect(user).mint(user.address, 1_000_000_000n);
      expect(await usdc.balanceOf(user.address)).to.equal(1_000_000_000n);

      // (b) Golden number on 1,000 USDC, 90d, 225 bps: exactly 5_547_945 units
      await usdc.connect(user).approve(core.target, 1_000_000_000n);
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      expect(await core.previewInterest(1)).to.equal(5_547_945n);

      // (c) Edge rounding: min=0 plan (90d, 225 bps)
      // principal <= 180 units -> interest = 0; principal == 181 -> interest = 1
      await core.createPlan(90, 225, 0, 0, 500); // planId 1
      const min0PlanId = 1n;
      await usdc.connect(user).mint(user.address, 1000n);
      await usdc.connect(user).approve(core.target, 1000n);

      await core.connect(user).openDeposit(min0PlanId, 180n); // depositId 2
      expect(await core.previewInterest(2)).to.equal(0n);

      await core.connect(user).openDeposit(min0PlanId, 181n); // depositId 3
      expect(await core.previewInterest(3)).to.equal(1n);

      // (d) DepositNotFound for id=0 and non-existent id
      await expect(core.getCertificate(0)).to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(0n);
      await expect(core.previewInterest(0)).to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(0n);
      await expect(core.getCertificate(999)).to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(999n);
      await expect(core.previewInterest(999)).to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(999n);
    });
  });

  // --- S12: ERC-721 Transferability & Enumerable ---
  describe("S12 -- ERC-721 Transferability & Enumerable [M15, Q1, D19, D31]", function () {
    it("supports secondary market transfer and updates Enumerable indices", async function () {
      const { usdc, core, user, bob } = await networkHelpers.loadFixture(deployDefaultFixture);
      const amount = 1_000_000_000n;
      await usdc.mint(user.address, amount);
      await usdc.connect(user).approve(core.target, amount);
      await core.connect(user).openDeposit(0, amount);

      expect(await core.ownerOf(1)).to.equal(user.address);
      expect(await core.balanceOf(user.address)).to.equal(1n);
      expect(await core.balanceOf(bob.address)).to.equal(0n);
      expect(await core.tokenOfOwnerByIndex(user.address, 0)).to.equal(1n);

      // Transfer token 1 from user to Bob
      await core.connect(user).transferFrom(user.address, bob.address, 1);

      expect(await core.ownerOf(1)).to.equal(bob.address);
      expect(await core.balanceOf(user.address)).to.equal(0n);
      expect(await core.balanceOf(bob.address)).to.equal(1n);
      expect(await core.tokenOfOwnerByIndex(bob.address, 0)).to.equal(1n);
    });
  });
});
