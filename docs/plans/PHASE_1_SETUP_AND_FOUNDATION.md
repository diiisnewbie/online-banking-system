# PHASE 1 — SETUP & FOUNDATION (Kế hoạch chi tiết)

> **Loại file:** KẾ HOẠCH (viết trước khi thi hành). Kết quả thực tế ghi vào `docs/progress/N1_setup_and_foundation.md` **sau** khi xong.
> **Nguồn sự thật duy nhất:** `smartcontract/PROJECT_OVERVIEW.md` (bản v2.1). File này chỉ tóm tắt; nếu xung đột → Overview thắng.
> **Quy ước nhãn:**
> - `[Dn]` = Decision ID — xem **Mục 15** của Overview.
> - `[Mn]`/`[Pn]`/`[ARn]`/`[Vn]` = Test ID — xem **Mục 10** của Overview.
> - `[Qn]` = Câu hỏi vấn đáp — xem **Mục 8** của Overview.
> - **Không dùng nhãn D1/D3… để chỉ ngày** — ngày dùng ký hiệu **N1–N5** (Overview Mục 13).
> **Workspace:** mọi lệnh có ghi file chạy từ `D:\AppsCyclone\banking-system\smartcontract\` (nêu thư mục trước khi chạy, theo `AGENTS.md`).

**PHẠM VI TUYỆT ĐỐI CỦA PHASE 1:** chỉ nền tảng 3 contract + `openDeposit`.
**KHÔNG viết:** `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`, C1 (`unpaidInterest`, `claimPendingInterest`), C2 (`totalCommittedInterest`, guard `withdrawVault` theo cam kết). Thuộc Phase 2 và Phase 4.

---

## 1. MỤC TIÊU VÀ TIÊU CHÍ HOÀN THÀNH (GOAL & GATES)

### 1.1. Mục tiêu

Xây dựng nền móng chạy được của hệ thống: `MockUSDC` (6 decimals) → `VaultManager` (kho lãi, pause master, wiring set-once) → `SavingCore` (kho gốc, quản lý gói tiết kiệm, ERC721Enumerable, **`openDeposit`** với đầy đủ validation/CEI/event), kèm `smartcontract/config/variant.ts` làm một nguồn sự thật cho số variant (A=1, B=4) và smoke test chứng minh toàn bộ chuỗi.

### 1.2. Kết quả kiểm tra điều kiện tiên quyết (Bước 0 — đã chạy)

| Điều kiện | Kỳ vọng | Kết quả |
|---|---|---|
| `@openzeppelin/contracts` trong `package.json` | v5.x | ✅ **5.6.1** (+ `contracts-upgradeable` 5.6.1) — **không sửa `package.json`** |
| Solidity trong `hardhat.config.ts` | ≥ 0.8.20 (OZ v5) | ✅ **0.8.28** (`evmVersion: cancun`, optimizer runs 1000) — **không sửa config** |
| OZ v5 reentrancy error | `ReentrancyGuardReentrantCall()` | ✅ xác minh trong `node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol` dòng 56 |
| `smartcontract/config/variant.ts` | chưa có → tạo mới | ✅ chưa tồn tại → T-02 (đặt trong `smartcontract/config/` để tránh ESM path ngoài root) |
| Test template hiện có | biết cách deploy + time helper | ✅ `test/Box.upgrade.test.ts`: Hardhat 3 ESM, `const connection = await network.create()`, `networkHelpers.loadFixture`, assert BigInt (`42n`), `expect` từ `chai` |
| Script chạy | `npm run build` / `npm test` / `npm run test:coverage` | ✅ cả ba script đã có trong `package.json` |
| git init | cần snapshot trước khi code | ☐ T-00 bên dưới |

### 1.3. Exit Gates — chỉ sang Phase 2 khi đủ 5 điều

| # | Gate | Cách kiểm |
|---|---|---|
| G1 | `npm run build` sạch — compile 0 error, không warning mới | chạy từ `smartcontract/` |
| G2 | `npm test` pass toàn bộ — gồm test template Box có sẵn + `Phase1.smoke.test.ts` | chạy từ `smartcontract/` |
| G3 | Smoke test **số vàng** pass: mở 1,000 USDC gói 90d/225bps → `previewInterest == 5_547_945n` | xem S11 |
| G4 | Không phá workspace: `hardhat.config.ts`, `package.json` **không bị sửa**; không xóa file template (`contracts/upgradeable/*`, `contracts/mocks/BoxV2Unsafe.sol`, `test/Box.upgrade.test.ts`, ignition modules) | `git diff --stat` so với commit snapshot T-00 |
| G5 | File kết quả **`docs/progress/N1_setup_and_foundation.md`** viết **SAU** khi xong, đủ **6 phần**: (1) việc đã làm, (2) Q/D/Test-ID trả lời, (3) lý do chọn phương án, (4) bằng chứng verify (copy nguyên văn output build/test), (5) điểm chưa làm/chuyển phase, (6) rủi ro sang Phase 2 | theo quy ước 6 phần file MD của dự án |

---

## 2. DANH MỤC FILE (SCOPE & DELIVERABLES)

Đường dẫn tính từ gốc Hardhat `smartcontract/`:

| # | File | Ghi chú |
|---|---|---|
| 1 | `config/variant.ts` | Tạo mới: `A`, `B`, `VARIANT` (grace theo giây, APR, penalty, tenor), `PLAN0_MIN_DEPOSIT`, `PLAN0_MAX_DEPOSIT` — nơi duy nhất chứa số variant `[D29]`. Đặt trong `smartcontract/config/` để import ESM hoạt động |
| 2 | `contracts/MockUSDC.sol` | ERC20 6 decimals, `mint` mở |
| 3 | `contracts/interfaces/IVaultManager.sol` | interface tối thiểu cho `SavingCore` |
| 4 | `contracts/VaultManager.sol` | kho lãi + pause master + wiring set-once |
| 5 | `contracts/SavingCore.sol` | kho gốc + plan CRUD + ERC721Enumerable + `openDeposit` |
| 6 | `contracts/mocks/ReentrantReceiver.sol` | **CHỈ ĐỂ TEST** (tấn công qua `onERC721Received`) — đánh dấu `// TESTING ONLY — NOT FOR PRODUCTION`, không module Ignition nào trỏ tới |
| 7 | `test/Phase1.smoke.test.ts` | ≥ 12 kịch bản (Mục 5) |

**Thư viện OZ được phép dùng:** `ERC20`, `ERC721`, `ERC721Enumerable`, `Ownable`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `IERC20`.

**Ràng buộc cứng (AGENTS.md + G4):** tuyệt đối **không** sửa `hardhat.config.ts`, **không** sửa `package.json`, **không** cài package mới, **không** xóa file template.

**OUT OF SCOPE (nhắc lại):** 4 luồng rút/renew · C1 · C2 · Ignition deploy · frontend · `getAllPlans`/`depositsOfOwner` (view Phase frontend).

---

## 3. ĐẶC TẢ CHI TIẾT TỪNG CONTRACT

### 3.1. `config/variant.ts` `[D28][D29]`

> **Vị trí:** `smartcontract/config/variant.ts` — nằm trong gốc Hardhat để import ESM hoạt động.
> Test import: `import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js"` (cần đuôi `.js` vì ESM node20).

```ts
// smartcontract/config/variant.ts
export const A = 1;   // chữ số CUỐI MSSV
export const B = 4;   // chữ số KẾ CUỐI MSSV

export const VARIANT = {
  gracePeriodSeconds: ((A % 3) + 2) * 86400,  // 259_200 (3 ngày)
  defaultAprBps: 200 + A * 25,                 // 225
  earlyPenaltyBps: 300 + B * 50,               // 500
  defaultTenorDays: B % 2 === 0 ? 90 : 180,    // 90
} as const;

// Dùng bigint để nhất quán với BigInt so sánh trong test (tránh Number/BigInt mismatch)
export const PLAN0_MIN_DEPOSIT = 10_000_000n;       // 10 USDC
export const PLAN0_MAX_DEPOSIT = 100_000_000_000n;  // 100,000 USDC
```

- Số variant **không hardcode trong Solidity** — truyền qua constructor `[D28]`.
- `VARIANT.*` là `number`; khi truyền constructor dùng `BigInt(VARIANT.gracePeriodSeconds)`. Khi assert trong S1 dùng `BigInt()` để chuyển đổi rõ ràng (tránh mismatch).
- Test import file này **và** assert lại công thức bằng hằng số literal `A = 1`, `B = 4` (chống "test tự đồng thuận").

### 3.2. `MockUSDC.sol`

```solidity
contract MockUSDC is ERC20 {
    function decimals() public pure override returns (uint8);  // return 6
    function mint(address to, uint256 amount) external;        // ai cũng gọi được
}
```

- `ERC20("Mock USDC", "mUSDC")`; **không** `Ownable`, **không** cap (faucet test).
- `decimals()` phải **override function** — không khai `constant` getter (xung đột chữ ký OZ) `[D4]`.

### 3.3. `interfaces/IVaultManager.sol`

```solidity
interface IVaultManager {
    function paused() external view returns (bool);
    function feeReceiver() external view returns (address);
    function payoutInterest(address to, uint256 amount) external;
}
```

- `SavingCore` kiểm tra thanh khoản vault bằng `usdc.balanceOf(vault)` (Overview 5.2) — **Phase 1 chưa cần thêm hàm nào khác** (chỉ dùng khi rút tiền, Phase 2).
- Tách interface → biên hợp đồng sạch, dễ mock `[D4]`.

### 3.4. `VaultManager.sol` — `Ownable`, `Pausable`, `ReentrancyGuard`

**State / constructor**

- `IERC20 public immutable usdc` `[D4]`; `address public savingCore`; `address public feeReceiver` (= `initialOwner` ngay khi deploy `[D17]`).
- `constructor(IERC20 usdc_, address initialOwner)` — `Ownable(initialOwner)`; `usdc_ == address(0)` → `ZeroAddress()`. Lưu ý: nếu `initialOwner == address(0)`, base constructor `Ownable` của OZ v5 sẽ revert `OwnableInvalidOwner(address(0))` trước khi vào thân constructor.

**Hàm:**

| Hàm | Modifier | Hành vi & error |
|---|---|---|
| `setSavingCore(address core)` | `onlyOwner` | **set-once** `[D3]`: đã set → `SavingCoreAlreadySet()`; `core == 0` → `ZeroAddress()`; emit `SavingCoreSet(core)` |
| `setFeeReceiver(address r)` | `onlyOwner` | `r == 0` → `ZeroAddress()` `[D17]`; emit `FeeReceiverSet(r)` |
| `fundVault(uint256 amount)` | `onlyOwner`, `nonReentrant` — **KHÔNG `whenNotPaused`** `[D1]` | `safeTransferFrom(msg.sender, address(this), amount)`; emit `VaultFunded(msg.sender, amount)` · *Quyền: `onlyOwner` — đã chốt 2026-10-25. Non-owner → `OwnableUnauthorizedAccount`. Vẫn chạy được khi pause (nạp tiền giải cứu emergency)* |
| `withdrawVault(uint256 amount)` | `onlyOwner`, `whenNotPaused`, `nonReentrant` | **`amount > balance` → `AmountExceedsBalance()`** (kiểm tra TRƯỚC khi trừ — không để panic underflow) `[D25]`; chuyển `msg.sender`; emit `VaultWithdrawn`. **Guard C2 (`balance − amount ≥ committed`) là Phase 4** — chỉ để lại comment điểm móc, không tạo biến `[D25]` |
| `payoutInterest(address to, uint256 amount)` | `whenNotPaused`, `nonReentrant` | **Thứ tự modifier: `whenNotPaused` TRƯỚC** — stranger lúc pause nhận `EnforcedPause` (không lộ `NotSavingCore`). `msg.sender != savingCore` → `NotSavingCore()` `[D16]`; `amount == 0` → bỏ qua transfer (return, không revert); `balance < amount` → `InsufficientVaultLiquidity()`; `safeTransfer` → emit `InterestPaid(to, amount)` |
| `pause()` / `unpause()` | `onlyOwner` | **Nguồn pause duy nhất của toàn hệ thống** `[D1]` |

> **Lưu ý `InterestPaid`**: event này bổ sung vào Overview Mục 7.3 — theo dõi chi trả lãi từ Vault.

**Events:** `SavingCoreSet`, `FeeReceiverSet`, `VaultFunded`, `VaultWithdrawn`, `InterestPaid` + `Paused`/`Unpaused` (OZ).

### 3.5. `SavingCore.sol` — `ERC721Enumerable`, `Ownable`, `ReentrancyGuard`

**State & constructor**

```solidity
IERC20 public immutable usdc;             // [D4]
IVaultManager public immutable vault;     // [D4]
uint256 public immutable gracePeriod;     // [D28] — sinh ra getter gracePeriod() chuẩn camelCase cho frontend
uint256 public planCount;
uint256 public nextDepositId = 1;         // [D6]
mapping(uint256 => SavingPlan) public plans;
mapping(uint256 => DepositCertificate) public certificates;
```

- Constructor (9 tham số, **không hardcode variant** `[D28][D29]`):
  `constructor(IERC20 usdc_, IVaultManager vault_, address initialOwner, uint256 gracePeriod_, uint256 plan0TenorDays, uint256 plan0AprBps, uint256 plan0PenaltyBps, uint256 plan0Min, uint256 plan0Max)`
  - chặn zero address: `usdc_ == address(0) || vault_ == address(0)` → `ZeroAddress()`; riêng `initialOwner == address(0)` sẽ revert `OwnableInvalidOwner(address(0))` từ base constructor của OZ;
  - tạo **Plan 0** bằng cách gọi `_createPlan(plan0TenorDays, plan0AprBps, plan0Min, plan0Max, plan0PenaltyBps)` — hàm `_createPlan` tự tăng `planCount` và tự emit `PlanCreated(0, plan0TenorDays, plan0AprBps)` (constructor KHÔNG emit lặp lại) `[D5][D6]`.
- Struct `SavingPlan`, `DepositCertificate`, `enum DepositStatus { Active, Withdrawn, ManualRenewed, AutoRenewed }` **đúng nguyên văn Overview Mục 3** `[D8]`.
- Tên NFT: `"Term Deposit Certificate"` / `"TDC"`.
- **Getter `gracePeriod()`**: public immutable tự sinh getter tên `gracePeriod()` (camelCase) — dùng thống nhất trong test và frontend.

**Modifier**

```solidity
modifier whenSystemNotPaused() {          // [D1][D2]
    if (vault.paused()) revert SystemPaused();
    _;
}
```

**Hàm admin**

| Hàm | Modifier | Validate / event |
|---|---|---|
| `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps) → planId` | `onlyOwner` | Gọi `_createPlan` nội bộ (hàm nội bộ tự emit `PlanCreated`, không emit lặp lại) |
| `updatePlan(uint256 planId, uint256 newAprBps)` | `onlyOwner` | **Đúng chữ ký đề — CHỈ APR** `[D5]`; `newAprBps ∈ [1, 10000]`; `planId >= planCount` → `PlanNotFound`; emit `PlanUpdated(planId, newAprBps)` |
| `enablePlan(planId)` / `disablePlan(planId)` | `onlyOwner` | `planId >= planCount` → `PlanNotFound`; emit `PlanToggled(planId, enabled)` |

**Hàm nội bộ `_createPlan`** (dùng chung cho constructor và `createPlan` — NƠI DUY NHẤT emit `PlanCreated`):
- Validate `[D5]`: `tenorDays ∈ [1, 3650]`, **`aprBps ∈ [1, 10000]`**, `penaltyBps ≤ 10000`, **không** đồng thời `min > 0 && max > 0 && min > max` → else `InvalidPlanParams()`;
- Ghi `plans[planCount]`; `enabled = true`; `planId = planCount++`;
- **`emit PlanCreated(planId, tenorDays, aprBps);`** (duy nhất tại đây);
- Trả `planId`.

> **Lưu ý `PlanToggled`**: event này có trong Overview v2.1 Mục 7.3 — giữ nguyên.

**Hàm user — `openDeposit(uint256 planId, uint256 amount)`** — `nonReentrant` + `whenSystemNotPaused` `[D2][D16][D32]`

1. **Checks** (revert theo thứ tự):
   - `planId >= planCount` → `PlanNotFound()`
   - `!plans[planId].enabled` → `PlanDisabled()`
   - `amount == 0` → `InvalidDepositAmount()` `[D7]` *(D7 độc lập với min/max)*
   - `min > 0 && amount < min` → `InvalidDepositAmount()` · `max > 0 && amount > max` → `InvalidDepositAmount()`
2. **Effects** (trước mọi interaction — CEI `[D32]`):
   - `depositId = nextDepositId++` `[D6]`
   - ghi `certificates[depositId]`: `principal = amount`, `startAt = block.timestamp`, `maturityAt = startAt + plan.tenorDays * 86400`, **snapshot `aprBpsAtOpen = plan.aprBps`, `penaltyBpsAtOpen = plan.earlyWithdrawPenaltyBps` (bất biến)**, `status = Active`.
3. **Interactions**: `usdc.safeTransferFrom(msg.sender, address(this), amount)` → `_safeMint(msg.sender, depositId)` (callback bị khóa bởi `nonReentrant` `[D16]`).
4. `emit DepositOpened(depositId, msg.sender, planId, amount, maturityAt, aprBpsAtOpen)` — đủ 6 tham số Overview Mục 7.
5. **KHÔNG** cập nhật `totalCommittedInterest` (Phase 4) `[D30]`.

**Hàm tính lãi & view**

- `_calcInterest(uint256 principal, uint256 aprBps, uint256 tenorSeconds) internal pure returns (uint256)` `[D10][D11]`:
  `principal * aprBps * tenorSeconds / (365 days * 10_000)` — **nhân hết tử số trước, chia một lần, floor** `[D9]`.
  *Ghi rõ: Nhận 3 scalar để dùng linh hoạt cả khi chưa lưu cert vào storage (như preview hoặc tính lãi nhập gốc renew), áp dụng duy nhất 1 công thức toán [D11].*
- **Ba view** cần kiểm id: `previewInterest(uint256 depositId)`, `getPlan(uint256 planId)`, **`getCertificate(uint256 depositId)`**:
  - `getPlan`: `planId >= planCount` → revert `PlanNotFound(planId)`.
  - `previewInterest` / `getCertificate`: kiểm tra `depositId == 0 || depositId >= nextDepositId` → revert **`DepositNotFound(depositId)`** (chặn cả id 0 và id chưa tồn tại; cert đã Withdrawn/Renewed vẫn xem được thông tin).
- `gracePeriod()` qua public immutable; getter công khai `plans(id)`, `certificates(id)`.
- `getAllPlans`, `depositsOfOwner`/`tokensOfOwnerByIndex` usage → **Phase frontend** (D19, Enumerable đã có sẵn ở Phase 1).

### 3.6. `contracts/mocks/ReentrantReceiver.sol` `[Q7][D16]`

- `// TESTING ONLY — NOT FOR PRODUCTION`, đặt trong `contracts/mocks/`.
- Thiết kế: `attack(SavingCore core, IERC20 usdc, uint256 amount)` — tự `mint`/`approve` → gọi `openDeposit`; trong `onERC721Received(...)` gọi lại `core.openDeposit(...)` → kỳ vọng revert **`ReentrancyGuardReentrantCall()`** (OZ v5 — xác minh từ `node_modules/.../ReentrancyGuard.sol` dòng 56) làm **toàn bộ** giao dịch attack revert.

### 3.7. Bảng custom errors theo contract (Phase 1)

| Contract | Errors |
|---|---|
| `SavingCore` | `PlanNotFound(uint256)` · `PlanDisabled()` · `InvalidDepositAmount()` · `InvalidPlanParams()` · `SystemPaused()` · `ZeroAddress()` · **`DepositNotFound(uint256)`** (view với depositId chưa tồn tại) |
| `VaultManager` | `ZeroAddress()` · `SavingCoreAlreadySet()` · `NotSavingCore()` · `InsufficientVaultLiquidity()` (payoutInterest) · `AmountExceedsBalance()` (withdrawVault) `[D25]` |
| OZ kế thừa | **`ReentrancyGuardReentrantCall()`** (OZ v5) · `EnforcedPause()` · `OwnableUnauthorizedAccount(address)` |

*(Errors Phase 2+: `DepositNotActive`, `NotDepositOwner`, `NotMatured`, `AlreadyMatured`. Errors C2 `InsufficientCommitted` → Phase 4.)*

> **Phân biệt `DepositNotFound` vs `DepositNotActive`**: `DepositNotFound` = id chưa bao giờ mint (certificates mapping trống); `DepositNotActive` = id tồn tại nhưng status đã Withdrawn/Renewed (Phase 2 dùng). Hai error này **không thay thế nhau**.

---

## 4. LIÊN KẾT CÂU HỎI MỞ (Q1–Q7) & BONUS → DECISION → PHASE

| Q/Bonus | Decision | Phase 1 đặt nền thế nào | Hoàn thiện ở |
|---|---|---|---|
| **Q1** — NFT transferable | `[D19]`, `[D31]` | `ERC721Enumerable`; `ownerOf(depositId)` là chìa khóa sở hữu (test `M15` chuyển NFT) | Quyền rút tiền → **Phase 2**; claim theo chủ NFT → **Phase 4** |
| **Q2** — Empty Vault / **C1** | `[D22][D23]` | Tách kho: `SavingCore` (gốc) ≠ `VaultManager` (lãi); **chưa có biến C1** | **Phase 4** |
| **Q3** — Dead Bot / **Backdate** | `[D21]` | `GRACE_PERIOD` immutable truyền constructor (chưa dùng) | **Phase 2** (`autoRenewDeposit`) |
| **Q4** — Rounding | `[D9][D11]` | `_calcInterest` nhân-trước-chia-sau-floor; test số vàng `5_547_945` + nhánh `interest = 0` (principal ≤ 180) | Test rounding đầy đủ → **Phase 3** |
| **Q5** — Boundary | `[D20]` | `maturityAt = block.timestamp + tenorDays * 86400` đặt đúng tại open; phép so sánh `>=`/`<` | **Phase 2** (test biên đúng giây) |
| **Q6** — Disabled plan | `[D5][D13][D14]` | `plan.enabled` chỉ chặn sổ **mới**; sổ cũ độc lập nhờ snapshot APR/phạt (`updatePlan`, `disablePlan` — test `I1`, `P3`) | Manual/auto renew check enabled → **Phase 2** |
| **Q7** — Attack vectors | `[D16][D32][D4]` | `nonReentrant` + CEI trên `openDeposit` (test `M16`); `payoutInterest` khóa `onlySavingCore` (test `M11`); `usdc`/`vault` immutable — **nền tảng** cho các luồng rút (Phase 2+) | Mở rộng qua các phase sau |
| **C1/C2** | `[D22–D26]` | Tách hoàn toàn 2 kho; **chưa tạo biến C1/C2** | **Phase 4** |

---

## 5. KỊCH BẢN KIỂM THỬ — `smartcontract/test/Phase1.smoke.test.ts`

**Cấu trúc & quy ước:**
- Bám pattern template: `import hre, { network } from "hardhat"` → `const connection = await network.create()` → `const { ethers, networkHelpers } = connection`; dùng `networkHelpers.loadFixture(deployFixture)`; `expect` từ `chai`; matchers `revertedWithCustomError` / `emit.withArgs` của toolbox.
- **Fixture mặc định** (dùng cho hầu hết test): `MockUSDC` → `VaultManager(usdc, deployer)` → `SavingCore(usdc, vault, deployer, BigInt(VARIANT.gracePeriodSeconds), BigInt(VARIANT.defaultTenorDays), BigInt(VARIANT.defaultAprBps), BigInt(VARIANT.earlyPenaltyBps), PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT)` → `vault.setSavingCore(core.target)`.
- **`variant.ts` import**: `import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../config/variant.js"` (đuôi `.js` vì ESM).
- **Mọi số kỳ vọng là BigInt literal** (`1_000_000_000n`…) — **không** chép lại logic tính từ contract; dùng `BigInt(VARIANT.*)` khi cần chuyển đổi.
- Số vàng: gốc `1_000_000_000n` (1,000 USDC) · lãi toàn kỳ **`5_547_945n`** · phạt `50_000_000n` (Phase 2 mới dùng).

| # | ID (Overview · cục bộ) | Bước thực hiện | Kỳ vọng cụ thể |
|---|---|---|---|
| **S1** | `V1` | Import `variant.ts`; deploy; đọc `gracePeriod()`, `plans(0)`, địa chỉ immutable | `VARIANT` đúng công thức với literal `A=1,B=4`: `BigInt(VARIANT.gracePeriodSeconds) == 259_200n`, `BigInt(VARIANT.defaultAprBps) == 225n`, `BigInt(VARIANT.earlyPenaltyBps) == 500n`, `BigInt(VARIANT.defaultTenorDays) == 90n`; `gracePeriod() == 259_200n`; Plan 0: tenor 90, apr 225, penalty 500, min `10_000_000n`, max `100_000_000_000n`, `enabled == true`, `planCount == 1n`; event `PlanCreated(0, 90, 225)` phát khi deploy; **`core.usdc() == usdc.target`**, **`core.vault() == vault.target`**, **`vault.usdc() == usdc.target`** (bằng chứng immutable cho Q7) |
| **S2** | `M11` · wiring `[D3]` | Dùng **VaultManager chưa nối dây** (fixture phụ không gọi `setSavingCore`): gọi lần 1 → lần 2; gọi từ ví không phải owner; truyền `address(0)` | Lần 1: thành công + event `SavingCoreSet`; lần 2: `SavingCoreAlreadySet`; non-owner: `OwnableUnauthorizedAccount`; `address(0)`: `ZeroAddress` |
| **S3** | `M1` · `openDeposit` happy + CEI bằng chứng | (a) Happy: `mint` user → `approve(core, 1e9)` → `openDeposit(0, 1_000_000_000n)`. (b) SafeERC20/CEI: gọi `openDeposit(0, 1e9)` khi **chưa approve** → revert `ERC20InsufficientAllowance`; gọi lại khi **approve nhưng số dư 0** → revert `ERC20InsufficientBalance`; assert `nextDepositId` **không tăng** (Effects đã ghi depositId nhưng Interactions revert → toàn tx rollback, id không bị tiêu thụ thực) | (a) `depositId == 1n`; `getCertificate(1)`: principal `1e9`, `planId 0`, `aprBpsAtOpen 225`, `penaltyBpsAtOpen 500`, `status Active`, `maturityAt == startAt + 7_776_000n` (90d), `startAt == timestamp block`; `ownerOf(1) == user`, `balanceOf(user) == 1n`, `tokenOfOwnerByIndex(user, 0) == 1n`; USDC: user `−1e9`, SavingCore `+1e9`; event `DepositOpened` với **đủ 6 args** (`withArgs`). (b) Cả hai revert; `nextDepositId` vẫn `== 1n` trước khi lần (a) thành công |
| **S4** | `M2` · validations *(Fixture mặc định CHỈ có Plan 0. Các plan thử nghiệm được tạo nội bộ trong test qua `createPlan`)* | (a) `openDeposit(99, 1e9)` — id sai. (b) **Tạo plan thử nghiệm**: gọi `createPlan` rồi `disablePlan(testPlanId)` → `openDeposit(testPlanId, 1e9)`. (c) **Tạo plan min=0**: gọi `createPlan(..., min=0, ...)` → **`openDeposit(min0PlanId, 0)`** — amount 0 trên plan min=0 để chứng minh D7 bắt trước `min check` (nếu dùng plan 0 có min=10 USDC, D7 vẫn revert nhưng không phân biệt được lý do độc lập). (d) `openDeposit(0, 9_999_999n)` — dưới min plan 0. (e) `openDeposit(0, 100_000_000_001n)` — vượt max plan 0. (f) `openDeposit(0, 10_000_000n)` — đúng min. (g) `openDeposit(0, 100_000_000_000n)` — đúng max | (a)→`PlanNotFound`; (b)→`PlanDisabled`; (c)→`InvalidDepositAmount` (D7 độc lập, không qua min check); (d)→`InvalidDepositAmount`; (e)→`InvalidDepositAmount`; (f)(g) **thành công**, `depositId` tăng tiếp, cert đúng số tiền |
| **S5** | `I1` · snapshot `[D11]` | Mở sổ #1 → admin `updatePlan(0, 100)` → kiểm sổ #1 → mở sổ #2 → `previewInterest` cả hai | Sổ #1 vẫn `aprBpsAtOpen == 225n`; event `PlanUpdated(0, 100)`; Sổ #2 `aprBpsAtOpen == 100n`; `previewInterest(sổ1)` vẫn tính theo 225 |
| **S6** | `P3` · `Q6` | `disablePlan(0)` → `openDeposit` → kiểm sổ cũ đã mở → `enablePlan(0)` → mở lại | Mở mới: `PlanDisabled`; sổ cũ: không đổi (`Active`, snapshot giữ); `disablePlan(0)` emit **`PlanToggled(0, false)`**; `enablePlan(0)` emit **`PlanToggled(0, true)`** (dùng `emit.withArgs`); `disablePlan(99)` → `PlanNotFound` |
| **S7** | `P1`+`P2` · plan CRUD `[D5]` *(chạy trên fixture sạch chỉ có Plan 0)* | `createPlan` hợp lệ; invalid: tenor `0`, tenor `3651`, apr `10001`, **apr `0`**, penalty `10001`, min `>` max (cả 2 > 0); non-owner; `updatePlan(99, …)`; `updatePlan(0, 10001)`; **`updatePlan(0, 0)`**; `updatePlan(0, 100)` | Hợp lệ: `planId == 1`, `planCount` lên 2, event `PlanCreated`; invalid → `InvalidPlanParams`; non-owner → `OwnableUnauthorizedAccount`; id sai → `PlanNotFound`; update hợp lệ → `PlanUpdated(0, 100)` |
| **S8** | `M10` · pause `[D1][D2]` | Owner `vault.pause()` → `openDeposit` → `fundVault` (owner) → `fundVault` (non-owner) → `withdrawVault` (owner) → `unpause` → `openDeposit` | `openDeposit`: `SystemPaused`; **`fundVault` bởi owner: VẪN THÀNH CÔNG** (không bị `whenNotPaused`); `fundVault` bởi non-owner: `OwnableUnauthorizedAccount`; `withdrawVault`: `EnforcedPause`; sau `unpause`: mở sổ lại OK |
| **S9** | `M20` + `M11` + nhánh `M14` · vault | (a) `feeReceiver()` mặc định == owner; `setFeeReceiver(0)`; `setFeeReceiver(other)`; non-owner. (b) Owner `fundVault` → số dư + event. (c) `withdrawVault(balance+1)`; `withdrawVault(hợp lệ)`; non-owner. (d) **Fixture độc lập** (VaultManager chưa nối, rồi `setSavingCore(ví_test)`): (d1) `stranger.payoutInterest` lúc không pause → `NotSavingCore`; (d2) `ví_test.payoutInterest` đủ tiền → OK; (d3) `ví_test.payoutInterest` thiếu tiền → `InsufficientVaultLiquidity`; (d4) `ví_test.payoutInterest(to, 0)` → không revert không transfer; (d5) `ví_test.payoutInterest` khi pause → `EnforcedPause` | (a) `ZeroAddress`/`FeeReceiverSet`/`OwnableUnauthorizedAccount`. (b) `VaultFunded` đúng số. (c) `AmountExceedsBalance` (**không panic underflow**), `VaultWithdrawn`, `OwnableUnauthorizedAccount`. (d1) `NotSavingCore`; (d2) thành công + `InterestPaid`; (d3) `InsufficientVaultLiquidity`; (d4) không revert không transfer; (d5) `EnforcedPause` (whenNotPaused đứng trước NotSavingCore) |
| **S10** | `M16` · reentrancy `[Q7][D16]` | `ReentrantReceiver.attack(core, usdc, amount)` → `onERC721Received` gọi lại `openDeposit` | Toàn bộ tx revert **`ReentrancyGuardReentrantCall()`** (OZ v5); số dư USDC của receiver & SavingCore **không đổi** (atomic) |
| **S11** | toán nền · tiền đề `M3`/`M12` | (a) `decimals()`; stranger gọi `mint`. (b) Mở 1,000 USDC → `previewInterest(1)`. (c) `createPlan(90, 225, 0, 0, 500)` (min=0) → mở `180n` → preview; mở `181n` → preview. (d) `getCertificate(0)`, `previewInterest(0)`, `getCertificate(999)` và `previewInterest(999)` — id 0 và id không tồn tại | (a) `6`, mint thành công. (b) **`5_547_945n`** (số vàng). (c) `0n` (floor về 0) và `1n`. (d) tất cả đều revert **`DepositNotFound(id)`** — không trả struct rỗng |
| **S12** | `M15` · NFT `[Q1][D31]` | Alice mở sổ → `transferFrom(alice, bob, 1)` (không cần `safe` với EOA) | `ownerOf(1) == bob`; `balanceOf(alice) == 0`, `balanceOf(bob) == 1`; `tokenOfOwnerByIndex(bob, 0) == 1n` |

> **Lưu ý sang Phase 3:** các ID `V1/P1/P2/P3/M1/M2/M10/M11/M15/M16/I1` ở đây là **tập con sớm**; Phase 3 sẽ gom vào suite đầy đủ + mở rộng và chốt coverage ≥90%.

---

## 6. NHẬT KÝ THỰC THI (CHECKLIST)

| ID | Việc | File | Test-ID / Decision-ID | ✅ | Ghi chú |
|---|---|---|---|---|---|
| **T-00** | Kiểm tra `git status` tại `smartcontract/` xác nhận không có `.git` lồng nhau (đã xác minh: sạch) → Tạo `.gitignore` tại `banking-system/` (node_modules, artifacts, cache, ignition/deployments, .env, dist, coverage) → `git init` tại **`D:\AppsCyclone\banking-system\`** (root repo, bao gồm docs/ + frontend/ + smartcontract/) → `git add -A` → `git commit -m "chore: snapshot before Phase 1"` | `(từ banking-system/)` | G4 | ☐ | `.gitignore` **phải có trước** `git add -A` để không commit `node_modules/`, `artifacts/`, `cache/` |
| **T-01** | Kiểm tra điều kiện tiên quyết (OZ v5, solc ≥0.8.20, OZ error name, đọc template test) | *(đọc)* | — | ☑ | Kết quả ở Mục 1.2 |
| **T-02a** | Tạo `config/variant.ts` | `config/variant.ts` | `V1` · D28, D29 | ☐ | Chạy `npm test` ngay với 1 test import để xác nhận ESM resolve |
| **T-02b** | Xác nhận import ESM hoạt động: `import { VARIANT } from "../config/variant.js"` trong file test tạm | `test/` (file tạm) | D29 | ☐ | Nếu fail → điều chỉnh đường dẫn trước khi code contract |
| **T-03** | Viết token 6 decimals | `contracts/MockUSDC.sol` | S11 · D4 | ☐ | override function `decimals()` |
| **T-04** | Viết interface | `contracts/interfaces/IVaultManager.sol` | — · D4 | ☐ | |
| **T-05** | Viết kho lãi + pause master + wiring | `contracts/VaultManager.sol` | S2, S8, S9 · D1, D3, D16, D17, D25 | ☐ | payoutInterest: `whenNotPaused` trước `nonReentrant`; C2 guard: comment điểm móc |
| **T-06** | Viết kho gốc + plan CRUD + `openDeposit` | `contracts/SavingCore.sol` | S3–S7, S11, S12 · D2, D5–D7, D10, D11, D15, D19, D31, D32 | ☐ | Constructor dùng `_createPlan` chung; struct đúng Overview Mục 3; `gracePeriod` public immutable |
| **T-07** | Viết mock reentrancy | `contracts/mocks/ReentrantReceiver.sol` | S10 · D16 | ☐ | mark TESTING ONLY |
| **T-08** | Test nhóm **Variant & Wiring** | `test/Phase1.smoke.test.ts` | S1, S2 (V1, M11) | ☐ | S2 dùng fixture phụ chưa setSavingCore |
| **T-09** | Test nhóm **openDeposit** | " | S3, S4 (M1, M2) | ☐ | S4: plan phụ cho disabled; plan min=0 cho D7 |
| **T-10** | Test nhóm **Plan management + Snapshot** | " | S5, S6, S7 (I1, P1–P3) | ☐ | |
| **T-11** | Test nhóm **Pause & Vault** | " | S8, S9 (M10, M20, M11) | ☐ | S9(d): hai nhóm stranger/savingCore rõ ràng |
| **T-12** | Test nhóm **Reentrancy + Math + NFT** | " | S10, S11, S12 (M16, M15) | ☐ | S10: assert `ReentrancyGuardReentrantCall` |
| **T-13** | Chạy `npm run build` — 0 error, không warning mới | *(từ `smartcontract/`)* | G1 | ☐ | |
| **T-14** | Chạy `npm test` — toàn bộ pass (kể cả Box template) | *(từ `smartcontract/`)* | G2, G3 | ☐ | copy output vào file kết quả |
| **T-14b** | Chạy `npm run test:coverage` — xác nhận coverage tool của Hardhat 3 chạy được | *(từ `smartcontract/`)* | *(Phase 3 sẽ đặt ngưỡng ≥90%)* | ☐ | Không cần đạt ngưỡng — chỉ kiểm toolchain hoạt động sớm |
| **T-15** | Viết file kết quả 6 phần | `docs/progress/N1_setup_and_foundation.md` | G5 | ☐ | viết **SAU** khi xong |

---

## 7. BẢNG QUYẾT ĐỊNH ĐÃ CHỐT (tất hợp nhất — xóa bỏ trùng lặp)

> Mọi điểm đã được user xác nhận 2026-10-25. Dùng bảng này làm tham chiếu duy nhất khi code.

| # | Điểm | Quyết định áp dụng | D-ID |
|---|---|---|---|
| 1 | `withdrawVault` > balance → error nào? | **`AmountExceedsBalance()`** — kiểm trước khi trừ, không panic underflow | D25 |
| 2 | `updatePlan` — cập nhật những gì? | **Chỉ `newAprBps`** — không sửa tenor/min/max/penalty | D5 |
| 3 | `aprBps = 0` khi `createPlan`/`updatePlan`? | **INVALID** — revert `InvalidPlanParams` (range `[1, 10000]`) | D5 |
| 4 | Tên hàm view lấy thông tin sổ? | **`getCertificate(depositId)`** — revert khi id không tồn tại | D19 |
| 5 | `totalCommittedInterest` đặt ở contract nào? | **`SavingCore`** — Phase 1 không tạo biến này | D25, D30 |
| 6 | `fundVault` — quyền gọi? | **`onlyOwner`** + `nonReentrant` + **không** `whenNotPaused` | D1 |
| 7 | OZ v5 reentrancy error name? | **`ReentrancyGuardReentrantCall()`** | D16 |
| 8 | `payoutInterest` — thứ tự modifier? | **`whenNotPaused` trước `nonReentrant`** — stranger lúc pause nhận `EnforcedPause` | D16 |
| 9 | Getter Grace Period | **`gracePeriod()`** (public immutable camelCase, khớp Overview 14.3 và frontend) | D28 |
| 10 | `variant.ts` đặt ở đâu? | **`smartcontract/config/variant.ts`** — import `"../config/variant.js"`; Overview Mục 9, 6.3, D29 đã được cập nhật để đồng bộ; frontend Phase 5 cần cấu hình Vite `alias` hoặc `server.fs.allow` | D29 |
| 11 | Constructor Plan 0 bypass validate? | **Không** — dùng `_createPlan` nội bộ chung với `createPlan` (nơi duy nhất emit `PlanCreated`) | D5 |
| 12 | S2 fixture | **Fixture phụ chưa gọi `setSavingCore`** để test lần 1 thành công | D3 |
| 13 | `previewInterest`/`getCertificate` id không tồn tại? | **Revert `DepositNotFound(id)`** khi `depositId == 0 || depositId >= nextDepositId` — không trả struct rỗng | D19 |
