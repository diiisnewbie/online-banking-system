import { expect } from "chai";
import hre, { network } from "hardhat";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("Phase 2 -- Core Flows Test Suite (24 Scenarios)", function () {
  async function deployPhase2Fixture() {
    const [deployer, user, bob, stranger, feeReceiver] = await ethers.getSigners();

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
      PLAN0_MAX_DEPOSIT
    );

    await vault.setSavingCore(core.target);
    await vault.setFeeReceiver(feeReceiver.address);

    // Seed users and vault with USDC
    await usdc.mint(deployer.address, 1_000_000_000_000n); // 1,000,000 USDC
    await usdc.mint(user.address, 100_000_000_000n);       // 100,000 USDC
    await usdc.mint(bob.address, 100_000_000_000n);        // 100,000 USDC
    await usdc.mint(stranger.address, 10_000_000_000n);    // 10,000 USDC

    // Fund Vault with 100,000 USDC for interest payouts
    await usdc.connect(deployer).approve(vault.target, 100_000_000_000n);
    await vault.connect(deployer).fundVault(100_000_000_000n);

    // Approve SavingCore for user and bob
    await usdc.connect(user).approve(core.target, ethers.MaxUint256);
    await usdc.connect(bob).approve(core.target, ethers.MaxUint256);

    return { usdc, vault, core, deployer, user, bob, stranger, feeReceiver };
  }

  // ==========================================
  // NHOM 1: RUT DUNG HAN & RUT SOM (TC-01..06)
  // ==========================================

  it("TC-01 [M3, D11] -- Happy Path withdrawAtMaturity: 1,000 USDC, exact interest, 0 wei diff", async function () {
    const { usdc, vault, core, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    const depositAmount = 1_000_000_000n; // 1,000 USDC
    await core.connect(user).openDeposit(0, depositAmount);

    const cert = await core.getCertificate(1);
    const expectedInterest = 5_547_945n;
    expect(await core.previewInterest(1)).to.equal(expectedInterest);

    // Travel to exact maturity
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);

    const userBalBefore = await usdc.balanceOf(user.address);
    const vaultBalBefore = await usdc.balanceOf(vault.target);
    const coreBalBefore = await usdc.balanceOf(core.target);

    const tx = await core.connect(user).withdrawAtMaturity(1);
    await expect(tx)
      .to.emit(core, "Withdrawn")
      .withArgs(1, user.address, depositAmount, expectedInterest, false);

    const userBalAfter = await usdc.balanceOf(user.address);
    const vaultBalAfter = await usdc.balanceOf(vault.target);
    const coreBalAfter = await usdc.balanceOf(core.target);

    expect(userBalAfter - userBalBefore).to.equal(depositAmount + expectedInterest);
    expect(vaultBalBefore - vaultBalAfter).to.equal(expectedInterest);
    expect(coreBalBefore - coreBalAfter).to.equal(depositAmount);

    const updatedCert = await core.getCertificate(1);
    expect(updatedCert.status).to.equal(1n); // DepositStatus.Withdrawn
  });

  it("TC-02 [M4, Q5] -- Time Boundary for withdrawAtMaturity: before 1s, exact second, after grace", async function () {
    const { core, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
    const cert1 = await core.getCertificate(1);

    // 1 second before maturity -> revert NotMatured
    await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt - 1n);
    await expect(core.connect(user).withdrawAtMaturity(1))
      .to.be.revertedWithCustomError(core, "NotMatured");

    // Exact second of maturity -> success
    await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);
    await core.connect(user).withdrawAtMaturity(1);
    expect((await core.getCertificate(1)).status).to.equal(1n);

    // Second deposit: withdraw after grace period elapsed (when not auto-renewed yet)
    await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 2
    const cert2 = await core.getCertificate(2);
    const afterGrace = cert2.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 5000n;

    await networkHelpers.time.setNextBlockTimestamp(afterGrace);
    await core.connect(user).withdrawAtMaturity(2);
    expect((await core.getCertificate(2)).status).to.equal(1n);
  });

  it("TC-03 [M5, D17, D18] -- Standard earlyWithdraw: 5% penalty to feeReceiver, net to user, original principal in event", async function () {
    const { usdc, core, user, feeReceiver } = await networkHelpers.loadFixture(deployPhase2Fixture);

    const principal = 1_000_000_000n; // 1,000 USDC
    await core.connect(user).openDeposit(0, principal);
    const cert = await core.getCertificate(1);

    // Advance 30 days (before 90d maturity)
    const earlyTime = cert.startAt + 30n * 86400n;
    await networkHelpers.time.setNextBlockTimestamp(earlyTime);

    const feeReceiverBefore = await usdc.balanceOf(feeReceiver.address);
    const userBefore = await usdc.balanceOf(user.address);

    const expectedPenalty = (principal * 500n) / 10000n; // 50 USDC (50_000_000n)
    const expectedUserNet = principal - expectedPenalty;  // 950 USDC (950_000_000n)

    const tx = await core.connect(user).earlyWithdraw(1);
    await expect(tx)
      .to.emit(core, "PenaltyCharged")
      .withArgs(1, feeReceiver.address, expectedPenalty);
    await expect(tx)
      .to.emit(core, "Withdrawn")
      .withArgs(1, user.address, principal, 0n, true);

    const feeReceiverAfter = await usdc.balanceOf(feeReceiver.address);
    const userAfter = await usdc.balanceOf(user.address);

    expect(feeReceiverAfter - feeReceiverBefore).to.equal(expectedPenalty);
    expect(userAfter - userBefore).to.equal(expectedUserNet);

    const updatedCert = await core.getCertificate(1);
    expect(updatedCert.status).to.equal(1n); // Withdrawn
  });

  it("TC-04 [M5, Q5] -- Time Boundary for earlyWithdraw: at maturityAt and after maturityAt reverts AlreadyMatured", async function () {
    const { core, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    // Exact second of maturity -> AlreadyMatured
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
    await expect(core.connect(user).earlyWithdraw(1))
      .to.be.revertedWithCustomError(core, "AlreadyMatured");

    // After maturity -> AlreadyMatured
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt + 100n);
    await expect(core.connect(user).earlyWithdraw(1))
      .to.be.revertedWithCustomError(core, "AlreadyMatured");
  });

  it("TC-05 [M19] -- earlyWithdraw with penaltyBps = 0: user receives 100%, 0 transfer to feeReceiver, no PenaltyCharged event", async function () {
    const { usdc, core, deployer, user, feeReceiver } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Create plan with 0 penalty: tenor 90d, APR 225, min 0, max 0, penalty 0
    await core.connect(deployer).createPlan(90, 225, 0, 0, 0); // Plan 1

    await core.connect(user).openDeposit(1, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    await networkHelpers.time.setNextBlockTimestamp(cert.startAt + 15n * 86400n);

    const feeReceiverBefore = await usdc.balanceOf(feeReceiver.address);
    const userBefore = await usdc.balanceOf(user.address);

    const tx = await core.connect(user).earlyWithdraw(1);
    await expect(tx).to.not.emit(core, "PenaltyCharged");
    await expect(tx)
      .to.emit(core, "Withdrawn")
      .withArgs(1, user.address, 1_000_000_000n, 0n, true);

    const feeReceiverAfter = await usdc.balanceOf(feeReceiver.address);
    const userAfter = await usdc.balanceOf(user.address);

    expect(feeReceiverAfter - feeReceiverBefore).to.equal(0n);
    expect(userAfter - userBefore).to.equal(1_000_000_000n);
  });

  it("TC-06 [M7, Q2, D22, D27] -- Empty Vault on withdrawAtMaturity delivers 100% principal and defers interest", async function () {
    const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Withdraw all funds from Vault to simulate empty vault
    const vaultBal = await usdc.balanceOf(vault.target);
    await vault.connect(deployer).withdrawVault(vaultBal);
    expect(await usdc.balanceOf(vault.target)).to.equal(0n);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);

    const userBalBefore = await usdc.balanceOf(user.address);
    const coreBalBefore = await usdc.balanceOf(core.target);

    // Call withdrawAtMaturity -> should deliver 100% principal and defer interest
    const expectedInterest = 5_547_945n;
    await expect(core.connect(user).withdrawAtMaturity(1))
      .to.emit(core, "Withdrawn")
      .withArgs(1n, user.address, 1_000_000_000n, 0n, false)
      .and.to.emit(core, "InterestDeferred")
      .withArgs(1n, user.address, expectedInterest);

    // User receives 100% principal
    expect((await usdc.balanceOf(user.address)) - userBalBefore).to.equal(1_000_000_000n);
    expect(coreBalBefore - (await usdc.balanceOf(core.target))).to.equal(1_000_000_000n);

    // Cert status is Withdrawn (1n)
    expect((await core.getCertificate(1)).status).to.equal(1n);

    // Unpaid interest is recorded
    expect(await core.unpaidInterest(1)).to.equal(expectedInterest);
  });

  // ==========================================
  // NHOM 2: TAI TUC THU CONG (TC-07..09)
  // ==========================================

  it("TC-07 [M6, D12, D14] -- Valid Manual renewDeposit: compounds interest, forward-dated, snapshot new plan", async function () {
    const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Plan 1: tenor 180d, APR 400 (4.00%), min 10 USDC, max 100,000 USDC, penalty 600
    await core.connect(deployer).createPlan(180, 400, 10_000_000n, 100_000_000_000n, 600);

    const principal = 1_000_000_000n;
    await core.connect(user).openDeposit(0, principal);
    const oldCert = await core.getCertificate(1);

    const renewTime = oldCert.maturityAt + 100n;
    await networkHelpers.time.setNextBlockTimestamp(renewTime);

    const expectedOldInterest = 5_547_945n;
    const expectedNewPrincipal = principal + expectedOldInterest; // 1_005_547_945n

    const coreBalBefore = await usdc.balanceOf(core.target);

    const tx = await core.connect(user).renewDeposit(1, 1);
    await expect(tx)
      .to.emit(core, "Renewed")
      .withArgs(1, 2, expectedNewPrincipal, 1);

    // Old cert marked ManualRenewed (2)
    expect((await core.getCertificate(1)).status).to.equal(2n);

    // New cert check
    const newCert = await core.getCertificate(2);
    expect(newCert.principal).to.equal(expectedNewPrincipal);
    expect(newCert.planId).to.equal(1);
    expect(newCert.startAt).to.equal(renewTime); // Forward-dated
    expect(newCert.maturityAt).to.equal(renewTime + 180n * 86400n);
    expect(newCert.aprBpsAtOpen).to.equal(400n);
    expect(newCert.penaltyBpsAtOpen).to.equal(600n);
    expect(newCert.status).to.equal(0n); // Active

    // Ownership check
    expect(await core.ownerOf(2)).to.equal(user.address);

    // Interest transferred from Vault to Core
    const coreBalAfter = await usdc.balanceOf(core.target);
    expect(coreBalAfter - coreBalBefore).to.equal(expectedOldInterest);
  });

  it("TC-08 [M18, D14] -- Manual renewDeposit errors: matured cert with PlanDisabled, InvalidDepositAmount, NotMatured", async function () {
    const { core, deployer, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Plan 1: tenor 30d, APR 200, min 10 USDC, max 50 USDC (50_000_000n)
    await core.connect(deployer).createPlan(30, 200, 10_000_000n, 50_000_000n, 500);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    // 1. Revert NotMatured if renewing before maturity
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt - 100n);
    await expect(core.connect(user).renewDeposit(1, 1))
      .to.be.revertedWithCustomError(core, "NotMatured");

    // 2. Advance to maturity. Try renew into Plan 1 which has maxDeposit = 50 USDC (newPrincipal ~ 1005 USDC)
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
    await expect(core.connect(user).renewDeposit(1, 1))
      .to.be.revertedWithCustomError(core, "InvalidDepositAmount");

    // 3. Disable Plan 0, then try to renew into Plan 0 (cert is already matured)
    await core.connect(deployer).disablePlan(0);
    await expect(core.connect(user).renewDeposit(1, 0))
      .to.be.revertedWithCustomError(core, "PlanDisabled");
  });

  it("TC-09 [D12, Q5] -- Manual renewDeposit succeeds after grace period if not yet auto-renewed", async function () {
    const { core, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    const pastGrace = cert.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 10_000n;
    await networkHelpers.time.setNextBlockTimestamp(pastGrace);

    await core.connect(user).renewDeposit(1, 0);
    expect((await core.getCertificate(2)).status).to.equal(0n); // Active
  });

  // ==========================================
  // NHOM 3: TAI TUC TU DONG (TC-10..15)
  // ==========================================

  it("TC-10 [AR1, AR5, B3, D21] -- Valid autoRenewDeposit: permissionless caller, backdates startAt, locks old APR", async function () {
    const { core, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert1 = await core.getCertificate(1);

    const autoRenewTime = cert1.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 100n;
    await networkHelpers.time.setNextBlockTimestamp(autoRenewTime);

    // Stranger calls autoRenewDeposit
    const tx = await core.connect(stranger).autoRenewDeposit(1);
    await expect(tx)
      .to.emit(core, "Renewed")
      .withArgs(1, 2, 1_005_547_945n, 0);

    expect((await core.getCertificate(1)).status).to.equal(3n); // AutoRenewed

    const cert2 = await core.getCertificate(2);
    expect(cert2.startAt).to.equal(cert1.maturityAt); // Backdated to old maturity
    expect(cert2.maturityAt).to.equal(cert1.maturityAt + 90n * 86400n);
    expect(cert2.aprBpsAtOpen).to.equal(225n);       // Locked old APR
    expect(cert2.penaltyBpsAtOpen).to.equal(500n);   // Locked old penalty
    expect(cert2.principal).to.equal(1_005_547_945n);

    // Minted to original owner (user), not stranger
    expect(await core.ownerOf(2)).to.equal(user.address);
  });

  it("TC-11 [AR2] -- Time Boundary for autoRenewDeposit: before grace period reverts NotMatured, exact second succeeds", async function () {
    const { core, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);
    const graceTarget = cert.maturityAt + BigInt(VARIANT.gracePeriodSeconds);

    // 1s before grace expiration -> NotMatured
    await networkHelpers.time.setNextBlockTimestamp(graceTarget - 1n);
    await expect(core.connect(stranger).autoRenewDeposit(1))
      .to.be.revertedWithCustomError(core, "NotMatured");

    // Exact second of grace expiration -> succeeds
    await networkHelpers.time.setNextBlockTimestamp(graceTarget);
    await core.connect(stranger).autoRenewDeposit(1);
    expect((await core.getCertificate(2)).status).to.equal(0n);
  });

  it("TC-12 [AR3, AR4] -- autoRenewDeposit bypasses disabled plan and maxDeposit cap", async function () {
    const { core, deployer, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Plan 1: tenor 30d, APR 200, min 10 USDC, max 20 USDC
    await core.connect(deployer).createPlan(30, 200, 10_000_000n, 20_000_000n, 500);

    // Open 15 USDC
    await core.connect(user).openDeposit(1, 15_000_000n);
    const cert = await core.getCertificate(1);

    // Admin disables Plan 1
    await core.connect(deployer).disablePlan(1);

    // Advance past grace
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 100n);

    // Auto renew succeeds even though Plan 1 is disabled
    await core.connect(stranger).autoRenewDeposit(1);
    expect((await core.getCertificate(2)).status).to.equal(0n); // Active
  });

  it("TC-13 [AR6] -- autoRenewDeposit safe for non-receiver contracts via _mint", async function () {
    const { usdc, core, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    // Transfer NFT to MockUSDC contract address (which does NOT implement IERC721Receiver) using unsafe transferFrom
    await core.connect(user).transferFrom(user.address, usdc.target, 1);
    expect(await core.ownerOf(1)).to.equal(usdc.target);

    // Advance past grace
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 100n);

    // autoRenewDeposit mints via _mint without reverting on ERC721Receiver callback
    await core.connect(stranger).autoRenewDeposit(1);
    expect(await core.ownerOf(2)).to.equal(usdc.target);
  });

  it("TC-14 [AR8] -- Chain Backdate consecutive renewals when bot delayed 100 days (30d tenor, 3d grace)", async function () {
    const { core, deployer, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Create 30-day plan
    await core.connect(deployer).createPlan(30, 225, 0, 0, 500); // Plan 1
    const tenor30 = 30n * 86400n;

    await core.connect(user).openDeposit(1, 1_000_000_000n); // ID 1
    const cert1 = await core.getCertificate(1);
    const T0 = cert1.maturityAt;

    // Fast forward to T0 + 100 days
    const nowTime = T0 + 100n * 86400n;
    await networkHelpers.time.setNextBlockTimestamp(nowTime);

    // Call 1: renews Cert 1 -> creates Cert 2
    await core.connect(stranger).autoRenewDeposit(1);
    const cert2 = await core.getCertificate(2);
    expect(cert2.startAt).to.equal(T0);
    expect(cert2.maturityAt).to.equal(T0 + tenor30);

    // Call 2: renews Cert 2 -> creates Cert 3
    await core.connect(stranger).autoRenewDeposit(2);
    const cert3 = await core.getCertificate(3);
    expect(cert3.startAt).to.equal(cert2.maturityAt);
    expect(cert3.maturityAt).to.equal(T0 + tenor30 * 2n);

    // Call 3: renews Cert 3 -> creates Cert 4
    await core.connect(stranger).autoRenewDeposit(3);
    const cert4 = await core.getCertificate(4);
    expect(cert4.startAt).to.equal(cert3.maturityAt);
    expect(cert4.maturityAt).to.equal(T0 + tenor30 * 3n);

    // Call 4: renews Cert 4 -> creates Cert 5 [T0 + 90d, T0 + 120d]
    await core.connect(stranger).autoRenewDeposit(4);
    const cert5 = await core.getCertificate(5);
    expect(cert5.startAt).to.equal(T0 + 90n * 86400n);
    expect(cert5.maturityAt).to.equal(T0 + 120n * 86400n);

    // Call 5: Cert 5 maturity is T0 + 120d; needs now >= T0 + 123d, but now is T0 + 100d -> Reverts!
    await expect(core.connect(stranger).autoRenewDeposit(5))
      .to.be.revertedWithCustomError(core, "NotMatured");
  });

  it("TC-15 [M9, D24] -- Vault empty during renewDeposit and autoRenewDeposit reverts InsufficientVaultLiquidity", async function () {
    const { usdc, vault, core, deployer, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Empty vault before opening deposits so committed == 0
    await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
    expect(await usdc.balanceOf(vault.target)).to.equal(0n);

    await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
    await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 2
    const cert1 = await core.getCertificate(1);

    // Try manual renew
    await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);
    await expect(core.connect(user).renewDeposit(1, 0))
      .to.be.revertedWithCustomError(vault, "InsufficientVaultLiquidity");

    // Try auto renew past grace
    await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 100n);
    await expect(core.connect(stranger).autoRenewDeposit(2))
      .to.be.revertedWithCustomError(vault, "InsufficientVaultLiquidity");
  });

  // ==========================================
  // NHOM 4: BAO MAT, PHAN QUYEN & BAT BIEN (TC-16..24)
  // ==========================================

  it("TC-16 [M17, AR7] -- Inactive status matrix: 4 functions x 3 inactive statuses revert DepositNotActive", async function () {
    const { core, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Setup:
    // Cert 1 -> Withdrawn
    await core.connect(user).openDeposit(0, 1_000_000_000n);
    await core.connect(user).earlyWithdraw(1);

    // Cert 2 -> ManualRenewed
    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert2 = await core.getCertificate(2);
    await networkHelpers.time.setNextBlockTimestamp(cert2.maturityAt);
    await core.connect(user).renewDeposit(2, 0);

    // Cert 3 -> AutoRenewed
    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert3 = await core.getCertificate(4); // ID 4 because renewDeposit created ID 3
    await networkHelpers.time.setNextBlockTimestamp(cert3.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 100n);
    await core.connect(stranger).autoRenewDeposit(4);

    const inactiveIds = [1, 2, 4];

    for (const id of inactiveIds) {
      await expect(core.connect(user).withdrawAtMaturity(id))
        .to.be.revertedWithCustomError(core, "DepositNotActive");
      await expect(core.connect(user).earlyWithdraw(id))
        .to.be.revertedWithCustomError(core, "DepositNotActive");
      await expect(core.connect(user).renewDeposit(id, 0))
        .to.be.revertedWithCustomError(core, "DepositNotActive");
      await expect(core.connect(stranger).autoRenewDeposit(id))
        .to.be.revertedWithCustomError(core, "DepositNotActive");
    }
  });

  it("TC-17 [M11, M15] -- Ownership enforcement & NFT transferability across core flows", async function () {
    const { core, user, bob, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    // Stranger tries user flows -> NotDepositOwner
    await expect(core.connect(stranger).withdrawAtMaturity(1))
      .to.be.revertedWithCustomError(core, "NotDepositOwner");
    await expect(core.connect(stranger).earlyWithdraw(1))
      .to.be.revertedWithCustomError(core, "NotDepositOwner");
    await expect(core.connect(stranger).renewDeposit(1, 0))
      .to.be.revertedWithCustomError(core, "NotDepositOwner");

    // Alice transfers NFT to Bob
    await core.connect(user).transferFrom(user.address, bob.address, 1);
    expect(await core.ownerOf(1)).to.equal(bob.address);

    // Alice now fails
    await expect(core.connect(user).earlyWithdraw(1))
      .to.be.revertedWithCustomError(core, "NotDepositOwner");

    // Bob can withdraw
    await core.connect(bob).earlyWithdraw(1);
    expect((await core.getCertificate(1)).status).to.equal(1n);
  });

  it("TC-18 [D32] -- DepositNotFound checks for 0 and non-existent IDs on all 4 functions, check order test", async function () {
    const { core, deployer, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    const badIds = [0, 999];
    for (const badId of badIds) {
      await expect(core.connect(user).withdrawAtMaturity(badId))
        .to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(badId);
      await expect(core.connect(user).earlyWithdraw(badId))
        .to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(badId);
      await expect(core.connect(user).renewDeposit(badId, 0))
        .to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(badId);
      await expect(core.connect(stranger).autoRenewDeposit(badId))
        .to.be.revertedWithCustomError(core, "DepositNotFound").withArgs(badId);
    }

    // Check order: stranger calls renewDeposit on Alice's cert with a disabled plan
    // Must receive NotDepositOwner BEFORE PlanDisabled
    await core.connect(user).openDeposit(0, 1_000_000_000n);
    await core.connect(deployer).disablePlan(0);

    await expect(core.connect(stranger).renewDeposit(1, 0))
      .to.be.revertedWithCustomError(core, "NotDepositOwner");
  });

  it("TC-19 [M16, Q7] -- Reentrancy attack on renewDeposit via _safeMint callback", async function () {
    const { usdc, core, deployer } = await networkHelpers.loadFixture(deployPhase2Fixture);

    const ReentrantReceiver = await ethers.getContractFactory("ReentrantReceiver");
    const receiver = await ReentrantReceiver.deploy();

    // Fund receiver with USDC
    await usdc.mint(receiver.target, 5_000_000_000n);

    // Receiver opens a legitimate deposit without attacking
    await receiver.openLegitimate(core.target, usdc.target, 1_000_000_000n);
    expect(await core.ownerOf(1)).to.equal(receiver.target);

    const cert = await core.getCertificate(1);
    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);

    // Attack renew: inside onERC721Received, it attempts to reenter renewDeposit
    await expect(receiver.attackRenew(core.target, usdc.target, 1, 0))
      .to.be.revertedWithCustomError(core, "ReentrancyGuardReentrantCall");
  });

  it("TC-20 [I1] -- Snapshot Invariant 15 points: admin lowers APR, withdrawAtMaturity and renewDeposit preserve old APR", async function () {
    const { core, deployer, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Open two deposits in Plan 0 (APR 225)
    await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
    await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 2

    // Admin updates Plan 0 APR to 100 bps
    await core.connect(deployer).updatePlan(0, 100);

    const cert1 = await core.getCertificate(1);
    await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);

    // Deposit 1: withdrawAtMaturity uses old APR 225 -> interest is 5_547_945
    const tx1 = await core.connect(user).withdrawAtMaturity(1);
    await expect(tx1)
      .to.emit(core, "Withdrawn")
      .withArgs(1, user.address, 1_000_000_000n, 5_547_945n, false);

    // Deposit 2: renewDeposit uses old APR 225 for old interest -> newPrincipal is 1_005_547_945n
    const tx2 = await core.connect(user).renewDeposit(2, 0);
    await expect(tx2)
      .to.emit(core, "Renewed")
      .withArgs(2, 3, 1_005_547_945n, 0);
  });

  it("TC-21 [M12] -- Rounding verification: odd principal 1_000_001n and zero-interest boundary 180 vs 181", async function () {
    const { core, deployer, user } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // 1. Odd principal 1_000_001n on 90d/225bps
    // (1_000_001 * 225 * 90) / 3_650_000 = 5547
    await core.connect(deployer).createPlan(90, 225, 0, 0, 500); // Plan 1 (min 0)
    await core.connect(user).openDeposit(1, 1_000_001n);
    expect(await core.previewInterest(1)).to.equal(5547n);

    // 2. Zero interest boundary on 90d/225bps:
    // 180 * 225 * 90 / 3_650_000 = 3_645_000 / 3_650_000 = 0
    await core.connect(user).openDeposit(1, 180n);
    expect(await core.previewInterest(2)).to.equal(0n);

    // 181 * 225 * 90 / 3_650_000 = 3_665_250 / 3_650_000 = 1
    await core.connect(user).openDeposit(1, 181n);
    expect(await core.previewInterest(3)).to.equal(1n);
  });

  it("TC-22 [M20] -- feeReceiver management: zero address rejection and redirecting early penalty to new receiver", async function () {
    const { usdc, vault, core, deployer, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Revert on zero address
    await expect(vault.connect(deployer).setFeeReceiver(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(vault, "ZeroAddress");

    // Update to stranger
    await expect(vault.connect(deployer).setFeeReceiver(stranger.address))
      .to.emit(vault, "FeeReceiverSet")
      .withArgs(stranger.address);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    await networkHelpers.time.setNextBlockTimestamp(cert.startAt + 10n * 86400n);

    const strangerBefore = await usdc.balanceOf(stranger.address);
    await core.connect(user).earlyWithdraw(1);
    const strangerAfter = await usdc.balanceOf(stranger.address);

    expect(strangerAfter - strangerBefore).to.equal(50_000_000n); // 50 USDC penalty
  });

  it("TC-23 [M10, M21] -- System pause/unpause: blocks all 4 user flows, rescue fundVault succeeds, unpause restores operations", async function () {
    const { usdc, vault, core, deployer, user, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    await core.connect(user).openDeposit(0, 1_000_000_000n);
    const cert = await core.getCertificate(1);

    await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);

    // Pause system
    await vault.connect(deployer).pause();

    await expect(core.connect(user).withdrawAtMaturity(1))
      .to.be.revertedWithCustomError(core, "SystemPaused");
    await expect(core.connect(user).earlyWithdraw(1))
      .to.be.revertedWithCustomError(core, "SystemPaused");
    await expect(core.connect(user).renewDeposit(1, 0))
      .to.be.revertedWithCustomError(core, "SystemPaused");
    await expect(core.connect(stranger).autoRenewDeposit(1))
      .to.be.revertedWithCustomError(core, "SystemPaused");

    // Rescue fundVault works during pause (M10 / D1)
    await usdc.connect(deployer).approve(vault.target, 1_000_000n);
    await vault.connect(deployer).fundVault(1_000_000n);

    // Unpause
    await vault.connect(deployer).unpause();
    await core.connect(user).withdrawAtMaturity(1);
    expect((await core.getCertificate(1)).status).to.equal(1n);
  });

  it("TC-24 [I3] -- SavingCore USDC balance equals sum of active deposit principals", async function () {
    const { usdc, core, deployer, user, bob, stranger } = await networkHelpers.loadFixture(deployPhase2Fixture);

    // Setup 3 deposits
    await core.connect(user).openDeposit(0, 10_000_000n);  // ID 1 (10 USDC)
    await core.connect(bob).openDeposit(0, 20_000_000n);   // ID 2 (20 USDC)
    await core.connect(user).openDeposit(0, 30_000_000n);  // ID 3 (30 USDC)

    const cert2 = await core.getCertificate(2);
    const cert3 = await core.getCertificate(3);

    // Early withdraw ID 1
    await core.connect(user).earlyWithdraw(1);

    // Advance to maturity of ID 2 and manual renew ID 2 -> creates ID 4
    await networkHelpers.time.setNextBlockTimestamp(cert2.maturityAt);
    await core.connect(bob).renewDeposit(2, 0);

    // Advance past grace of ID 3 and auto renew ID 3 -> creates ID 5
    await networkHelpers.time.setNextBlockTimestamp(cert3.maturityAt + BigInt(VARIANT.gracePeriodSeconds) + 100n);
    await core.connect(stranger).autoRenewDeposit(3);

    // Calculate sum of active principals
    const nextId = await core.nextDepositId();
    let sumActivePrincipal = 0n;

    for (let id = 1n; id < nextId; id++) {
      const cert = await core.getCertificate(id);
      if (cert.status === 0n) { // Active
        sumActivePrincipal += cert.principal;
      }
    }

    const coreBalance = await usdc.balanceOf(core.target);
    expect(coreBalance).to.equal(sumActivePrincipal);
  });
});
