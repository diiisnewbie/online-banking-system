# PHASE 4 — BONUSES C2 & C1 IMPLEMENTATION & LOCAL DEPLOYMENT (Kế hoạch chi tiết v3)

> **Loại file:** KẾ HOẠCH CHI TIẾT (viết trước khi thi hành). Kết quả thực tế ghi vào `docs/progress/N4_bonuses_c2_c1.md` **sau** khi hoàn thành.
> **Nguồn sự thật:** `smartcontract/PROJECT_OVERVIEW.md` (bản v2.2 -> v2.3 sau Overview Patch cuối N4) & Mục 5, Mục 10, Mục 11.1.
> **Quy ước nhãn:**
> - `[Dn]` = Decision ID (Mục 15 Overview; bổ sung D33, D34).
> - `[Mn]`/`[In]` = Test ID (Mục 10 Overview).
> - `[Qn]` = Câu hỏi vấn đáp (Mục 8 Overview).
> - Ký hiệu phase: **N4** (Phase 4).
> **Workspace:** 
> - Smartcontract: `D:\AppsCyclone\banking-system\smartcontract\`
> - Frontend: `D:\AppsCyclone\banking-system\frontend\`

---

## 1. MỤC TIÊU VÀ EXIT GATES (TIÊU CHÍ HOÀN THÀNH)

### 1.1. Mục tiêu của Phase 4 (N4)
Theo lộ trình tổng thể tại Mục 13 của `PROJECT_OVERVIEW.md`, Phase 4 (N4) giải quyết trọn vẹn 3 trụ cột cốt lõi:

1. **Trụ cột 1: Smart Contract — Hiện thực C2 (Solvency Guard) & C1 (Deferred Interest / Hoãn trả lãi):**
   - **Tạo interface `contracts/interfaces/ISavingCore.sol`**: Khai báo `function totalCommittedInterest() external view returns (uint256);` giúp `VaultManager` chỉ import interface, thực hiện 1 staticcall kiểm tra cam kết mà không phụ thuộc vòng lặp hay import toàn bộ `SavingCore` (`[D25]`).
   - **Nâng cấp `contracts/VaultManager.sol` (C2)**:
     - Bổ sung Custom Error `error InsufficientCommitted();`.
     - Cập nhật hàm `withdrawVault(uint256 amount)`: kiểm tra 2 lớp bảo vệ để không bao giờ bị panic underflow (`amount <= balance`, sau đó `balance - amount >= totalCommittedInterest`). Có nhánh `if (savingCore != address(0))` để hỗ trợ an toàn khi chưa liên kết Core (`[D34]`).
   - **Nâng cấp `contracts/SavingCore.sol` (C1 & C2)**:
     - Cho `SavingCore is ISavingCore` và khai báo `uint256 public override totalCommittedInterest;` (đảm bảo tính type-safety).
     - Khai báo `mapping(uint256 => uint256) public unpaidInterest;`.
     - Bổ sung Custom Errors: `error ClaimNotCovered();` và `error NoPendingInterest();` (revert rõ ràng khi nợ = 0 thay vì return im lặng, đúng đặc tả Overview 14.3 và đăng ký `[D33]`).
     - Events: `InterestDeferred(uint256 indexed depositId, address indexed owner, uint256 amount)` và `InterestClaimed(uint256 indexed depositId, address indexed claimer, uint256 amount)`.
     - **C2 — Quản lý cam kết**: Cập nhật chuẩn xác `totalCommittedInterest` qua **7 chuyển động cập nhật + 1 điểm đọc (`withdrawVault`)** theo đúng bảng Mục 5.7 `[D30]`.
     - **C1 — Tuân thủ nghiêm ngặt CEI và D32 trong `withdrawAtMaturity`**: Gán `cert.status = DepositStatus.Withdrawn` trước mọi tương tác ngoài. Khi Vault thiếu tiền: **100% gốc vẫn chuyển ngay về user**, toàn bộ lãi chuyển vào `unpaidInterest[depositId]` (net committed = 0: trừ I active, cộng I unpaid), emit `Withdrawn(id, user, principal, 0, false)` và emit `InterestDeferred(id, user, interest)` (`[D22][D27]`).
     - **C1 — Thứ tự kiểm tra cố định trong `claimPendingInterest(depositId)`**:
       `whenSystemNotPaused` (`SystemPaused`) $\rightarrow$ `DepositNotFound` $\rightarrow$ `NotDepositOwner` $\rightarrow$ `NoPendingInterest` $\rightarrow$ `ClaimNotCovered`.
       (Stranger gọi vào cert không có nợ sẽ nhận `NotDepositOwner`, bảo mật trạng thái nợ của ví).
       Thao tác tuân thủ CEI: gán `unpaidInterest = 0` và trừ `totalCommittedInterest` trước khi gọi `vault.payoutInterest` (`[D23]`).

2. **Trụ cột 2: Test Suite N4 & Traceability Audit Chuyển Đổi:**
   - **Sửa các test tạo "Vault rỗng" tránh vỡ do C2**:
     - TC-06: Chuyển đổi thành test C1 chính thức (`[M7]`) trong `Phase2.core_flows.test.ts` theo đúng quyết định `[D27]`.
     - TC-15: Điều chỉnh thứ tự gọi `withdrawVault` **TRƯỚC** khi gọi `openDeposit` (khi đó `committed = 0` nên rút cạn hợp lệ).
     - Kiểm tra Phase 1 S9(c): Vẫn hoạt động bình thường vì lúc đó chưa có deposit active.
   - **Viết test suite chuyên biệt `test/Phase4.bonuses_c2_c1.test.ts` chia thành 2 describe rõ ràng phục vụ chấm điểm bonus**:
     - `describe("C1 — Principal is always safe (Deferred Interest)", ...)`
     - `describe("C2 — Solvency Guard (Bảo vệ thanh khoản lãi cam kết)", ...)`
     - Kiểm thử toàn diện: M8 (all-or-nothing, claim nạp tiền, chuyển nhượng NFT), M10 (pause checks), D33 (`NoPendingInterest`), C.1 (Debt-guard), C.2 (Caveat Undercollateralization), C.3 (First-Come-First-Served), D34 (Nhánh `savingCore == address(0)`), M13 (Kiểm toán committed 7 chuyển động), I2, I3 (Bất biến cân bằng tài sản mở rộng).
   - Chạy lại script `node scripts/export-abi.js` cập nhật ABI mới cho Frontend.
   - Duy trì **Line Coverage $\ge 90\%$** và theo dõi **Branch Coverage $\ge 85\%$**.

3. **Trụ cột 3: Hardhat Ignition Module & Khởi Tạo Môi Trường Deploy:**
   - Xây dựng module `smartcontract/ignition/modules/BankingSystem.ts` có tường minh dependency (`after`) và định danh (`id`) riêng biệt cho từng call (tránh lỗi duplicate Future ID).
   - Bọc `BigInt(VARIANT.x)` khi truyền tham số, import chuẩn từ `../../config/variant.js`.
   - Cấp vốn: Mint 10,000 USDC cho deployer nạp Vault, đồng thời mint sẵn 10,000 USDC cho các ví test (`m.getAccount(1)`, `m.getAccount(2)`).
   - Seed chuẩn: Plan 0 (90d), Plan 1 (30d / 300bps), Plan 2 (90d / 225bps / min=0 / max=0).
   - Kiểm chứng tính Idempotent trên local Hardhat node (chạy deploy lần 2 và ghi nhận nguyên văn thông điệp).
   - **Kiểm chứng Frontend End-to-End**: Kết nối frontend với contract đã deploy qua `VITE_SAVING_CORE_ADDRESS`, tải thành công 3 gói tiết kiệm on-chain.

---

### 1.2. Exit Gates (5 điều kiện bắt buộc để hoàn thành Phase 4)

| # | Gate | Tiêu chuẩn đánh giá |
|---|---|---|
| **G1** | Clean Contract Build | `npm run build` sạch 100%, **0 warning, 0 error**. `VaultManager` chỉ import `ISavingCore` (không import `SavingCore`). `SavingCore is ISavingCore`. |
| **G2** | Complete Test Suite Pass 100% | Toàn bộ các bài test (Phase 1/Box + Phase 2 đã chuyển đổi TC-06 + Phase 3 + toàn bộ ma trận Phase 4 mới) **vượt qua 100%**, 0 skipped, 0 pending. (Tổng số test khẳng định qua output thực tế của Mocha). |
| **G3** | High Code Coverage | `npm run test:coverage` xác nhận **Line Coverage $\ge 90\%$** (SavingCore $\ge 95\%$, VaultManager $\ge 95\%$) và **Branch Coverage $\ge 85\%$**. |
| **G4** | Ignition Deploy & FE Sync Verified | Module Ignition deploy thành công trên local node, xác nhận idempotent qua 2 lần deploy, seed đủ 3 gói, nạp 10k USDC; ghi `VITE_SAVING_CORE_ADDRESS` vào `frontend/.env` và Frontend đọc và hiển thị đúng 3 gói tiết kiệm on-chain từ `SavingCore.getAllPlans()`. |
| **G5** | Progress Report N4 | Lập báo cáo đầy đủ 6 phần tại `docs/progress/N4_bonuses_c2_c1.md` kèm log thực tế, bản nháp README Bonus Notes và đăng ký D33/D34. |

---

## 2. RÀ SOÁT VÀ ĐIỀU CHỈNH ẢNH HƯỞNG CỦA C2 LÊN TEST SUITE HIỆN TẠI

### 2.1. Danh mục các vị trí gọi `withdrawVault` trong toàn bộ test suite:
1. `test/Phase1.smoke.test.ts:352`: Test `withdrawVault` bị chặn khi pause (`EnforcedPause`) $ightarrow$ Chưa mở deposit nào, `committed == 0`, pass bình thường.
2. `test/Phase1.smoke.test.ts:389, 395`: Test `withdrawVault` rút quá số dư (`AmountExceedsBalance`) $ightarrow$ Chưa mở deposit nào, `committed == 0`, pass bình thường.
3. `test/Phase2.core_flows.test.ts:199` (TC-06): Rút cạn Vault để test luồng thiếu tiền $ightarrow$ Chuyển đổi thành test C1 (`[M7]`).
4. `test/Phase2.core_flows.test.ts:445` (TC-15): Rút cạn Vault để test renew khi thiếu tiền $ightarrow$ **Cần điều chỉnh thứ tự**: Gọi `withdrawVault` **TRƯỚC** khi gọi `openDeposit`.

### 2.2. Điều chỉnh TC-15 trong `test/Phase2.core_flows.test.ts`:
```ts
// Đưa lệnh rút cạn Vault lên TRƯỚC khi mở sổ để committed = 0
await vault.connect(deployer).withdrawVault(await usdc.balanceOf(vault.target));
expect(await usdc.balanceOf(vault.target)).to.equal(0n);

await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 1
await core.connect(user).openDeposit(0, 1_000_000_000n); // ID 2
// Tiến hành kiểm tra renewDeposit và autoRenewDeposit revert InsufficientVaultLiquidity
```

---

## 3. CHI TIẾT THIẾT KẾ KỸ THUẬT SMART CONTRACT

### 3.1. Interface `contracts/interfaces/ISavingCore.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISavingCore {
    function totalCommittedInterest() external view returns (uint256);
}
```

### 3.2. Nâng cấp `contracts/VaultManager.sol` (Solvency Guard C2)
- Chỉ import `ISavingCore`, không import `SavingCore`.
- Bổ sung Custom Error:
  ```solidity
  error InsufficientCommitted();
  ```
- Hiện thực hàm `withdrawVault`:
  ```solidity
  function withdrawVault(uint256 amount) external onlyOwner whenNotPaused nonReentrant {
      uint256 balance = usdc.balanceOf(address(this));
      if (amount > balance) revert AmountExceedsBalance();
      
      // Chốt chặn C2 [D25]: Chỉ kiểm tra khi đã kết nối SavingCore [D34]
      if (savingCore != address(0)) {
          uint256 committed = ISavingCore(savingCore).totalCommittedInterest();
          if (balance - amount < committed) revert InsufficientCommitted();
      }
      
      usdc.safeTransfer(msg.sender, amount);
      emit VaultWithdrawn(msg.sender, amount);
  }
  ```
- **Quyết định D34 (Nhánh savingCore == address(0)):** Cho phép Admin rút vốn tự do trước khi Vault kết nối với Core. Được kiểm thử riêng bằng fixture chưa nối dây để đạt 100% branch coverage.

### 3.3. Nâng cấp `contracts/SavingCore.sol` (C1 & C2)
- Kế thừa:
  ```solidity
  contract SavingCore is ISavingCore, ERC721Enumerable, Ownable, ReentrancyGuard {
  ```
- Khai báo state variables:
  ```solidity
  uint256 public override totalCommittedInterest;
  mapping(uint256 => uint256) public unpaidInterest;
  ```
- Khai báo Custom Errors:
  ```solidity
  error ClaimNotCovered();
  error NoPendingInterest(); // [D33]
  ```
- Khai báo Events:
  ```solidity
  event InterestDeferred(uint256 indexed depositId, address indexed owner, uint256 amount);
  event InterestClaimed(uint256 indexed depositId, address indexed claimer, uint256 amount);
  ```

#### Bổ sung helper tính lãi nội bộ an toàn (D11):
```solidity
function _interestOf(DepositCertificate storage cert) internal view returns (uint256) {
    return _calcInterest(cert.principal, cert.aprBpsAtOpen, cert.maturityAt - cert.startAt);
}
```

#### Cập nhật 7 chuyển động của `totalCommittedInterest` [D30]:
1. **`openDeposit`**:
   ```solidity
   uint256 interest = _calcInterest(amount, plan.aprBps, plan.tenorDays * 1 days);
   totalCommittedInterest += interest;
   ```
2. **`withdrawAtMaturity` (C1 — Tuân thủ CEI & D32)**:
   ```solidity
   cert.status = DepositStatus.Withdrawn;
   uint256 interest = _interestOf(cert);
   bool payNow = usdc.balanceOf(address(vault)) >= interest;

   // Cập nhật committed:
   // - payNow: giải phóng cam kết (-= interest)
   // - deferral: trừ khỏi cam kết Active (-= interest) và cộng vào nợ unpaid (+= interest) -> net = 0
   if (payNow) {
       totalCommittedInterest -= interest;
   } else {
       unpaidInterest[depositId] += interest;
   }

   usdc.safeTransfer(msg.sender, cert.principal);

   if (payNow) {
       vault.payoutInterest(msg.sender, interest);
       emit Withdrawn(depositId, msg.sender, cert.principal, interest, false);
   } else {
       emit Withdrawn(depositId, msg.sender, cert.principal, 0, false);
       emit InterestDeferred(depositId, msg.sender, interest);
   }
   ```
3. **`earlyWithdraw`**:
   ```solidity
   cert.status = DepositStatus.Withdrawn;
   uint256 plannedInterest = _interestOf(cert);
   totalCommittedInterest -= plannedInterest;
   ```
4. **`renewDeposit`**:
   ```solidity
   uint256 newInterest = _calcInterest(newPrincipal, newPlan.aprBps, newPlan.tenorDays * 1 days);
   totalCommittedInterest = totalCommittedInterest - oldInterest + newInterest;
   ```
5. **`autoRenewDeposit`**:
   ```solidity
   uint256 newInterest = _calcInterest(newPrincipal, oldCert.aprBpsAtOpen, oldTenor);
   totalCommittedInterest = totalCommittedInterest - oldInterest + newInterest;
   ```
6. **`claimPendingInterest(depositId)` (C1 All-or-Nothing)**:
   - **Thứ tự kiểm tra cố định**: `whenSystemNotPaused` $\rightarrow$ `DepositNotFound` $\rightarrow$ `NotDepositOwner` $\rightarrow$ `NoPendingInterest` $\rightarrow$ `ClaimNotCovered`.
   ```solidity
   function claimPendingInterest(uint256 depositId) external whenSystemNotPaused nonReentrant {
       if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);
       if (ownerOf(depositId) != msg.sender) revert NotDepositOwner();

       uint256 unpaid = unpaidInterest[depositId];
       if (unpaid == 0) revert NoPendingInterest();

       if (usdc.balanceOf(address(vault)) < unpaid) revert ClaimNotCovered();

       // Effects trước
       unpaidInterest[depositId] = 0;
       totalCommittedInterest -= unpaid;

       // Interactions
       vault.payoutInterest(msg.sender, unpaid);
       emit InterestClaimed(depositId, msg.sender, unpaid);
   }
   ```
7. **`withdrawVault`**: Điểm đọc staticcall qua `ISavingCore.totalCommittedInterest()`.

---

## 4. CHI TIẾT TEST SUITE & PHÂN NHÓM CHẤM ĐIỂM BONUS

### 4.1. Chuyển đổi TC-06 trong `test/Phase2.core_flows.test.ts` thành M7 C1
- Tên test: `it("TC-06 [M7, Q2, D22, D27] -- Empty Vault on withdrawAtMaturity delivers 100% principal and defers interest", ...)`.
- Giữ nguyên tag `[M7]` để grep audit không bị gãy.
- Khẳng định:
  - User nhận đủ 100% gốc 1,000 USDC.
  - `unpaidInterest[1] == 5_547_945n`.
  - Emit `Withdrawn(1, user, 1000 USDC, 0, false)` và emit `InterestDeferred(1, user, 5_547_945)`.
  - `cert.status == Withdrawn`.

### 4.2. File test mới `test/Phase4.bonuses_c2_c1.test.ts`

#### Nhóm 1: `describe("C1 — Principal is always safe (Deferred Interest)", ...)`
1. **TC-C1-01 [M8-1]**: `claimPendingInterest` all-or-nothing khi Vault thiếu tiền $ightarrow$ revert `ClaimNotCovered()`. Khoản nợ `unpaidInterest` bảo toàn nguyên vẹn.
2. **TC-C1-02 [M8-2]**: `claimPendingInterest` thành công sau khi Admin nạp tiền (`fundVault`) $ightarrow$ user nhận đủ lãi, `unpaidInterest` về 0, `totalCommittedInterest` giảm tương ứng, emit `InterestClaimed`.
3. **TC-C1-03 [M8-3, Q1]**: `claimPendingInterest` đi theo quyền sở hữu NFT $ightarrow$ Alice chuyển nhượng NFT cho Bob; Alice gọi claim revert `NotDepositOwner()`; Bob gọi claim thành công trọn vẹn.
4. **TC-C1-04 [M8-4, D33]**: `claimPendingInterest` khi không có nợ (`unpaid == 0`) $ightarrow$ revert `NoPendingInterest()`.
5. **TC-C1-05 [M8-5]**: `claimPendingInterest` với ID không tồn tại $ightarrow$ revert `DepositNotFound(id)`.
6. **TC-C1-06 [M8-6]**: Thứ tự kiểm tra: stranger gọi vào cert của Alice không có nợ $ightarrow$ revert `NotDepositOwner()` (không lộ trạng thái nợ).
7. **TC-C1-07 [M10]**: Emergency Pause: `claimPendingInterest` khi pause revert `SystemPaused`, trong khi đó `fundVault` cứu trợ vẫn chạy bình thường.
8. **TC-C1-08 [FCFS]**: First-Come-First-Served khi Vault nạp thiếu: Có 2 khoản nợ A (5.54 USDC) và B (5.54 USDC), Vault chỉ được nạp 6 USDC $ightarrow$ người claim trước thành công, người claim sau revert `ClaimNotCovered()`. Sau khi nạp thêm thì người sau claim thành công.

#### Nhóm 2: `describe("C2 — Solvency Guard (Bảo vệ thanh khoản lãi cam kết)", ...)`
9. **TC-C2-01 [M14-1]**: `withdrawVault` rút an toàn khi `amount <= balance - committed` $ightarrow$ thành công.
10. **TC-C2-02 [M14-2]**: `withdrawVault` rút vượt cam kết khi `balance - amount < committed` $ightarrow$ revert `InsufficientCommitted()`.
11. **TC-C2-03 [M14-3]**: `withdrawVault` rút vượt số dư khi `amount > balance` $ightarrow$ revert `AmountExceedsBalance()` (không bị panic underflow).
12. **TC-C2-04 [M14-4, C.1]**: Debt-Guard: Sau khi phát sinh nợ `unpaidInterest`, nạp Vault đúng `unpaid + X`. Rút `X` thành công, rút `X + 1` revert `InsufficientCommitted()` (chứng minh C1 và C2 bảo chứng cho nhau).
13. **TC-C2-05 [M14-5, D34]**: Nhánh `savingCore == address(0)`: Dùng fixture VaultManager chưa nối dây, Admin rút vốn tự do không bị Solvency Guard chặn.
14. **TC-C2-05b [M14-EOA]**: Nhánh `savingCore` là EOA (không có code): Admin gọi `withdrawVault` bị revert do staticcall decode rỗng (fail-safe bảo vệ quỹ khi cấu hình sai).
15. **TC-C2-06 [M14-6]**: `withdrawVault` khi paused revert `EnforcedPause`.
16. **TC-C2-07 [M13, D30]**: Kiểm toán toán học biến `totalCommittedInterest` qua toàn bộ 7 chuyển động luồng, assert chính xác sau từng bước mà không dựa vào lời gọi ngoài.
17. **TC-C2-08 [I2]**: Bất biến sau `openDeposit`: `totalCommittedInterest == sum(lãi toàn kỳ của Active deposits)`.
18. **TC-C2-09 [I3]**: Bất biến cân bằng tài sản `SavingCore`: `usdc.balanceOf(SavingCore) == sum(Active principal)` duy trì tuyệt đối qua các luồng rút thiếu, hoãn lãi và claim (chứng minh tiền claim chỉ đi từ Vault, không chạm gốc trong Core).
19. **TC-C2-10 [Edge C.2]**: Caveat Undercollateralization: Nạp Vault đúng bằng `committed`, renew một khoản làm `I_new > I_old` $ightarrow$ assert `balance < committed` và `withdrawVault(0)` revert `InsufficientCommitted()`.

---

## 5. HARDHAT IGNITION MODULE & VERIFICATION END-TO-END

### 5.1. File `smartcontract/ignition/modules/BankingSystem.ts`
```ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { VARIANT, PLAN0_MIN_DEPOSIT, PLAN0_MAX_DEPOSIT } from "../../config/variant.js";

const FUND_AMOUNT = 10_000_000_000n; // 10,000 USDC
const USER_MINT = 10_000_000_000n;   // 10,000 USDC cho test accounts

export default buildModule("BankingSystem", (m) => {
  const deployer = m.getAccount(0);
  const testUser1 = m.getAccount(1);
  const testUser2 = m.getAccount(2);

  // 1. Deploy Contracts
  const usdc = m.contract("MockUSDC");
  const vault = m.contract("VaultManager", [usdc, deployer]);
  const core = m.contract("SavingCore", [
    usdc,
    vault,
    deployer,
    BigInt(VARIANT.gracePeriodSeconds),
    BigInt(VARIANT.defaultTenorDays),
    BigInt(VARIANT.defaultAprBps),
    BigInt(VARIANT.earlyPenaltyBps),
    PLAN0_MIN_DEPOSIT,
    PLAN0_MAX_DEPOSIT,
  ]);

  // 2. Wire SavingCore to VaultManager
  const wire = m.call(vault, "setSavingCore", [core]);

  // 3. Mint & Fund Vault (id riêng biệt cho từng call)
  const mintDeployer = m.call(usdc, "mint", [deployer, FUND_AMOUNT], { id: "mintDeployer" });
  const approveVault = m.call(usdc, "approve", [vault, FUND_AMOUNT], {
    id: "approveVault",
    after: [mintDeployer],
  });
  const fund = m.call(vault, "fundVault", [FUND_AMOUNT], {
    id: "fundVault",
    after: [approveVault, wire],
  });

  // 4. Seed Test Accounts (id riêng biệt cho từng call)
  m.call(usdc, "mint", [testUser1, USER_MINT], { id: "mintAcc1" });
  m.call(usdc, "mint", [testUser2, USER_MINT], { id: "mintAcc2" });

  // 5. Seed Plans tuần tự có ID riêng biệt
  const plan1 = m.call(
    core,
    "createPlan",
    [30, 300, 10_000_000n, 50_000_000_000n, BigInt(VARIANT.earlyPenaltyBps)],
    { id: "createPlan1", after: [wire] }
  );

  const plan2 = m.call(
    core,
    "createPlan",
    [90, 225, 0n, 0n, BigInt(VARIANT.earlyPenaltyBps)],
    { id: "createPlan2", after: [plan1] }
  );

  return { usdc, vault, core };
});
```

### 5.2. Quy trình kiểm chứng Idempotent & Frontend End-to-End:
1. Chạy Hardhat Node: `npx hardhat node`
2. Chạy deploy lần 1:
   ```bash
   npx hardhat ignition deploy ignition/modules/BankingSystem.ts --network localhost --deployment-id banking-local
   ```
3. Chạy deploy lần 2: cùng lệnh trên $ightarrow$ ghi nhận nguyên văn output thực tế xác nhận tính Idempotent.
4. Lấy địa chỉ `SavingCore` được in ra, ghi vào file `frontend/.env`:
   ```env
   VITE_SAVING_CORE_ADDRESS=0x...
   ```
5. Mở Frontend và xác minh trên UI hiển thị chuẩn xác 3 gói tiết kiệm on-chain từ `SavingCore.getAllPlans()`.
6. **Lưu ý vòng đời node (cho N5):** Khi restart node Hardhat (chain mới), phải xóa thư mục journal `ignition/deployments/chain-31337/` hoặc thêm cờ `--reset` trước khi deploy lại để tránh lỗi mismatch journal.

---

## 6. BẢN NHÁP README BONUS NOTES (PHỤC VỤ CHẤM ĐIỂM & BẢO VỆ)

### 6.1. Ánh xạ đề bài & Luật Base vs Bonus
* **Yêu cầu đề:** Test "insufficient vault for interest payout" trong danh sách bắt buộc.
* **Ánh xạ giải pháp:** Trong hệ thống nâng cấp, hành vi này được phủ trọn vẹn bởi **TC-06 (M7)** (khi rút đúng hạn: gốc trả 100%, lãi hoãn trả) và **TC-15 (M9)** (khi tái tục manual/auto: vẫn giữ nguyên luật revert do cần tiền nhập gốc).
* **Quy tắc Base thay thế:** Rule 5 của Base ("vault thiếu thì revert cả gói") được thay thế có chủ đích bởi C1 ("trả 100% gốc, ghi nợ lãi") theo đúng tinh thần "better design" của đề bài.

### 6.2. Bonus C1 — Hoãn trả lãi (Deferred Interest / Principal is Always Safe)
* **Vấn đề (Problem):** Nếu Vault cạn thanh khoản khi khách hàng tất toán, việc revert giao dịch (`InsufficientVaultLiquidity`) sẽ giam giữ luôn 100% tiền gốc của người dùng.
* **Giải pháp (Solution):** Tách bạch dòng tiền: chuyển ngay 100% tiền gốc từ `SavingCore` về ví người dùng, toàn bộ số tiền lãi chưa trả được ghi nhận trọn vẹn vào `unpaidInterest[depositId]` và phát sự kiện `InterestDeferred`. Chủ sở hữu NFT có thể gọi `claimPendingInterest` để nhận đủ tiền lãi khi Vault được nạp tiền.
* **Đánh đổi & Hạn chế (Trade-offs & Caveats):**
  - Claim là **all-or-nothing**: Nếu Vault có tiền nhưng nhỏ hơn khoản nợ, giao dịch claim revert `ClaimNotCovered` để chống phân mảnh dòng tiền.
  - Khi có nhiều khoản nợ cùng tồn tại mà Vault chưa nạp đủ, thứ tự chi trả tuân theo nguyên tắc **First-Come-First-Served (FCFS)**.
  - Các luồng tái tục (`renewDeposit`, `autoRenewDeposit`) vẫn revert nếu Vault thiếu tiền; người dùng cần rút gốc trước qua `withdrawAtMaturity`.

### 6.3. Bonus C2 — Solvency Guard (Bảo vệ thanh khoản lãi cam kết)
* **Vấn đề (Problem):** Admin ngân hàng có thể lạm quyền rút cạn tiền trong Vault (`withdrawVault`), làm mất khả năng chi trả lãi cho các sổ đang hoạt động.
* **Giải pháp (Solution):** `SavingCore` duy trì biến trạng thái `totalCommittedInterest` đại diện cho tổng nghĩa vụ trả lãi của toàn bộ các khoản tiền gửi đang hoạt động cộng với các khoản nợ lãi hoãn trả C1. Hàm `withdrawVault` của `VaultManager` bắt buộc phải vượt qua Solvency Guard:
  `balance - amount >= totalCommittedInterest`.
* **Đánh đổi & Hạn chế (Trade-offs & Caveats):**
  - **Không chống được undercollateralization do compound**: Khi sổ được tái tục, tiền lãi nhập gốc làm phát sinh lãi kỳ mới lớn hơn, có thể khiến `balance < committed`. C2 có nhiệm vụ **chống Admin rút cạn**. Khi `balance < committed`, hàm `withdrawVault` sẽ khóa hoàn toàn mọi mức rút (kể cả rút 0 đồng) cho đến khi Admin nạp thêm vốn (`fundVault`).
  - **Trade-off địa chỉ `savingCore` set-once:** Địa chỉ Core là set-once để chống tráo đổi Core qua mặt Solvency Guard. Nếu Admin cấu hình nhầm EOA, hàm `withdrawVault` sẽ revert khi gọi staticcall; đây là sự đánh đổi chấp nhận được để giữ thiết kế tối giản, bảo mật và không làm thay đổi các test fixture hiện có (như S2/S9(d)).

---

## 7. ĐỒNG BỘ NGUỒN SỰ THẬT ("OVERVIEW PATCH" LÊN V2.3)

Cuối Phase 4, sẽ thực hiện cập nhật `smartcontract/PROJECT_OVERVIEW.md` nâng lên **v2.3**:
1. **Bổ sung Decision Registry Mục 15:**
   - `[D33]`: `claimPendingInterest` revert `NoPendingInterest()` khi `unpaidInterest == 0` (thay vì return im lặng).
   - `[D34]`: `withdrawVault` bỏ qua Solvency Guard khi `savingCore == address(0)` (hỗ trợ rút tự do khi chưa kết nối Core).
2. **Cập nhật Bảng Custom Errors Mục 14.4:** Bổ sung `InsufficientCommitted()` (VaultManager), `ClaimNotCovered()` và `NoPendingInterest()` (SavingCore) cùng cột tham chiếu Test.
3. **Cập nhật Bảng Traceability Audit Phase 3:** Sửa dòng M7 từ "Base branch (TC-06)" thành "C1 — deferral", ghi nhận TC-06 chuyển đổi thành công.
4. **Cập nhật Mục 5.6 & 5.7**: Ghi nhận nguyên tắc FCFS và caveat undercollateralization.

---

## 8. KẾ HOẠCH THỰC THI TỪNG BƯỚC (STEP-BY-STEP)

1. **Bước 1 — Phê duyệt Kế hoạch v3:** Đợi Người dùng kiểm tra và phê duyệt bản kế hoạch chi tiết hoàn chỉnh.
2. **Bước 2 — Phê duyệt Dự thảo Progress N4:** Soạn thảo `docs/progress/N4_bonuses_c2_c1.md` với danh mục checklist và bảng test matrix chi tiết.
3. **Bước 3 — Nâng cấp Smart Contracts & Interface:**
   - Tạo `contracts/interfaces/ISavingCore.sol`.
   - Nâng cấp `contracts/VaultManager.sol` với C2 Guard, error `InsufficientCommitted`, nhánh `savingCore != address(0)`.
   - Nâng cấp `contracts/SavingCore.sol` kế thừa `ISavingCore`, thêm `totalCommittedInterest`, `unpaidInterest`, `ClaimNotCovered`, `NoPendingInterest`, tuân thủ nghiêm ngặt CEI và thứ tự check.
   - Chạy `npm run build` xác nhận Gate G1 (0 warning, 0 error).
4. **Bước 4 — Điều Chỉnh Test Suite Hiện Tại & Export ABI:**
   - Sửa TC-15 trong `Phase2.core_flows.test.ts` (đặt `withdrawVault` trước `openDeposit`).
   - Chuyển đổi TC-06 trong `Phase2.core_flows.test.ts` thành test C1 M7 chính thức.
   - Viết `test/Phase4.bonuses_c2_c1.test.ts` chia 2 describe: C1 (8 tests) và C2 (10 tests).
   - Chạy `node scripts/export-abi.js` cập nhật ABI mới cho Frontend.
5. **Bước 5 — Kiểm Thử Toàn Diện & Đo Lường Coverage:**
   - Chạy `npm test` xác nhận 100% tests pass (kỳ vọng ~65 tests).
   - Chạy `npm run test:coverage` xác nhận Line Coverage $\ge 90\%$, Branch Coverage $\ge 85\%$.
6. **Bước 6 — Xây Dựng & Xác Minh Hardhat Ignition Module:**
   - Tạo file `ignition/modules/BankingSystem.ts` có cấu trúc `after`, `id` riêng biệt, bọc `BigInt`.
   - Khởi động local node `npx hardhat node` và chạy deploy 2 lần kiểm chứng Idempotent.
   - Ghi địa chỉ `SavingCore` vào `frontend/.env`.
7. **Bước 7 — Kiểm Chứng Frontend End-to-End & Build Clean:**
   - Chạy `npm run build` trong `frontend/` đảm bảo 0 lỗi TypeScript/Vite.
   - Mở giao diện kiểm tra đọc thành công 3 gói on-chain từ local node.
8. **Bước 8 — Cập Nhật "Overview Patch" (Nâng lên v2.3) & Nghiệm Thu N4:**
   - Cập nhật `smartcontract/PROJECT_OVERVIEW.md` (bổ sung D33, D34, errors mới, sửa bảng Traceability M7).
   - Ghi đầy đủ log nguyên văn vào `docs/progress/N4_bonuses_c2_c1.md`.
