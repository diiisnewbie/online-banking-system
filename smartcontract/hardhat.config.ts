try {
  process.loadEnvFile();
} catch {}

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatUpgradesPlugin from "@openzeppelin/hardhat-upgrades";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin, hardhatUpgradesPlugin],
  solidity: {
    npmFilesToBuild: [
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
    ],
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            runs: 1000,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL", {
        default: "https://ethereum-sepolia-rpc.publicnode.com",
      }),
      accounts: [
        process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY || configVariable("SEPOLIA_DEPLOYER_PRIVATE_KEY"),
        process.env.SEPOLIA_REGISTERER_PRIVATE_KEY ||
          process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY ||
          configVariable("SEPOLIA_REGISTERER_PRIVATE_KEY"),
      ],
    },
    ethereum: {
      type: "http",
      chainType: "l1",
      url: configVariable("MAINNET_RPC_URL"),
      accounts: [configVariable("MAINNET_DEPLOYER_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
