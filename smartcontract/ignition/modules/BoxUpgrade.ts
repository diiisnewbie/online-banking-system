import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

import BoxProxy from "./BoxProxy.js";

// CHỈ dùng khi owner ProxyAdmin là ví deploy (testnet mode).
// Mainnet: deploy BoxV2 qua BoxV2Impl.ts, nâng cấp qua multisig UI — KHÔNG chạy module này.
export default buildModule("BoxUpgrade", (m) => {
  const proxyAdminOwner = m.getAccount(0);
  const { proxy, proxyAdmin } = m.useModule(BoxProxy);

  const boxV2Impl = m.contract("BoxV2");

  m.call(proxyAdmin, "upgradeAndCall", [proxy, boxV2Impl, "0x"], {
    from: proxyAdminOwner,
  });

  return { proxy, proxyAdmin, boxV2Impl };
});
