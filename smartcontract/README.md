# online-banking-system

> ## ⚠️ CẢNH BÁO
> **Dự án nội bộ / bài tập — CHƯA được audit. KHÔNG dùng trực tiếp trên mainnet với giá trị thật.**
> Luôn đọc lại contract và tự audit trước khi deploy production. Gói `@openzeppelin/hardhat-upgrades` chỉ dùng để **validate**, không thay thế audit.

Dự án Banking System khởi tạo từ template Hardhat 3 `ac-hardhat-template` — mẫu proxy nâng cấp được (Transparent Proxy + OZ Upgrades) với một luồng deploy duy nhất qua **Hardhat Ignition**.

- **License:** `UNLICENSED` (nội bộ, không phát hành công khai).
- **Node:** `>= 22.13.0` (xem `.nvmrc`).
- **Stack:** Hardhat 3.19.0 (pin exact), toolbox-mocha-ethers, ethers v6, TypeChain, Ignition 3.1.8, OZ Contracts 5.6.1, `@openzeppelin/hardhat-upgrades` 4.1.0.
- **Solidity:** 0.8.28, `evmVersion: cancun`, optimizer runs 1000.

## Quickstart

```shell
npm ci                  # tái lập từ lockfile
npm run build           # hardhat build (compile — `compile` chỉ là alias)
npm test                # hardhat test
npm run test:coverage   # test + coverage (LCOV + HTML trong coverage/)
npm run test:gas        # test + gas statistics
npm run node            # hardhat node local (KHÔNG redirect log vào repo)
npm run clean           # xóa artifacts/cache
```

Deploy local (cần `npm run node` đang chạy ở terminal khác):

```shell
npx hardhat ignition deploy ignition/modules/BoxProxy.ts \
  --network localhost \
  --parameters ignition/parameters/localhost.json
```

Lần chạy thứ hai với cùng lệnh journal **idempotent** ("Nothing new to deploy") — journal ghi tại `ignition/deployments/chain-31337/` (đã gitignore).

## Secrets (Configuration Variables)

Hardhat 3 **không dùng dotenv**. Giá trị resolve theo thứ tự ưu tiên:

1. **Biến môi trường (env)** — ưu tiên cao nhất (dùng cho CI).
2. **Keystore local** — `npx hardhat keystore set <TEN_BIEN>` (có flag `--dev` cho biến dev-only).
3. **`default`** trong config — chỉ dùng khi không có env/keystore.

Các biến trong `hardhat.config.ts`:

| Biến | Ghi chú |
|---|---|
| `SEPOLIA_RPC_URL` | Có fallback public (publicnode.com — **không SLA**) |
| `SEPOLIA_DEPLOYER_PRIVATE_KEY` | Ví deploy Sepolia (testnet mode) |
| `MAINNET_RPC_URL` | **Bắt buộc** — không fallback public |
| `MAINNET_DEPLOYER_PRIVATE_KEY` | Ví deploy mainnet — **chỉ giữ gas, không giữ quyền** (quyền thuộc multisig) |
| `ETHERSCAN_API_KEY` | Cho `verify` / `ignition deploy --verify` |

`hardhat test` / `hardhat build` **không cần secret nào** (configVariable lazy).

## Kiến trúc & 2 QUYỀN ĐỘC LẬP

Hai quyền sau **hoàn toàn độc lập** — không nhầm lẫn:

| Quyền | Contract | Tham số Ignition | Được làm gì |
|---|---|---|---|
| **Owner của Box** | `Box` (OwnableUpgradeable) | `boxOwner` | Gọi được các hàm owner của Box (`set`, …) |
| **Owner của ProxyAdmin** | `ProxyAdmin` | `proxyAdminOwner` | **Nâng cấp** proxy (`upgradeAndCall`) |

Người owner Box **không tự động** nâng cấp được contract, và ngược lại.

## Luồng deploy & nâng cấp (Ignition)

Cấu trúc module:

| Module | Vai trò |
|---|---|
| `BoxProxy.ts` | Deploy Box impl + `TransparentUpgradeableProxy` — **calldata `initialize` nhét thẳng vào constructor proxy** (không dùng `"0x"` rồi init sau — tránh front-run); đọc ProxyAdmin từ event `AdminChanged` |
| `BoxV2Impl.ts` | Chỉ deploy implementation BoxV2 (dùng cho cả testnet lẫn mainnet) |
| `BoxUpgrade.ts` | Gọi `upgradeAndCall` qua ProxyAdmin — **CHỈ chạy khi owner ProxyAdmin là ví deploy (testnet mode)** |

Parameters (**bắt buộc namespace theo tên module**, file flat bị bỏ qua):

```json
{
  "BoxProxy": {
    "proxyAdminOwner": "0x...",
    "boxOwner": "0x..."
  }
}
```

Mẫu có sẵn: `ignition/parameters/localhost.json` (dùng account0 mặc định của `hardhat node`), `sepolia.example.json`, `mainnet.example.json` (placeholder — **bắt buộc thay**).

### Testnet (owner ProxyAdmin = ví deploy)

```shell
npx hardhat ignition deploy ignition/modules/BoxProxy.ts  --network sepolia --parameters <params>
npx hardhat ignition deploy ignition/modules/BoxV2Impl.ts --network sepolia
npx hardhat ignition deploy ignition/modules/BoxUpgrade.ts --network sepolia --parameters <params>
# verify (cần ETHERSCAN_API_KEY):
npx hardhat ignition deploy ignition/modules/BoxProxy.ts --network sepolia --parameters <params> --verify
# hoặc verify riêng: npx hardhat ignition verify <deploymentId>
```

Cả 3 lệnh tự dùng chung journal `ignition/deployments/chain-<id>/` — upgrade liền mạch, không redeploy gì thừa.

### Mainnet (owner ProxyAdmin = multisig)

1. Deploy **chỉ BoxV2 impl**: `npx hardhat ignition deploy ignition/modules/BoxV2Impl.ts --network ethereum` — **KHÔNG chạy `BoxUpgrade.ts`** (Ignition không ký thay multisig).
2. Nâng cấp qua giao diện multisig (ví dụ Safe): multisig gọi `upgradeAndCall` trên ProxyAdmin với địa chỉ implementation mới.
3. Verify implementation BoxV2 trên explorer.
4. Ví `MAINNET_DEPLOYER_PRIVATE_KEY` chỉ trả gas cho bước 1 — bị lộ cũng không mất quyền.

## Tương tác sau deploy

Sổ cái sự thật: journal Ignition `ignition/deployments/chain-<id>/` — file chứa địa chỉ do Ignition tự sinh (không có `deployed_addresses.json` ở gốc).

```shell
npx hardhat console --network localhost
```

> **Lưu ý HH3:** console **KHÔNG có `hre.ethers`**. Tạo connection bằng:
> `const { ethers } = await network.create();`
> Sau đó: `const box = await ethers.getContractAt("Box", "<proxy address>");`

**2 bẫy đã gặp thực tế khi chạy console:**

1. **Pipe lệnh vào console thì top-level `await` trả `undefined`** (đã kiểm 2026-10-12 — `await network.create()` hoặc `await import("hardhat")` đều về `undefined` khi chạy `echo ... | npx hardhat console`). Gõ tay tương tác có thể vẫn được; nếu bị lỗi, nối bằng `.then()` trong 1 phiên:

```js
network.create()
  .then(c => c.ethers.getContractAt("BoxV2", "<proxy address>"))
  .then(async b => {
    console.log("version=", await b.version());
    console.log("get=", await b.get());
    console.log("owner=", await b.owner());
  })
  .catch(e => console.log("ERROR:", e));
new Promise(r => setTimeout(r, 4000)).then(() => console.log("[end]"));
```

2. **Sau nâng cấp, gọi `version()` phải gắn ABI `BoxV2`, không phải `Box`** — `getContractAt("Box", proxy)` sẽ báo `b.version is not a function`, vì menu hàm (ABI) của bản V1 không liệt kê hàm V2. Proxy địa chỉ không đổi — ABI thì phải đổi theo bản implementation hiện tại.

## Contracts mẫu

| File | Ghi chú |
|---|---|
| `contracts/upgradeable/Box.sol` | `Initializable` + `OwnableUpgradeable`; impl có `_disableInitializers()` |
| `contracts/upgradeable/BoxV2.sol` | Append biến `y` + hàm ở **cuối** storage layout (upgrade an toàn) |
| `contracts/mocks/BoxV2Unsafe.sol` | **CHỈ ĐỂ TEST negative** — cố tình chèn biến `z` trước `x` để OZ validate chặn. **KHÔNG DEPLOY**, không module Ignition nào trỏ tới. Test liên quan: `test/Box.upgrade.test.ts`. |

## Chính sách journal Ignition

- `ignition/deployments/chain-31337/` (hardhat in-process + localhost) — **gitignore**, không commit.
- Chain thật (sepolia/ethereum): template **không chứa** deployment thật; user **nên commit** journal chain thật (cần cho nâng cấp/verify) — lưu ý thư mục này **nặng** (chứa build-info/solcInputs), để bạn tự quyết.

## Thêm network khác (ví dụ BSC)

Thêm entry vào `networks` trong `hardhat.config.ts`:

```ts
bsc: {
  type: "http",
  chainType: "l1",
  url: configVariable("BSC_RPC_URL"),
  accounts: [configVariable("BSC_DEPLOYER_PRIVATE_KEY")],
},
```

Lưu ý: BSC trên Etherscan V2 là **Paid Tier** — verify BSC cân nhắc Sourcify/Blockscout.
