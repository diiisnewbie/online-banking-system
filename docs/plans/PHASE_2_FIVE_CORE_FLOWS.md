# PHASE 2 — CORE FLOWS IMPLEMENTATION (Kế hoạch chi tiết)

> **Loại file:** KẾ HOẠCH CHI TIẾT & NGHIỆM THU (Đã hoàn thành 100%). Kết quả thực tế ghi vào `docs/progress/N2_five_core_flows.md` **sau** khi hoàn thành và pass toàn bộ test.
> **Nguồn sự thật duy nhất:** `smartcontract/PROJECT_OVERVIEW.md` (bản v2.1). Nếu có bất kỳ xung đột nào → Overview thắng.
> **Quy ước nhãn:**
> - `[Dn]` = Decision ID — xem **Mục 15** Overview.
> - `[Mn]`/`[ARn]`/`[In]`/`[Vn]` = Test ID — xem **Mục 10** Overview.
> - `[Qn]` = Câu hỏi vấn đáp — xem **Mục 8** Overview.
> - Ký hiệu ngày/phase: **N2** (Phase 2).
> **Workspace:** mọi lệnh có ghi file chạy từ `D:\AppsCyclone\banking-system\smartcontract\` (theo `AGENTS.md`).

---

## 1. MỤC TIÊU VÀ EXIT GATES (TIÊU CHÍ HOÀN THÀNH)

### 1.1. Mục tiêu
Hiện thực **4 luồng nghiệp vụ mới** trên `SavingCore.sol` kết hợp `VaultManager.sol`, cùng với `openDeposit` đã hoàn thành ở Phase 1 để tạo thành **5 luồng cốt lõi hoàn chỉnh** và khép kín toàn bộ vòng đời chứng chỉ tiền gửi (`Active → Withdrawn / ManualRenewed / AutoRenewed`):
1. `withdrawAtMaturity(uint256 depositId)`: Rút tiền đúng hạn (100% gốc từ SavingCore + lãi từ Vault).
2. `earlyWithdraw(uint256 depositId)`: Rút trước hạn (forfeit lãi, phạt chuyển về `feeReceiver`, gốc còn lại về user).
3. `renewDeposit(uint256 oldDepositId, uint256 newPlanId)`: Tái tục thủ công (nhập lãi vào gốc, forward-dated, snapshot gói mới, `_safeMint`).
4. `autoRenewDeposit(uint256 oldDepositId)`: Tái tục tự động (**Backdate [B3][D21]**, khóa APR cũ, `_mint`, permissionless).

### 1.2. Exit Gates (5 điều kiện bắt buộc hoàn thành Phase 2)

| # | Gate | Tiêu chuẩn đánh giá |
|---|---|---|
| **G1** | Clean Build | `npm run build` biên dịch thành công 100%, 0 lỗi Solidity, 0 TypeScript error. |
| **G2** | Test Suite Pass 100% | `npm test` vượt qua toàn bộ: baseline Phase 1 hiện có (19 tests) + Phase 2 test suite (**24 kịch bản (TC-01 đến TC-24)**, không skip). Tổng đạt 43 tests pass. |
| **G3** | Khớp Số Vàng & Bất Biến | • Đáo hạn 1,000 USDC gói 90d/225bps → lãi đúng **5,547,945** units, khớp tuyệt đối `previewInterest(id)` (0 lệch wei) `[D11]`.<br>• Rút sớm 1,000 USDC phạt 500bps → 50 USDC về feeReceiver, 950 USDC về user, event `Withdrawn(id, user, 1_000_000_000, 0, true)` `[D18]`.<br>• Tái tục thủ công: `newPrincipal = 1_005_547_945`, forward-dated `startAt = now` `[D12]`.<br>• Tái tục tự động: backdate `startAt = oldMaturityAt`, `maturityAt = oldMaturityAt + oldTenor`, khóa APR cũ `[B3][D21]`. |
| **G4** | Bảo Toàn Workspace | Tuyệt đối **không** sửa `package.json`, `hardhat.config.ts`, không cài package mới. Mở rộng mock `ReentrantReceiver.sol` có kiểm soát cho test reentrancy của `renewDeposit`, không xóa file template. |
| **G5** | Progress Report Đầy Đủ | Ghi nhận kết quả vào `docs/progress/N2_five_core_flows.md` SAU khi hoàn thành, đủ 6 phần quy chuẩn. |

---

## 2. DANH MỤC FILE (SCOPE & DELIVERABLES)

Đường dẫn tính từ gốc `smartcontract/`:

| # | File | Trạng thái | Nội dung chính |
|---|---|---|---|
| 1 | `contracts/SavingCore.sol` | Modify | Bổ sung 5 Custom Errors, 3 Events (`Withdrawn`, `Renewed`, `PenaltyCharged`), chuẩn hóa thứ tự kiểm tra, và hiện thực 4 hàm cốt lõi. |
| 2 | `contracts/interfaces/IVaultManager.sol` | Unchanged | Đã có đủ `payoutInterest`, `paused`, `feeReceiver`. Giữ nguyên. |
| 3 | `contracts/VaultManager.sol` | Unchanged | Đã hoàn thiện từ Phase 1. Sẵn sàng tương tác. Giữ nguyên. |
| 4 | `contracts/mocks/ReentrantReceiver.sol` | Modify | Mở rộng hỗ trợ tự giữ USDC, approve, openDeposit, và tấn công reentrancy qua callback `onERC721Received` khi gọi `renewDeposit` (test M16). |
| 5 | `test/Phase2.core_flows.test.ts` | New | Test suite toàn diện **24 kịch bản (TC-01 đến TC-24)**. |
| 6 | `docs/plans/PHASE_2_FIVE_CORE_FLOWS.md` | Update | Bản kế hoạch chi tiết này (đã cập nhật hoàn chỉnh). |
| 7 | `docs/progress/N2_five_core_flows.md` | Draft/Update | Báo cáo tiến trình và kết quả nghiệm thu Phase 2. |

> **Lưu ý về mock cho TC-13 (AR6):** Không cần tạo contract mới. Sử dụng ngay địa chỉ contract `MockUSDC` (contract không implement `IERC721Receiver`) làm người nhận NFT qua `transferFrom` (không safe), sau đó gọi `autoRenewDeposit` để chứng minh `_mint` không bị kẹt callback.

---

## 3. THIẾT KẾ KỸ THUẬT VÀ CHUẨN HÓA KIỂM TRA

### 3.1. Custom Errors & Events Bổ Sung vào `SavingCore.sol`

```solidity
// --- Custom Errors bổ sung cho Phase 2 ---
error NotDepositOwner();              // msg.sender không phải chủ sở hữu NFT [D31]
error DepositNotActive();             // Cert không ở trạng thái Active (đã rút hoặc renew) [D32]
error NotMatured();                   // Rút đúng hạn hoặc renew trước khi đáo hạn / chưa qua grace
error AlreadyMatured();               // Rút trước hạn khi đã tới hoặc quá đáo hạn (now >= maturityAt) [M5]
// Khai báo trong SavingCore để ABI decoder giải mã được khi revert nổi bọt từ VaultManager.payoutInterest:
error InsufficientVaultLiquidity();   // Vault không đủ tiền trả lãi cho renew/auto-renew [D24]

// --- Events chuẩn và phụ bổ sung ---
event Withdrawn(
    uint256 indexed depositId,
    address indexed owner,
    uint256 principal,
    uint256 interest,
    bool isEarly
);

event Renewed(
    uint256 indexed oldDepositId,
    uint256 indexed newDepositId,
    uint256 newPrincipal,
    uint256 newPlanId
);

event PenaltyCharged(
    uint256 indexed depositId,
    address indexed receiver,
    uint256 penalty
);
```

### 3.2. Chuẩn Hóa Thứ Tự Kiểm Tra (Standardized Check Order)

Để đảm bảo không bao giờ bị lộ lỗi nội bộ của thư viện (như `ERC721NonexistentToken`) và phân quyền nhất quán:

1. **Kiểm tra tồn tại chứng chỉ:**
   - `if (depositId == 0 || depositId >= nextDepositId) revert DepositNotFound(depositId);`
   - Phải chạy **TRƯỚC** `ownerOf(depositId)`. Nếu gọi `ownerOf` trước, ID không tồn tại sẽ throw `ERC721NonexistentToken` thay vì `DepositNotFound`.
2. **Kiểm tra chủ sở hữu:**
   - Áp dụng cho các luồng chủ quyền (`withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`):
   - `if (ownerOf(depositId) != msg.sender) revert NotDepositOwner();`
   - Ở `renewDeposit`, check này phải đứng **TRƯỚC** check plan mới. Nếu stranger gọi renew vào một plan bị tắt, họ phải nhận `NotDepositOwner()` trước.
3. **Kiểm tra trạng thái chứng chỉ:**
   - `if (cert.status != DepositStatus.Active) revert DepositNotActive();`
4. **Kiểm tra điều kiện thời gian:**
   - `withdrawAtMaturity`: `if (block.timestamp < cert.maturityAt) revert NotMatured();`
   - `earlyWithdraw`: `if (block.timestamp >= cert.maturityAt) revert AlreadyMatured();` (dùng toán tử `<` cho rút sớm `[M5][Q5]`).
   - `renewDeposit`: `if (block.timestamp < cert.maturityAt) revert NotMatured();`
   - `autoRenewDeposit`: `if (block.timestamp < cert.maturityAt + gracePeriod) revert NotMatured();`
5. **Kiểm tra gói mới (chỉ cho `renewDeposit`):**
   - `if (newPlanId >= planCount) revert PlanNotFound(newPlanId);`
   - `if (!plans[newPlanId].enabled) revert PlanDisabled();`
   - `if (newPlan.minDeposit > 0 && newPrincipal < newPlan.minDeposit) revert InvalidDepositAmount();`
   - `if (newPlan.maxDeposit > 0 && newPrincipal > newPlan.maxDeposit) revert InvalidDepositAmount();`

---

## 4. MA TRẬN TEST KỊCH BẢN PHASE 2 (PHASE2.CORE_FLOWS.TEST.TS)

Dự kiến triển khai **24 kịch bản kiểm thử (TC-01 đến TC-24)** chi tiết, bao quát 100% yêu cầu:

### Nhóm 1: Rút Đúng Hạn & Rút Sớm (TC-01 đến TC-06)
- **TC-01 (M3 & D11):** Happy Path Đáo Hạn 1,000 USDC, 90d, 225bps. Fast-forward 90d. Nhận đúng 1,000 USDC gốc + 5,547,945 lãi units. **Assert thêm `previewInterest(id) == interest` thực chi** (chứng minh D11 lệch 0 wei).
- **TC-02 (M4 & Q5):** Biên thời gian Đáo Hạn. Dùng `time.setNextBlockTimestamp(maturityAt - 1)` → revert `NotMatured()`. Dùng `time.setNextBlockTimestamp(maturityAt)` → thành công. Sau grace period (khi chưa auto-renew) → vẫn rút thành công `[D20]`.
- **TC-03 (M5 & D17, D18):** Rút Trước Hạn tiêu chuẩn (30d < 90d). Phạt 50 USDC về `feeReceiver`, 950 USDC về user. Event `PenaltyCharged` phát đúng 50 USDC. Event `Withdrawn` phát gốc ban đầu 1,000 USDC, interest = 0, `isEarly = true`.
- **TC-04 (M5 & Q5):** Biên thời gian Rút Sớm. Dùng `time.setNextBlockTimestamp(maturityAt)` gọi `earlyWithdraw` → revert `AlreadyMatured()`.
- **TC-05 (M19):** Rút Sớm với gói `penaltyBps = 0`. User nhận đủ 100% gốc, không transfer phí sang feeReceiver, không emit `PenaltyCharged`.
- **TC-06 (Q2 & D27):** Vault rỗng/thiếu thanh khoản khi gọi `withdrawAtMaturity`. Revert `InsufficientVaultLiquidity()`, giao dịch atomic (gốc chưa bị chuyển, cert vẫn giữ nguyên status `Active`).

### Nhóm 2: Tái Tục Thủ Công (TC-07 đến TC-09)
- **TC-07 (M6 & D12, D14):** Manual Renew hợp lệ sau 90d sang gói mới. Cert cũ = `ManualRenewed`. Cert mới có `newPrincipal = 1_005_547_945`, forward-dated (`startAt = now`), snapshot APR gói mới. NFT mới về user via `_safeMint`.
- **TC-08 (M18 & D14):** Manual Renew lỗi:
  - (1) Cert cần đã đáo hạn (`now >= maturityAt`), renew sang gói bị disable → revert `PlanDisabled()` (chứng minh check plan nằm sau check thời gian).
  - (2) Renew khi `newPrincipal > maxDeposit` gói mới → revert `InvalidDepositAmount()`.
  - (3) Renew trước đáo hạn → revert `NotMatured()`.
- **TC-09 (D12 & Q5):** Manual Renew sau grace period khi chưa ai auto-renew → thành công (chứng minh user luôn chủ động được tài sản).

### Nhóm 3: Tái Tục Tự Động (TC-10 đến TC-15)
- **TC-10 (AR1 & B3, D21):** Auto Renew hợp lệ sau grace period. Stranger gọi thành công. Backdate `startAt = oldMaturityAt`, `maturityAt = oldMaturityAt + 90d`, khóa APR cũ. Mint NFT cho chủ cũ bằng `_mint`.
- **TC-11 (AR2):** Biên thời gian Auto Renew. Tại `time.setNextBlockTimestamp(maturityAt + gracePeriod - 1)` → revert `NotMatured()`. Tại `time.setNextBlockTimestamp(maturityAt + gracePeriod)` → thành công đúng giây.
- **TC-12 (AR3 & AR4):** Auto Renew bỏ qua kiểm tra plan tắt và cap. Admin disable gói cũ, hoặc gốc mới vượt maxDeposit → auto-renew vẫn thành công `[D13]`.
- **TC-13 (AR6):** Auto Renew an toàn receiver. Dùng `MockUSDC` (không implement `IERC721Receiver`) làm chủ NFT qua `transferFrom`. Gọi `autoRenewDeposit` → thành công mượt mà nhờ `_mint` (không bị kẹt callback).
- **TC-14 (AR8):** **Chuỗi Backdate liên tiếp khi bot trễ 100 ngày (tenor 30d, grace 3d).**
  - Đặt mốc thời gian T0 bằng `maturityAt` của cert gốc và `now = T0 + 100d`.
  - Mỗi lần gọi truyền id mới lấy từ event `Renewed` hoặc `nextDepositId - 1`.
  - 4 lần gọi liên tiếp thành công (block chỉ cách nhau 1 giây nên điều kiện grace vẫn đúng).
  - Assert cert cuối có khoảng thời gian [T0 + 90d, T0 + 120d].
  - Assert mỗi cert có `startAt` bằng `maturityAt` của cert trước.
  - Lần gọi thứ 5 revert `NotMatured()` (vì cần now >= T0 + 123d).
  - Fixture tạo sẵn plan 30d trong test và nạp Vault đủ tiền cho cả 4 kỳ lãi compounding.
- **TC-15 (M9 & D24):** Vault thiếu thanh khoản khi gọi `renewDeposit` hoặc `autoRenewDeposit` → revert `InsufficientVaultLiquidity()`.

### Nhóm 4: Bảo Mật, Phân Quyền & Bất Biến (TC-16 đến TC-24)
- **TC-16 (M17 & AR7):** Ma trận chống rút 2 lần và tái chi tiêu: Thử gọi cả 4 hàm (`withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`, `autoRenewDeposit`) trên các cert ở trạng thái `Withdrawn`, `ManualRenewed`, `AutoRenewed` (12 ca) → toàn bộ đều revert `DepositNotActive()`.
- **TC-17 (M11 & M15):** Phân quyền sở hữu và chuyển nhượng: Ví lạ gọi 3 luồng chủ quyền → revert `NotDepositOwner()`. Alice chuyển NFT sang Bob via `transferFrom` → Bob rút được thành công, Alice mất quyền.
- **TC-18 (DepositNotFound cho cả 4 hàm):** Gọi cả 4 hàm với `depositId = 0` và `depositId = 999` → revert `DepositNotFound(id)` (không bị revert lỗi lạ của ERC721). Kiểm tra stranger gọi `renewDeposit` vào gói disable vẫn nhận `NotDepositOwner()` trước `PlanDisabled()`.
- **TC-19 (M16 mở rộng cho renew):** Reentrancy trên `_safeMint` trong `renewDeposit`. `ReentrantReceiver` tự giữ USDC, tự approve, tự mở deposit và tự gọi `renewDeposit`. Trong callback `onERC721Received`, nó cố tình gọi lại `withdrawAtMaturity` hoặc `renewDeposit` → revert `ReentrancyGuardReentrantCall()` (chứ không phải `NotDepositOwner()`).
- **TC-20 (I1 - Snapshot Invariant 15 điểm):** Mở 2 deposit cùng plan trước khi admin gọi `updatePlan(0, 100)`. Sau khi đáo hạn, Deposit 1 gọi `withdrawAtMaturity` → nhận đủ lãi 5_547_945 (tính theo APR cũ 225); Deposit 2 gọi `renewDeposit` → `newPrincipal = 1_005_547_945` (lãi cũ tính theo APR cũ 225). Ghi chú trong README: `updatePlan` chỉ đổi APR, phần phạt không đổi bằng hàm này.
- **TC-21 (M12 - Cụ thể hóa số liệu làm tròn):**
  - Với principal 1_000_001n, lãi kỳ vọng là 5547n (floor, cùng giá trị với 1_000_000n).
  - Kiểm tra biên: principal 180 → lãi 0, principal 181 → lãi 1 (với gói 90d/225bps).
  - Case interest = 0: Tạo plan có minDeposit = 0 (bằng `createPlan` trong test, vì Plan 0 có min 10 USDC).
  - Khẳng định: dust nằm lại Vault (lãi không được trả ra) `[Q4]`.
- **TC-22 (M20 - Quản lý feeReceiver):** Gọi `setFeeReceiver(address(0))` → revert `ZeroAddress()`. Đổi sang ví mới hợp lệ → tiền phạt của các lần early tiếp theo chảy về ví mới.
- **TC-23 (M10, M21 - Pause, Unpause & Rescue Funding):** Khi Vault pause: cả 4 luồng người dùng đều revert `SystemPaused()`. Assert `vault.fundVault(...)` vẫn chạy thành công khi đang pause (M10 / D1). Khi `vault.unpause()`: mọi luồng hoạt động lại bình thường (M21).
- **TC-24 (Bonus Invariant I3 - Cân bằng tài sản SavingCore):** Sau chuỗi giao dịch phức tạp (mở, rút sớm, tái tục, auto-renew, đáo hạn), tổng principal của mọi cert đang Active (tính bằng vòng lặp 1 <= id < nextDepositId) bằng chính xác `usdc.balanceOf(SavingCore)`.

---

## 5. KỸ THUẬT TEST BIÊN THỜI GIAN TRÁNH SAI LỆCH 1 GIÂY (Q5)

Trong Hardhat, `time.increaseTo(t)` có thể khiến transaction tiếp theo được mine tại t + 1 tùy thuộc vào automine. Để chứng minh toán học chuẩn xác tuyệt đối cho Q5:

```ts
// Case 1: Trước 1 giây phải revert
await time.setNextBlockTimestamp(targetTime - 1);
await expect(savingCore.connect(user).withdrawAtMaturity(id))
  .to.be.revertedWithCustomError(savingCore, "NotMatured");

// Case 2: Đúng giây targetTime phải thành công
await time.setNextBlockTimestamp(targetTime);
await savingCore.connect(user).withdrawAtMaturity(id);
```

---

## 6. KẾ HOẠCH THỰC THI TỪNG BƯỚC

1. **Bước 1 — Phê duyệt kế hoạch:** Chờ người dùng xác nhận bản kế hoạch đã cập nhật.
2. **Bước 2 — Cập nhật contract `SavingCore.sol` & mock:**
   - Thêm 5 custom errors, 3 events.
   - Thêm helper kiểm tra cert chuẩn hóa.
   - Hiện thực 4 hàm nghiệp vụ.
   - Mở rộng `ReentrantReceiver.sol` hỗ trợ tự giữ USDC và test reentrancy renew.
3. **Bước 3 — Biên dịch sạch (`npm run build`):** Xác nhận 0 error, 0 warning.
4. **Bước 4 — Viết test suite (`test/Phase2.core_flows.test.ts`):** Triển khai **24 kịch bản từ TC-01 đến TC-24**.
5. **Bước 5 — Chạy kiểm thử toàn bộ (`npm test`):** Đảm bảo 100% test pass (19 test Phase 1 + 24 test Phase 2 = 43 tests).
6. **Bước 6 — Đo lường Coverage (`npm run test:coverage`):** Ghi nhận tỷ lệ bao phủ code thực tế.
7. **Bước 7 — Cập nhật báo cáo (`docs/progress/N2_five_core_flows.md`):** Hoàn thiện 6 phần nghiệm thu.
