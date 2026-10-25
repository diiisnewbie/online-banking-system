import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BoxV2Impl", (m) => {
  const boxV2Impl = m.contract("BoxV2");

  return { boxV2Impl };
});
