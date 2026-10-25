import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BoxProxy", (m) => {
  const boxOwner = m.getParameter<string>("boxOwner");
  const proxyAdminOwner = m.getParameter<string>("proxyAdminOwner");

  const boxImpl = m.contract("Box");
  const initializeCalldata = m.encodeFunctionCall(boxImpl, "initialize", [
    boxOwner,
  ]);

  const proxy = m.contract("TransparentUpgradeableProxy", [
    boxImpl,
    proxyAdminOwner,
    initializeCalldata,
  ]);

  const proxyAdminAddress = m.readEventArgument(
    proxy,
    "AdminChanged",
    "newAdmin",
  );

  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress);

  return { boxImpl, proxy, proxyAdmin };
});
