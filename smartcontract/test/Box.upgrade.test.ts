import { upgrades } from "@openzeppelin/hardhat-upgrades";
import { expect } from "chai";
import hre, { network } from "hardhat";

import type { Box, BoxV2 } from "../types/ethers-contracts/index.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const upgradesApi = await upgrades(hre, connection);

async function deployBoxProxyFixture() {
  const [deployer] = await ethers.getSigners();

  const Box = await ethers.getContractFactory("Box");
  const boxImpl = await Box.deploy();

  const initializeCalldata = Box.interface.encodeFunctionData("initialize", [
    deployer.address,
  ]);

  const Proxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await Proxy.deploy(boxImpl.target, deployer.address, initializeCalldata);

  const box = Box.attach(proxy.target) as unknown as Box;

  return { box, boxImpl, proxy, Box, deployer };
}

async function deployAndUpgradeToV2Fixture() {
  const fixture = await deployBoxProxyFixture();
  const { box, proxy, Box, deployer } = fixture;

  const tx = await box.set(42n);
  await tx.wait();

  const adminEvents = await proxy.queryFilter(proxy.filters.AdminChanged());
  const proxyAdminAddress = adminEvents[0].args.newAdmin;
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", proxyAdminAddress);

  const BoxV2 = await ethers.getContractFactory("BoxV2");
  const boxV2Impl = await BoxV2.deploy();

  const upgradeTx = await proxyAdmin.upgradeAndCall(proxy.target, boxV2Impl.target, "0x");
  await upgradeTx.wait();

  const boxV2 = BoxV2.attach(proxy.target) as unknown as BoxV2;

  return { ...fixture, boxV2, boxV2Impl, proxyAdmin, BoxV2 };
}

describe("Box upgrade (proxy)", function () {
  describe("Positive — upgrade hợp lệ Box → BoxV2", function () {
    it("initialize qua constructor proxy: owner = deployer, x = 0", async function () {
      const { box, deployer } = await networkHelpers.loadFixture(deployBoxProxyFixture);
      expect(await box.owner()).to.equal(deployer.address);
      expect(await box.get()).to.equal(0n);
    });

    it("nâng cấp qua ProxyAdmin: state cũ giữ nguyên, BoxV2 hoạt động", async function () {
      const { boxV2, deployer } = await networkHelpers.loadFixture(deployAndUpgradeToV2Fixture);

      expect(await boxV2.version()).to.equal("2.0.0");
      expect(await boxV2.get(), "giá trị x trước upgrade phải giữ nguyên").to.equal(42n);
      expect(await boxV2.owner(), "owner phải giữ nguyên qua upgrade").to.equal(deployer.address);

      const tx = await boxV2.setY(7n);
      await tx.wait();
      expect(await boxV2.getY()).to.equal(7n);
    });
  });

  describe("Negative — OZ validate chặn upgrade sai layout", function () {
    it("validateImplementation(Box) hợp lệ — PASS", async function () {
      const Box = await ethers.getContractFactory("Box");
      await upgradesApi.validateImplementation(Box);
    });

    it("validateUpgrade(Box → BoxV2) hợp lệ — PASS", async function () {
      const Box = await ethers.getContractFactory("Box");
      const BoxV2 = await ethers.getContractFactory("BoxV2");
      await upgradesApi.validateUpgrade(Box, BoxV2);
    });

    it("validateUpgrade(Box → BoxV2Unsafe) bị chặn vì sai storage layout — test xanh khi chặn đúng", async function () {
      const Box = await ethers.getContractFactory("Box");
      const BoxV2Unsafe = await ethers.getContractFactory("BoxV2Unsafe");

      let err = "";
      try {
        await upgradesApi.validateUpgrade(Box, BoxV2Unsafe);
      } catch (e) {
        err = String(e);
      }

      expect(err, "validateUpgrade phải throw với storage layout sai").to.not.equal("");
      expect(err, "lỗi phải liên quan storage layout").to.match(/layout/i);
    });
  });
});
