import { expect } from "chai";
import hre, { network } from "hardhat";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("Phase 3 -- Frontend Views & Owner Enumeration", function () {
  async function deployViewsFixture() {
    const [deployer, alice, bob, stranger] = await ethers.getSigners();

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

    // Fund Vault with 100,000 USDC for interest payouts
    await usdc.mint(deployer.address, 100_000_000_000n);
    await usdc.connect(deployer).approve(vault.target, 100_000_000_000n);
    await vault.connect(deployer).fundVault(100_000_000_000n);

    // Mint USDC to Alice and Bob, and approve SavingCore
    await usdc.mint(alice.address, 10_000_000_000n);
    await usdc.connect(alice).approve(core.target, 10_000_000_000n);

    await usdc.mint(bob.address, 10_000_000_000n);
    await usdc.connect(bob).approve(core.target, 10_000_000_000n);

    return { usdc, vault, core, deployer, alice, bob, stranger };
  }

  it("TC-VIEW-01 [D29] -- getAllPlans returns all initialized and created plans matching seed specification", async function () {
    const { core, deployer } = await networkHelpers.loadFixture(deployViewsFixture);

    // Initial state: Plan 0 default (from variant)
    // Create Plan 1: 30 days, 300 bps (3.00%), min 10 USDC, max 50,000 USDC, penalty 500 bps
    await core.connect(deployer).createPlan(30, 300, 10_000_000n, 50_000_000_000n, 500);

    // Create Plan 2: 90 days, 225 bps (2.25%), min 0, max 0, penalty 500 bps
    await core.connect(deployer).createPlan(90, 225, 0n, 0n, 500);

    const allPlans = await core.getAllPlans();
    expect(allPlans.length).to.equal(3);

    // Assert Plan 0
    expect(allPlans[0].planId).to.equal(0n);
    expect(allPlans[0].tenorDays).to.equal(90n);
    expect(allPlans[0].aprBps).to.equal(225n);
    expect(allPlans[0].minDeposit).to.equal(PLAN0_MIN_DEPOSIT);
    expect(allPlans[0].maxDeposit).to.equal(PLAN0_MAX_DEPOSIT);
    expect(allPlans[0].earlyWithdrawPenaltyBps).to.equal(500n);
    expect(allPlans[0].enabled).to.equal(true);

    // Assert Plan 1
    expect(allPlans[1].planId).to.equal(1n);
    expect(allPlans[1].tenorDays).to.equal(30n);
    expect(allPlans[1].aprBps).to.equal(300n);
    expect(allPlans[1].minDeposit).to.equal(10_000_000n);
    expect(allPlans[1].maxDeposit).to.equal(50_000_000_000n);
    expect(allPlans[1].earlyWithdrawPenaltyBps).to.equal(500n);
    expect(allPlans[1].enabled).to.equal(true);

    // Assert Plan 2
    expect(allPlans[2].planId).to.equal(2n);
    expect(allPlans[2].tenorDays).to.equal(90n);
    expect(allPlans[2].aprBps).to.equal(225n);
    expect(allPlans[2].minDeposit).to.equal(0n);
    expect(allPlans[2].maxDeposit).to.equal(0n);
    expect(allPlans[2].earlyWithdrawPenaltyBps).to.equal(500n);
    expect(allPlans[2].enabled).to.equal(true);
  });

  it("TC-VIEW-02 [D32, Q1] -- getCertificatesOfOwner asserts depositId != 0 on open, renew, and autoRenew, handles NFT transfer", async function () {
    const { core, alice, bob, stranger } = await networkHelpers.loadFixture(deployViewsFixture);

    // 1. Alice opens Cert #1
    await core.connect(alice).openDeposit(0, 1_000_000_000n); // ID 1
    // 2. Alice opens Cert #2
    await core.connect(alice).openDeposit(0, 1_000_000_000n); // ID 2

    const cert1 = await core.getCertificate(1);
    const cert2 = await core.getCertificate(2);

    // 3. Alice renews Cert #1 after maturity -> creates Cert #3
    // Set time to cert1.maturityAt
    await networkHelpers.time.setNextBlockTimestamp(cert1.maturityAt);
    await core.connect(alice).renewDeposit(1, 0); // ID 3 created

    // 4. Stranger auto-renews Cert #2 after grace period -> creates Cert #4 (owned by Alice)
    const grace = await core.gracePeriod();
    await networkHelpers.time.setNextBlockTimestamp(cert2.maturityAt + grace + 10n);
    await core.connect(stranger).autoRenewDeposit(2); // ID 4 created for Alice

    // Verify getCertificatesOfOwner(Alice) has all 4 certs
    const aliceCerts = await core.getCertificatesOfOwner(alice.address);
    expect(aliceCerts.length).to.equal(4);

    // Verify all 4 certs have depositId != 0 and match their IDs
    for (let i = 0; i < aliceCerts.length; i++) {
      expect(aliceCerts[i].depositId).to.not.equal(0n);
      expect(aliceCerts[i].principal).to.be.gt(0n);
    }

    // Map certs by depositId for easy assertion
    const certMap = new Map();
    for (const c of aliceCerts) {
      certMap.set(c.depositId, c);
    }

    expect(certMap.has(1n)).to.be.true;
    expect(certMap.has(2n)).to.be.true;
    expect(certMap.has(3n)).to.be.true;
    expect(certMap.has(4n)).to.be.true;

    // Check status: #1 is ManualRenewed (2n), #2 is AutoRenewed (3n), #3 is Active (0n), #4 is Active (0n)
    expect(certMap.get(1n).status).to.equal(2n);
    expect(certMap.get(2n).status).to.equal(3n);
    expect(certMap.get(3n).status).to.equal(0n);
    expect(certMap.get(4n).status).to.equal(0n);

    // 5. Alice transfers Cert #3 (Active) to Bob
    await core.connect(alice).transferFrom(alice.address, bob.address, 3);

    // Alice now has 3 certs, Bob has 1 cert (#3)
    const aliceCertsAfter = await core.getCertificatesOfOwner(alice.address);
    expect(aliceCertsAfter.length).to.equal(3);

    const bobCerts = await core.getCertificatesOfOwner(bob.address);
    expect(bobCerts.length).to.equal(1);
    expect(bobCerts[0].depositId).to.equal(3n);
    expect(bobCerts[0].status).to.equal(0n); // Active
  });

  it("TC-VIEW-03 -- getCertificatesOfOwner for wallet with zero certificates returns empty array", async function () {
    const { core, stranger } = await networkHelpers.loadFixture(deployViewsFixture);

    const certs = await core.getCertificatesOfOwner(stranger.address);
    expect(certs.length).to.equal(0);
    expect(certs).to.deep.equal([]);
  });
});
