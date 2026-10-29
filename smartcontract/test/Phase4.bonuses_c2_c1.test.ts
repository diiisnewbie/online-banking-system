import { expect } from "chai";
import hre, { network } from "hardhat";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("Phase 4 -- Bonuses C2 & C1 Test Suite (19 Scenarios)", function () {
  async function deployPhase4Fixture() {
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
      PLAN0_MAX_DEPOSIT,
      0n
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

    // User and Bob approve SavingCore
    await usdc.connect(user).approve(core.target, ethers.MaxUint256);
    await usdc.connect(bob).approve(core.target, ethers.MaxUint256);
    await usdc.connect(stranger).approve(core.target, ethers.MaxUint256);

    return { usdc, vault, core, deployer, user, bob, stranger, feeReceiver };
  }

  async function deployUnwiredVaultFixture() {
    const [deployer, user, stranger] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    const vault = await VaultManager.deploy(usdc.target, deployer.address);

    await usdc.mint(deployer.address, 100_000_000_000n);
    await usdc.connect(deployer).approve(vault.target, 100_000_000_000n);

    return { usdc, vault, deployer, user, stranger };
  }

  // =========================================================================
  // NHOM 1: C1 — PRINCIPAL IS ALWAYS SAFE (DEFERRED INTEREST / HOAN TRA LAI)
  // =========================================================================
  describe("C1 — Principal is always safe (Deferred Interest)", function () {
    it("TC-C1-01 [M8-1] -- claimPendingInterest all-or-nothing: reverts ClaimNotCovered when Vault lacks liquidity, unpaid preserved", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Drain Vault to simulate empty vault
      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
      expect(await usdc.balanceOf(vault.target)).to.equal(0n);

      // Open deposit 1,000 USDC
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const cert = await core.getCertificate(1);

      // Fast forward to maturity
      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);

      // Withdraw at maturity -> defers interest
      await core.connect(user).withdrawAtMaturity(1);
      const expectedInterest = 5_547_945n;
      expect(await core.unpaidInterest(1)).to.equal(expectedInterest);

      // Attempt claim when Vault is empty -> revert ClaimNotCovered
      await expect(core.connect(user).claimPendingInterest(1))
        .to.be.revertedWithCustomError(core, "ClaimNotCovered");

      // Debt is preserved
      expect(await core.unpaidInterest(1)).to.equal(expectedInterest);
    });

    it("TC-C1-02 [M8-2] -- claimPendingInterest succeeds after fundVault, clears debt, reduces commitment, emits InterestClaimed", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const cert = await core.getCertificate(1);

      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
      await core.connect(user).withdrawAtMaturity(1);
      const expectedInterest = 5_547_945n;

      // Committed interest still includes the unpaid debt
      expect(await core.totalCommittedInterest()).to.equal(expectedInterest);

      // Admin funds Vault with 10 USDC
      await usdc.mint(deployer.address, 10_000_000n);
      await usdc.connect(deployer).approve(vault.target, 10_000_000n);
      await vault.connect(deployer).fundVault(10_000_000n);

      const userBalBefore = await usdc.balanceOf(user.address);

      // Claim pending interest
      await expect(core.connect(user).claimPendingInterest(1))
        .to.emit(core, "InterestClaimed")
        .withArgs(1n, user.address, expectedInterest);

      // User received interest
      expect((await usdc.balanceOf(user.address)) - userBalBefore).to.equal(expectedInterest);

      // Unpaid debt cleared to 0
      expect(await core.unpaidInterest(1)).to.equal(0n);

      // Committed interest reduced to 0
      expect(await core.totalCommittedInterest()).to.equal(0n);
    });

    it("TC-C1-03 [M8-3, Q1] -- claimPendingInterest follows NFT ownership: old owner blocked, new owner claims successfully", async function () {
      const { usdc, vault, core, deployer, user, bob } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
      await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
      const cert = await core.getCertificate(1);

      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
      await core.connect(user).withdrawAtMaturity(1);
      const expectedInterest = 5_547_945n;

      // User transfers NFT #1 to Bob
      await core.connect(user).transferFrom(user.address, bob.address, 1);
      expect(await core.ownerOf(1)).to.equal(bob.address);

      // Fund Vault
      await usdc.mint(deployer.address, 10_000_000n);
      await usdc.connect(deployer).approve(vault.target, 10_000_000n);
      await vault.connect(deployer).fundVault(10_000_000n);

      // User (old owner) calling claim reverts NotDepositOwner
      await expect(core.connect(user).claimPendingInterest(1))
        .to.be.revertedWithCustomError(core, "NotDepositOwner");

      // Bob (current owner) calling claim succeeds
      const bobBalBefore = await usdc.balanceOf(bob.address);
      await expect(core.connect(bob).claimPendingInterest(1))
        .to.emit(core, "InterestClaimed")
        .withArgs(1n, bob.address, expectedInterest);
      expect((await usdc.balanceOf(bob.address)) - bobBalBefore).to.equal(expectedInterest);
      expect(await core.unpaidInterest(1)).to.equal(0n);
    });

    it("TC-C1-04 [M8-4, D33] -- claimPendingInterest when unpaid == 0 reverts NoPendingInterest", async function () {
      const { core, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Open and withdraw with full interest paid (Vault is funded)
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const cert = await core.getCertificate(1);

      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
      await core.connect(user).withdrawAtMaturity(1);

      expect(await core.unpaidInterest(1)).to.equal(0n);

      // Calling claimPendingInterest on cert with 0 unpaid interest reverts NoPendingInterest
      await expect(core.connect(user).claimPendingInterest(1))
        .to.be.revertedWithCustomError(core, "NoPendingInterest");
    });

    it("TC-C1-05 [M8-5] -- claimPendingInterest with non-existent ID reverts DepositNotFound", async function () {
      const { core, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await expect(core.connect(user).claimPendingInterest(0))
        .to.be.revertedWithCustomError(core, "DepositNotFound")
        .withArgs(0n);

      await expect(core.connect(user).claimPendingInterest(999))
        .to.be.revertedWithCustomError(core, "DepositNotFound")
        .withArgs(999n);
    });

    it("TC-C1-06 [M8-6] -- Check order: stranger calling Alice's cert without debt reverts NotDepositOwner (no debt leak)", async function () {
      const { core, user, stranger } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const cert = await core.getCertificate(1);

      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
      await core.connect(user).withdrawAtMaturity(1); // fully paid

      // Stranger calls claim on Alice's cert (unpaid is 0)
      // Expect NotDepositOwner (not NoPendingInterest), protecting privacy
      await expect(core.connect(stranger).claimPendingInterest(1))
        .to.be.revertedWithCustomError(core, "NotDepositOwner");
    });

    it("TC-C1-07 [M10] -- Emergency Pause: claimPendingInterest reverts SystemPaused, fundVault succeeds during pause", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const cert = await core.getCertificate(1);

      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
      await core.connect(user).withdrawAtMaturity(1);

      // Pause the system
      await vault.connect(deployer).pause();

      // claimPendingInterest reverts SystemPaused
      await expect(core.connect(user).claimPendingInterest(1))
        .to.be.revertedWithCustomError(core, "SystemPaused");

      // Rescue fundVault succeeds during pause
      await usdc.mint(deployer.address, 10_000_000n);
      await usdc.connect(deployer).approve(vault.target, 10_000_000n);
      await expect(vault.connect(deployer).fundVault(10_000_000n))
        .to.emit(vault, "VaultFunded");

      // Still paused -> claim still blocked
      await expect(core.connect(user).claimPendingInterest(1))
        .to.be.revertedWithCustomError(core, "SystemPaused");

      // Unpause -> claim succeeds
      await vault.connect(deployer).unpause();
      await expect(core.connect(user).claimPendingInterest(1))
        .to.emit(core, "InterestClaimed");
    });

    it("TC-C1-08 [FCFS] -- First-Come-First-Served when Vault partially funded", async function () {
      const { usdc, vault, core, deployer, user, bob } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Empty vault
      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));

      // Alice (user) and Bob open deposits
      await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
      await core.connect(bob).openDeposit(0, 1_000_000_000n);  // ID 2

      const cert1 = await core.getCertificate(1);
      await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);

      // Both withdraw at maturity with empty vault -> both get interest deferred
      await core.connect(user).withdrawAtMaturity(1);
      await core.connect(bob).withdrawAtMaturity(2);

      const debt = 5_547_945n;
      expect(await core.unpaidInterest(1)).to.equal(debt);
      expect(await core.unpaidInterest(2)).to.equal(debt);

      // Admin only funds Vault with 6 USDC (enough for ONE claim only)
      await usdc.mint(deployer.address, 6_000_000n);
      await usdc.connect(deployer).approve(vault.target, 6_000_000n);
      await vault.connect(deployer).fundVault(6_000_000n);

      // Alice claims first -> succeeds
      await expect(core.connect(user).claimPendingInterest(1))
        .to.emit(core, "InterestClaimed")
        .withArgs(1n, user.address, debt);

      // Remaining vault balance is 6M - 5.547945M = 452_055n
      expect(await usdc.balanceOf(vault.target)).to.equal(6_000_000n - debt);

      // Bob claims second -> reverts ClaimNotCovered (insufficient funds left)
      await expect(core.connect(bob).claimPendingInterest(2))
        .to.be.revertedWithCustomError(core, "ClaimNotCovered");

      // Admin adds more funds (10 USDC)
      await usdc.mint(deployer.address, 10_000_000n);
      await usdc.connect(deployer).approve(vault.target, 10_000_000n);
      await vault.connect(deployer).fundVault(10_000_000n);

      // Bob claims again -> succeeds
      await expect(core.connect(bob).claimPendingInterest(2))
        .to.emit(core, "InterestClaimed")
        .withArgs(2n, bob.address, debt);
      expect(await core.unpaidInterest(2)).to.equal(0n);
    });
  });

  // =========================================================================
  // NHOM 2: C2 — SOLVENCY GUARD (BAO VE THANH KHOAN LAI CAM KET)
  // =========================================================================
  describe("C2 — Solvency Guard (Bảo vệ thanh khoản lãi cam kết)", function () {
    it("TC-C2-01 [M14-1] -- withdrawVault succeeds when amount <= balance - committed", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Vault has 100,000 USDC. User opens 1,000 USDC -> committed = 5_547_945n
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const committed = await core.totalCommittedInterest();
      expect(committed).to.equal(5_547_945n);

      const vaultBal = await usdc.balanceOf(vault.target);
      // Safe withdrawal amount: 50,000 USDC
      const withdrawAmount = 50_000_000_000n;
      expect(vaultBal - withdrawAmount).to.be.gte(committed);

      await expect(vault.connect(deployer).withdrawVault(withdrawAmount))
        .to.emit(vault, "VaultWithdrawn")
        .withArgs(deployer.address, withdrawAmount);
    });

    it("TC-C2-02 [M14-2] -- withdrawVault reverts InsufficientCommitted when balance - amount < committed", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const committed = await core.totalCommittedInterest();
      const vaultBal = await usdc.balanceOf(vault.target);

      // Try to withdraw so remaining is committed - 1
      const excessWithdraw = vaultBal - committed + 1n;

      await expect(vault.connect(deployer).withdrawVault(excessWithdraw))
        .to.be.revertedWithCustomError(vault, "InsufficientCommitted");
    });

    it("TC-C2-03 [M14-3] -- withdrawVault reverts AmountExceedsBalance when amount > balance without panic underflow", async function () {
      const { usdc, vault, deployer } = await networkHelpers.loadFixture(deployPhase4Fixture);

      const vaultBal = await usdc.balanceOf(vault.target);
      // amount > balance reverts AmountExceedsBalance first
      await expect(vault.connect(deployer).withdrawVault(vaultBal + 1n))
        .to.be.revertedWithCustomError(vault, "AmountExceedsBalance");
    });

    it("TC-C2-04 [M14-4, C.1] -- Debt-Guard: unpaidInterest protects Vault balance together with active commitments", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Empty vault
      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));

      // Open deposit & mature & defer interest
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const cert = await core.getCertificate(1);
      await networkHelpers.time.setNextBlockTimestamp(cert.maturityAt);
      await core.connect(user).withdrawAtMaturity(1);

      const unpaid = await core.unpaidInterest(1);
      expect(await core.totalCommittedInterest()).to.equal(unpaid);

      // Fund Vault with unpaid + 2 USDC
      const buffer = 2_000_000n;
      await usdc.mint(deployer.address, unpaid + buffer);
      await usdc.connect(deployer).approve(vault.target, unpaid + buffer);
      await vault.connect(deployer).fundVault(unpaid + buffer);

      // Withdraw buffer (2 USDC) succeeds
      await expect(vault.connect(deployer).withdrawVault(buffer))
        .to.emit(vault, "VaultWithdrawn");

      // Withdraw 1 wei more reverts InsufficientCommitted
      await expect(vault.connect(deployer).withdrawVault(1n))
        .to.be.revertedWithCustomError(vault, "InsufficientCommitted");
    });

    it("TC-C2-05 [M14-5, D34] -- unwired VaultManager allows free withdrawal when savingCore == address(0)", async function () {
      const { usdc, vault, deployer } = await networkHelpers.loadFixture(deployUnwiredVaultFixture);

      const fundAmount = 10_000_000_000n; // 10,000 USDC
      await vault.connect(deployer).fundVault(fundAmount);

      expect(await vault.savingCore()).to.equal(ethers.ZeroAddress);

      // Can withdraw full amount freely since savingCore is not wired
      await expect(vault.connect(deployer).withdrawVault(fundAmount))
        .to.emit(vault, "VaultWithdrawn")
        .withArgs(deployer.address, fundAmount);
    });

    it("TC-C2-05b [M14-EOA] -- VaultManager with savingCore set to EOA reverts on withdrawVault due to staticcall decode", async function () {
      const { vault, deployer, user } = await networkHelpers.loadFixture(deployUnwiredVaultFixture);

      // Wire savingCore to an EOA (user.address)
      await vault.connect(deployer).setSavingCore(user.address);
      expect(await vault.savingCore()).to.equal(user.address);

      const fundAmount = 5_000_000_000n;
      await vault.connect(deployer).fundVault(fundAmount);

      // Calling withdrawVault attempts staticcall to EOA, returns 0 bytes, fails to decode uint256
      await expect(vault.connect(deployer).withdrawVault(1_000_000_000n))
        .to.be.rejected;
    });

    it("TC-C2-06 [M14-6] -- withdrawVault when paused reverts EnforcedPause", async function () {
      const { vault, deployer } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await vault.connect(deployer).pause();
      await expect(vault.connect(deployer).withdrawVault(1_000_000n))
        .to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("TC-C2-07 [M13, D30] -- Mathematical audit of totalCommittedInterest across all 7 flow transitions", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Plan 1: 30 days, 300 bps (3.00%)
      await core.connect(deployer).createPlan(30, 300, 10_000_000n, 50_000_000_000n, 500);

      // Step 0: Initial commitment = 0
      expect(await core.totalCommittedInterest()).to.equal(0n);

      // Pre-fund Vault with exactly enough liquidity for the 2 renew payouts (5_547_945n + 2_479_433n = 8_027_378n)
      // Withdraw initial excess so Vault runs empty after auto-renew naturally
      const exactRenewPayouts = 5_547_945n + 2_479_433n;
      const initialVaultBal = await usdc.balanceOf(vault.target);
      await vault.connect(deployer).withdrawVault(initialVaultBal - exactRenewPayouts);
      expect(await usdc.balanceOf(vault.target)).to.equal(exactRenewPayouts);

      // Step 1: openDeposit #1 (1,000 USDC, 90d, 225bps)
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const interest1 = 5_547_945n;
      expect(await core.totalCommittedInterest()).to.equal(interest1);

      // Step 2: openDeposit #2 (2,000 USDC, 90d, 225bps)
      await core.connect(user).openDeposit(0, 2_000_000_000n);
      const interest2 = 11_095_890n;
      expect(await core.totalCommittedInterest()).to.equal(interest1 + interest2);

      // Step 3: earlyWithdraw #2 -> forfeits planned interest
      await core.connect(user).earlyWithdraw(2);
      expect(await core.totalCommittedInterest()).to.equal(interest1);

      // Step 4: renewDeposit #1 into Plan 1 (30d, 300bps)
      const cert1 = await core.getCertificate(1);
      await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);

      const newPrincipal = 1_000_000_000n + interest1; // 1005547945
      // Expected new interest: (1005547945 * 300 * 30 days) / (365 days * 10000) = 2479433
      const expectedNewInterest = (newPrincipal * 300n * 30n * 86400n) / (365n * 86400n * 10000n);
      await core.connect(user).renewDeposit(1, 1); // ID 3
      expect(await core.totalCommittedInterest()).to.equal(expectedNewInterest);

      // Step 5: autoRenewDeposit #3 past grace
      const cert3 = await core.getCertificate(3);
      const grace = await core.gracePeriod();
      await networkHelpers.time.setNextBlockTimestamp(cert3.maturityAt + grace + 10n);

      const newPrincipal2 = newPrincipal + expectedNewInterest;
      const expectedNewInterest2 = (newPrincipal2 * 300n * 30n * 86400n) / (365n * 86400n * 10000n);
      await core.connect(user).autoRenewDeposit(3); // ID 4
      expect(await core.totalCommittedInterest()).to.equal(expectedNewInterest2);

      // Step 6: Vault is now naturally empty (0 USDC < expectedNewInterest2), withdrawAtMaturity defers interest
      expect(await usdc.balanceOf(vault.target)).to.equal(0n);
      const cert4 = await core.getCertificate(4);
      await networkHelpers.time.setNextBlockTimestamp(cert4.maturityAt);

      await core.connect(user).withdrawAtMaturity(4);
      // totalCommittedInterest remains unchanged (active -> unpaid, net = 0)
      expect(await core.totalCommittedInterest()).to.equal(expectedNewInterest2);
      expect(await core.unpaidInterest(4)).to.equal(expectedNewInterest2);

      // Step 7: Fund Vault and claimPendingInterest #4 -> commitment goes to 0
      await usdc.mint(deployer.address, expectedNewInterest2);
      await usdc.connect(deployer).approve(vault.target, expectedNewInterest2);
      await vault.connect(deployer).fundVault(expectedNewInterest2);

      await core.connect(user).claimPendingInterest(4);
      expect(await core.totalCommittedInterest()).to.equal(0n);
      expect(await core.unpaidInterest(4)).to.equal(0n);
    });

    it("TC-C2-08 [I2] -- Invariant after openDeposit: totalCommittedInterest == sum(Active interest)", async function () {
      const { core, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
      await core.connect(user).openDeposit(0, 2_000_000_000n); // ID 2
      await core.connect(user).openDeposit(0, 5_000_000_000n); // ID 3

      const preview1 = await core.previewInterest(1);
      const preview2 = await core.previewInterest(2);
      const preview3 = await core.previewInterest(3);

      expect(await core.totalCommittedInterest()).to.equal(preview1 + preview2 + preview3);
    });

    it("TC-C2-09 [I3] -- Asset balance invariant: usdc.balanceOf(SavingCore) == sum(Active principal) across deferred interest and claims", async function () {
      const { usdc, vault, core, deployer, user, bob } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Empty vault before opening deposits so committed == 0
      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
      expect(await usdc.balanceOf(vault.target)).to.equal(0n);

      // Alice opens 1,000 USDC; Bob opens 2,000 USDC
      await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
      await core.connect(bob).openDeposit(0, 2_000_000_000n);  // ID 2

      expect(await usdc.balanceOf(core.target)).to.equal(3_000_000_000n);

      // Alice withdraws at maturity -> receives 100% principal (1,000 USDC), interest deferred
      const cert1 = await core.getCertificate(1);
      await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);
      await core.connect(user).withdrawAtMaturity(1);

      // SavingCore holds Bob's active principal only (2,000 USDC)
      expect(await usdc.balanceOf(core.target)).to.equal(2_000_000_000n);

      // Admin funds Vault with Alice's deferred interest
      const aliceDebt = await core.unpaidInterest(1);
      await usdc.mint(deployer.address, aliceDebt);
      await usdc.connect(deployer).approve(vault.target, aliceDebt);
      await vault.connect(deployer).fundVault(aliceDebt);

      // Alice claims deferred interest from Vault
      await core.connect(user).claimPendingInterest(1);

      // Invariant holds: SavingCore balance still exactly equals Bob's active principal
      // Claim came directly from VaultManager, not touching SavingCore!
      expect(await usdc.balanceOf(core.target)).to.equal(2_000_000_000n);
    });

    it("TC-C2-10 [Edge C.2] -- Caveat Undercollateralization: balance < committed after renew locks withdrawVault(0)", async function () {
      const { usdc, vault, core, deployer, user } = await networkHelpers.loadFixture(deployPhase4Fixture);

      // Empty vault initially
      await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));

      // User opens 1,000 USDC deposit -> interest is 5_547_945n
      await core.connect(user).openDeposit(0, 1_000_000_000n);
      const initialCommitted = await core.totalCommittedInterest();
      expect(initialCommitted).to.equal(5_547_945n);

      // Admin funds Vault with EXACTLY the committed amount (balance == committed)
      await usdc.mint(deployer.address, initialCommitted);
      await usdc.connect(deployer).approve(vault.target, initialCommitted);
      await vault.connect(deployer).fundVault(initialCommitted);

      expect(await usdc.balanceOf(vault.target)).to.equal(initialCommitted);

      // Fast forward to maturity and renew
      const cert1 = await core.getCertificate(1);
      await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);

      // User renews: oldInterest (5_547_945n) is paid from Vault into SavingCore to compound
      await core.connect(user).renewDeposit(1, 0);

      // Vault is now EMPTY (balance == 0)
      expect(await usdc.balanceOf(vault.target)).to.equal(0n);

      // But committed interest is now greater than 0 (I_new on new compounded principal)
      const newCommitted = await core.totalCommittedInterest();
      expect(newCommitted).to.be.gt(0n);

      // Balance (0) < Committed (newCommitted) -> Undercollateralized state
      expect(await usdc.balanceOf(vault.target)).to.be.lt(newCommitted);

      // Even withdrawing 0 USDC is locked by Solvency Guard until Admin funds Vault
      await expect(vault.connect(deployer).withdrawVault(0n))
        .to.be.revertedWithCustomError(vault, "InsufficientCommitted");

      // Once Admin replenishes Vault with newCommitted, withdrawVault(0) succeeds again
      await usdc.mint(deployer.address, newCommitted);
      await usdc.connect(deployer).approve(vault.target, newCommitted);
      await vault.connect(deployer).fundVault(newCommitted);

      await expect(vault.connect(deployer).withdrawVault(0n))
        .to.emit(vault, "VaultWithdrawn");
    });
  });
});