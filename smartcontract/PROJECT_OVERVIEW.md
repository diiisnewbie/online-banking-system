# PROJECT OVERVIEW v2.2 — ON-CHAIN TERM DEPOSIT SYSTEM (ONLINE BANKING)

> **Document Purpose**: Tài liệu quy chuẩn kỹ thuật và nghiệp vụ tổng thể (Single Source of Truth) cho lập trình viên, mô hình AI và **kỳ bảo vệ đồ án**. Mô tả kiến trúc, 5 luồng nghiệp vụ, công thức toán học, các quyết định thiết kế đã chốt (D1–D32), Test Matrix, bảng API và lộ trình thực thi.
>
> **Phiên bản:** v2.2 (2026-10-26) — đồng bộ sau khi hoàn thành Phase 3: chuẩn hóa mô tả M5 (`DepositNotActive`), I1 (chỉ hạ APR), đồng bộ view `getCertificatesOfOwner(address account)` và `getAllPlans()`, script xuất ABI `scripts/export-abi.js`, ghim Tailwind v3 (`^3.4.17`), loại bỏ alias `variant.ts` (Frontend độc lập đọc 100% on-chain).
> **Nguồn:** v1 + `CHANGES_REVIEW` (A1–A9, B10–B20, C21–C27) + các review bổ sung + quyết định đã xác nhận (Mục 15).
> **Quy ước chú thích:** `[Dn]` = Decision ID (Mục 15) · `[Qn]` = Oral Defense Question (Mục 8) · `[Mn]`/`[ARn]` = Test ID (Mục 10) · **`N1–N5` = 5 ngày thực thi** (khác hẳn `[Dn]`).

---

## 1. TỔNG QUAN HỆ THỐNG (SYSTEM SUMMARY)

Hệ thống gửi tiết kiệm có kỳ hạn (Term Deposit Banking System) chạy phi tập trung hoàn toàn bằng Smart Contract trên EVM:

- **Người gửi (Depositor / User)**: Gửi USDC theo kỳ hạn (tenor), nhận chứng chỉ tiền gửi dạng **ERC-721 NFT**. Đến hạn hoặc trước hạn, user có thể rút gốc + lãi, rút sớm (chịu phạt), hoặc tái tục (manual renew / auto renew).
- **Ngân hàng (Bank Admin)**: Quản lý gói tiết kiệm (Saving Plans), nạp thanh khoản vào quỹ trả lãi (Interest Vault), tạm dừng hệ thống (Emergency Pause), chỉ định ví thu phí phạt (`feeReceiver`).
- **Token thanh toán**: `MockUSDC` (ERC-20, **chính xác 6 decimals**).

---

## 2. KIẾN TRÚC & SEPARATION OF DUTIES (ARCHITECTURE)

Ba hợp đồng độc lập, tách bạch trách nhiệm:

```
                        +----------------------------------------+
                        |            MockUSDC.sol                |
                        | (ERC-20, 6 decimals, Mintable test)    |
                        +-------------------+--------------------+
                                            |
                         USDC Transfers     |  USDC Transfers
                         (Principal)        |  (Interest Pool)
                                             v
         +----------------------------------+----------------------------------+
         |                                                                     |
         v                                                                     v
+-----------------------------+                       +--------------------------------+
|      SavingCore.sol         |   payoutInterest()    |       VaultManager.sol         |
|  (ERC721Enumerable)         |---------------------->|                                |
| - Holds Users' Principal    |   (only by SavingCore)| - Holds Bank's Interest Fund   |
| - Saving Plans + **committed**|                      | - Admin Liquidity Control      |
| - Mints ERC-721 Certificate |                       | - feeReceiver Configuration   |
| - Executes User Flows       |                       | - Emergency Pause Master       |
+-----------------------------+                       +--------------------------------+
                                   ^            |
                                   |  ISavingCore.totalCommittedInterest() (view, chỉ withdrawVault)
                                   +------------+
```

### 2.1. Phân định vai trò & trách nhiệm lưu trữ

1. **`MockUSDC.sol`** — token thử nghiệm mô phỏng USDC chuẩn.
   - **Bắt buộc 6 decimals** (1 USDC = 10⁶ units = 1,000,000 wei-equivalent).
   - Bất kỳ ai cũng gọi được `mint(address to, uint256 amount)` (faucet mở, không cap, không Ownable).
2. **`VaultManager.sol`** — lưu trữ **tiền riêng của ngân hàng (Interest Liquidity Pool)**.
   - `fundVault(amount)` — admin nạp tiền; **không bị chặn khi pause** (phải nạp được lúc emergency để giải cứu) `[D1]`.
   - `withdrawVault(amount)` — admin rút vốn; bị chặn khi pause; bị **Solvency Guard (C2)** chặn `[D25]`; kiểm tra `amount <= balance` để revert custom error, không để panic underflow `[D25]`.
   - `payoutInterest(to, amount)` — **chỉ `SavingCore` được gọi** (else revert `NotSavingCore`) `[D16]`.
   - Cấu hình `feeReceiver` (mặc định = owner, chặn `address(0)`) `[D17]`.
   - **`pause()` / `unpause()` — NGUỒN DUY NHẤT của toàn hệ thống** `[D1]`.
3. **`SavingCore.sol`** — lưu trữ **toàn bộ tiền gốc (Principal) của người dùng**.
   - Kế thừa `ERC721Enumerable` + bộ view cho frontend `[D19]`.
   - Quản lý `SavingPlan`; xử lý 5 luồng nghiệp vụ; kiểm tra pause bằng cách **đọc `vault.paused()`** (không tự sở hữu trạng thái pause) `[D1]`.
   - Sở hữu biến **`totalCommittedInterest`** (gốc rễ của C2 nằm nơi dòng tiền được quản lý) `[D25]`.
   - Địa chỉ `MockUSDC` và `VaultManager` **immutable trong constructor** `[D4]`.

> **BẤT BIẾN TỐI QUAN TRỌNG (CRITICAL INVARIANT)**:
> Tiền gốc (`SavingCore`) và tiền lãi (`VaultManager`) **hoàn toàn độc lập**. Lãi **luôn** trả từ Vault, **tuyệt đối không** dùng tiền gốc của người gửi sau trả lãi cho người gửi trước (anti-Ponzi). Dòng ra principal hợp lệ duy nhất: trả gốc cho chủ sở hữu + phí phạt early-withdraw chuyển cho `feeReceiver`.

---

## 3. CẤU TRÚC DỮ LIỆU (DATA STRUCTURES)

### 3.1. Saving Plan

```solidity
struct SavingPlan {
    uint256 planId;
    uint256 tenorDays;                // Kỳ hạn (7, 30, 90, 180, 365 ngày...)
    uint256 aprBps;                   // Lãi suất năm (1 bps = 0.01%; 225 bps = 2.25%)
    uint256 minDeposit;               // Tối thiểu (0 = không giới hạn)
    uint256 maxDeposit;               // Tối đa (0 = không giới hạn)
    uint256 earlyWithdrawPenaltyBps;  // Phạt rút sớm (500 bps = 5.00%)
    bool enabled;                     // Nhận khoản gửi mới?
}
```

- `planId` bắt đầu từ **0** (Plan 0 tạo trong constructor); `depositId` bắt đầu từ **1** `[D6]`.
- **Validate khi `createPlan`** `[D5]`: `tenorDays ∈ [1, 3650]`, **`aprBps ∈ [1, 10000]` (0 bị từ chối — chốt rõ để test "invalid APR" biết giá trị revert là `0` và `10001`)**, `penaltyBps ≤ 10000` (0 được phép — xem `[M19]`), và không đồng thời `minDeposit > 0 && maxDeposit > 0 && minDeposit > maxDeposit`.
- **Chỉ `aprBps` sửa được**: `updatePlan(planId, newAprBps)` đúng chữ ký đề, emit `PlanUpdated(planId, newAprBps)`; bật/tắt qua `enablePlan`/`disablePlan`. **Không có hàm sửa tenor/min/max/penalty** — ngoài phạm vi chấm điểm, không làm `[D5]`.
- `tenorDays` không sửa được sau khi tạo.

### 3.2. Deposit Certificate (ERC-721 Token Data)

```solidity
enum DepositStatus { Active, Withdrawn, ManualRenewed, AutoRenewed }

struct DepositCertificate {
    uint256 depositId;                // Token ID của ERC-721 NFT
    uint256 planId;
    uint256 principal;                // Tiền gốc (6 decimals)
    uint256 startAt;                  // block.timestamp bắt đầu
    uint256 maturityAt;               // startAt + tenorSeconds
    uint256 aprBpsAtOpen;             // Snapshot APR (BẤT BIẾN)
    uint256 penaltyBpsAtOpen;         // Snapshot phí phạt (BẤT BIẾN)
    DepositStatus status;
}
```

- **Không burn NFT** — sau tất toán đổi `status`, giữ làm lịch sử cho UI/indexer `[D8]`.
- Kỳ hạn tính từ chính cert: `tenorSeconds = maturityAt − startAt` `[D10]` — mọi lần tính lãi (cam kết & trả ra) dùng cùng một con số.
- **Quyền sở hữu**: mọi luồng rút/renew/claim yêu cầu **chính `ownerOf(depositId) == msg.sender`**; account được `approve`/operator của ERC-721 **không có quyền** gọi các luồng này (chỉ có quyền `transferFrom` chuyển quyền sở hữu) `[D31]`.

### 3.3. Trạng thái bổ sung (C1 / C2)

```solidity
// ——— SavingCore (nơi dòng tiền gốc và mọi luồng nghiệp vụ chạy) ———
mapping(uint256 => uint256) public unpaidInterest;      // Nợ lãi [D22]
uint256 public totalCommittedInterest;                  // Σ lãi toàn kỳ deposit Active + Σ unpaid [D25]

// ——— VaultManager: KHÔNG lưu state cam kết; đọc qua ISavingCore lúc withdrawVault ———
```

- **Đặt `totalCommittedInterest` ở `SavingCore`** `[D25]`: mọi luồng cập nhật (open/withdraw/early/renew/auto/claim) là **thao tác nội bộ — 0 lời gọi ngoài**; chỉ `withdrawVault` của admin tốn 1 staticcall `ISavingCore.totalCommittedInterest()`.

---

## 4. QUY TRÌNH NGHIỆP VỤ CHI TIẾT (5 CORE USER FLOWS)

### 4.1. Mở sổ tiết kiệm — `openDeposit(planId, amount)`

1. **Điều kiện**: user `approve(SavingCore, amount)` trước; hệ thống **không pause** (đọc `vault.paused()`) `[D2]`.
2. **Validations** (revert nếu):
   - `planId >= planCount` → `PlanNotFound`
   - `plan.enabled == false` → `PlanDisabled`
   - `amount == 0` → `InvalidDepositAmount` `[D7]`
   - `amount < minDeposit` (khi `minDeposit > 0`) hoặc `amount > maxDeposit` (khi `maxDeposit > 0`) → `InvalidDepositAmount`
3. **Thứ tự thực thi (CEI) + `nonReentrant`** `[D32]`:
   1. Checks (bảng trên).
   2. Effects: `depositId = nextDepositId++`; ghi cert (`status = Active`, `maturityAt = block.timestamp + tenorDays×86400`, snapshot `aprBpsAtOpen`, `penaltyBpsAtOpen`); **`totalCommittedInterest += _calcInterest(cert)`** `[D30]` (nội bộ, không gọi ngoài).
   3. Interactions: `usdc.safeTransferFrom(user, SavingCore, amount)` → `_safeMint(user, depositId)` — callback `onERC721Received` là vector reentrancy, đã bị khóa `[D16]`.
4. **C2 không can thiệp ở đây**: `openDeposit` **không** kiểm tra vault có đủ tiền (C1 lo phần đó) `[D26]`.
5. `emit DepositOpened(depositId, user, planId, amount, maturityAt, aprBpsAtOpen)`.

### 4.2. Rút tiền đúng hạn — `withdrawAtMaturity(depositId)`

1. **Điều kiện**: chính chủ NFT (`ownerOf == msg.sender`) `[D31]` · `status == Active` (else `DepositNotActive`) · `block.timestamp >= maturityAt` (else `NotMatured`) · không pause.
   - **Không có cận trên thời gian**: sau grace period, nếu cert vẫn `Active` (bot chưa renew) thì **vẫn rút được** `[D20]` — đây là lối thoát cuối cùng, bảo đảm user không bao giờ bị kẹt tiền.
2. **Tính lãi (một hàm duy nhất `_calcInterest`)** `[D11]`:

   $$\text{interest} = \frac{\text{principal} \times \text{aprBpsAtOpen} \times (\text{maturityAt} - \text{startAt})}{365 \times 86{,}400 \times 10{,}000}$$

   *Luôn nhân hết tử số rồi chia một lần cuối (floor) `[D9]`.*
3. **Thanh toán — C1 (dứt khoát, không revert cả gói)** `[D22]`:
   - **Vault đủ** (`vault` balance ≥ interest): `vault.payoutInterest(user, interest)` trả ngay → `emit Withdrawn(id, user, principal, interest, false)`.
   - **Vault thiếu**: trả **100% `principal`** từ `SavingCore`; `unpaidInterest[id] += interest` (**no partial**); `emit Withdrawn(id, user, principal, 0, false)` **+** `emit InterestDeferred(id, user, interest)` → user gọi `claimPendingInterest(id)` sau (xem 5.6).
4. **CEI**: set `status = Withdrawn` **trước** mọi lệnh chuyển token (chống double-withdrawal — test `[M17]`).
5. **Commitment (nội bộ)**: `totalCommittedInterest −= interest`; nếu hoãn thì `+= interest` ngay (tổng không đổi — vẫn còn nợ) `[D30]`.

### 4.3. Rút tiền trước hạn — `earlyWithdraw(depositId)`

1. **Điều kiện**: chính chủ NFT `[D31]` · `status == Active` (else `DepositNotActive`) · `block.timestamp < maturityAt` — **dùng toán tử `<`** (else `AlreadyMatured`) · không pause.
2. **Tính toán**:
   - Lãi nhận được: `interest = 0` (forfeit toàn bộ).
   - `penalty = principal × penaltyBpsAtOpen / 10000` (floor).
   - `amountToUser = principal − penalty`.
3. **Thanh toán**: `penalty → feeReceiver` (**bỏ qua transfer nếu `penalty == 0`**) `[D17]`; `amountToUser → user`. Cả hai là dòng ra từ `SavingCore`.
4. **CEI**: `status = Withdrawn` trước khi transfer.
5. **Commitment (nội bộ)**: `totalCommittedInterest −= interest` (giải phóng toàn bộ cam kết) `[D30]`.
6. **Event**: `emit Withdrawn(depositId, user, principal, 0, true)` — **`principal` là gốc gốc, không phải `amountToUser`** `[D18]`; kèm event phụ `PenaltyCharged(depositId, feeReceiver, penalty)` khi `penalty > 0`.

### 4.4. Tái tục thủ công — `renewDeposit(oldDepositId, newPlanId)`

1. **Điều kiện**: chính chủ NFT cũ `[D31]` · `status == Active` (else `DepositNotActive`) · `block.timestamp >= maturityAt` (else `NotMatured`) — **không có cận trên** `[D12]` · `plans[newPlanId].enabled == true` (else `PlanDisabled`) `[D14]` · không pause.
2. **Tính toán**:
   - `oldInterest = _calcInterest(oldCert)`.
   - **Vault phải đủ `oldInterest`, thiếu → revert `InsufficientVaultLiquidity`** `[D24]` — lối thoát cho user là `withdrawAtMaturity` (nhận gốc ngay, lãi hoãn theo C1).
   - `newPrincipal = oldPrincipal + oldInterest` (lãi chuyển từ Vault → SavingCore để nhập gốc).
   - Kiểm tra `newPrincipal` thỏa `minDeposit`/`maxDeposit` của `newPlanId` (else `InvalidDepositAmount`) `[D14]` — test `[M18]`.
3. **Thực thi (CEI)** `[D32]`:
   - `oldCert.status = ManualRenewed`; **nội bộ**: `totalCommittedInterest −= oldInterest`, `+= _calcInterest(newCert)` `[D30]`.
   - Cert mới: `principal = newPrincipal`, snapshot APR/phạt theo **`newPlanId`**, `startAt = block.timestamp` (**forward-dated — bắt đầu từ thời điểm gọi, KHÔNG backdate**), `maturityAt = block.timestamp + newTenor`, `status = Active`.
   - Mint NFT mới bằng **`_safeMint`** cho chủ sở hữu cũ `[D15]`.
4. `emit Renewed(oldId, newId, newPrincipal, newPlanId)`.

### 4.5. Tái tục tự động — `autoRenewDeposit(oldDepositId)` — **BACKDATE [B3] [D21]**

> **Sửa mâu thuẫn v1**: v1 đặt `maturityAt = now + tenor` nhưng Q3 nói "bù lãi quá hạn" — mâu thuẫn.
> **v2: cơ chế Backdate** — mỗi lần gọi bù **đúng một kỳ**, phủ kín khoảng thời gian bot/người dùng bỏ ngỏ.

1. **Điều kiện**: `msg.sender` **bất kỳ** (permissionless — không incentive fee, xem Q3) · `status == Active` (else `DepositNotActive`) · `block.timestamp >= maturityAt + GRACE_PERIOD` · **không kiểm tra `plan.enabled`, không kiểm tra min/max** `[D13]` · không pause.
2. **Tính toán**:
   - `oldTenor = oldCert.maturityAt − oldCert.startAt` `[D10]`.
   - `oldInterest = _calcInterest(oldCert)`; `newPrincipal = oldPrincipal + oldInterest`.
   - **Vault phải đủ `oldInterest`, thiếu → revert `InsufficientVaultLiquidity`** `[D24]` (user vẫn tự rút được gốc qua 4.2 + C1).
3. **Backdate** `[D21]`:

   | Trường | Giá trị |
   |---|---|
   | `startAt` (mới) | **`= oldCert.maturityAt`** (lùi về ngày đáo hạn cũ — KHÔNG phải `block.timestamp`) |
   | `maturityAt` (mới) | **`= oldCert.maturityAt + oldTenor`** |
   | `aprBpsAtOpen` | **= `oldCert.aprBpsAtOpen`** (khóa APR cũ — bảo vệ user nếu admin hạ lãi suất, test `[I1]`) |
   | `penaltyBpsAtOpen` | = `oldCert.penaltyBpsAtOpen` (khóa phạt cũ) |
   | `principal` | `newPrincipal` |

4. **Thực thi (CEI)**: `oldCert.status = AutoRenewed`; cập nhật cam kết **nội bộ** `[D30]`; mint NFT mới cho **`ownerOf(oldId)`** bằng **`_mint`** (không callback — tránh chặn chuỗi backdate khi chủ NFT là contract không implement receiver) `[D15]`.
5. `emit Renewed(oldId, newId, newPrincipal, oldCert.planId)`.

**Ví dụ AR8 — bot chết 100 ngày, tenor 30 ngày, grace 3 ngày `[AR8]`:**

| Lần gọi | Cert tạo ra | Điều kiện thời gian |
|---|---|---|
| 1 | `[T0, T0+30]` | cần `now ≥ T0+3` ✓ (now = T0+100) |
| 2 | `[T0+30, T0+60]` | cần `≥ T0+33` ✓ |
| 3 | `[T0+60, T0+90]` | cần `≥ T0+63` ✓ |
| 4 | `[T0+90, T0+120]` | cần `≥ T0+93` ✓ |
| — | *(không gọi thêm)* | lần 5 cần `≥ T0+123` ✗ |

→ **Đúng 4 lần gọi**, cert cuối đáo hạn tại **T0+120**. Toàn bộ 100 ngày bỏ ngỏ được phủ kín bởi chuỗi cert, lãi nhập gốc liên tục (compound), không có ngày chết nào.

**Điều kiện thành công của "bù lãi":** (i) có người gọi lại từng mắt xích; (ii) Vault đủ tiền từng lần. Nếu đứt giữa chừng → xem 4.2/C1 (user vẫn rút gốc + nợ phần chưa bù).

---

## 5. BONUS C1 & C2 — ĐỊNH NGHĨA CHI TIẾT

### 5.1. Nguyên tắc

- **C1 — Principal is always safe**: tiền gốc **không bao giờ** bị giữ lại vì Vault hết tiền. Lãi thiếu trả được ghi thành **nợ** và claim sau.
- **C2 — Solvency Guard**: admin **không bao giờ** rút được phần Vault đang bảo chứng cho lãi cam kết.
- C1 và C2 **bổ sung, không mâu thuẫn**: C1 xử lý khi thiếu tiền (luồng user), C2 xử lý khi có tiền (luồng admin).

### 5.2. Rút đáo hạn khi Vault thiếu (C1)

```solidity
// SavingCore — status = Withdrawn đã set trước đó (CEI)
usdc.safeTransfer(user, principal);                // 100% gốc — luôn luôn trả từ SavingCore

if (usdc.balanceOf(vault) >= interest) {
    vault.payoutInterest(user, interest);          // trả lãi ngay từ Vault
    emit Withdrawn(id, user, principal, interest, false);
} else {
    unpaidInterest[id] += interest;                // ghi nợ trọn vẹn, KHÔNG partial
    emit Withdrawn(id, user, principal, 0, false);
    emit InterestDeferred(id, user, interest);
}
```

- **"Ghi nợ 100%" thay vì "trả partial"**: invariant gọn (principal pool trả đúng 1 lần), không có trạng thái trung gian "ai nhận wei cuối cùng", chống griefing (xả vault để ép trạng thái partial), test đơn giản.
- **Bổ sung ràng buộc nội bộ**: nhánh else chỉ chạy khi vault **thực sự không đủ** — `payoutInterest` cũng tự revert nếu thiếu (chốt chặn đôi).

### 5.3. Early withdraw (C1)

- Không dính nợ: lãi = 0, phạt thu ngay từ principal → `totalCommittedInterest −= interest` là xong `[D30]`.

### 5.4. Renew & Auto-renew khi Vault thiếu `[D24]`

- **Revert cả hai luồng** (`InsufficientVaultLiquidity`). Không có "renew bằng gốc".
- **Lý do**: mỗi mắt xích backdate đều cần tiền mặt để nhập gốc; "renew một nửa" sẽ tạo cert phủ kỳ nhưng mất dấu kỳ lãi nào đã trả/chưa trả → ma trận state phình to, dễ sai.
- **Lối thoát đã có sẵn**: `withdrawAtMaturity` (4.2) — nhận **100% gốc ngay**, lãi vào `unpaidInterest` (C1). Sau khi admin `fundVault`, user claim lãi hoặc `openDeposit` gói mới.

### 5.5. Auto-renew backdate & chuỗi bù lãi (Q3)

- Bình thường (bot sống): đáo hạn `T0`, auto-renew tại `T0+3` (sau grace) → cert mới `[T0, T0+30]` — **3 ngày grace vẫn được tính lãi** (v1 mất 3 ngày này).
- Bot chết: chuỗi backdate như 4.5 bù đủ các kỳ đã bỏ lỡ.
- **Giới hạn trung thực (README + vấn đáp)**: bù lãi cần (i) người gọi, (ii) vault đủ tiền; không có incentive fee — về lý thuyết bot tự nguyện, thực tế chủ deposit vẫn tự gọi được vì lợi ích của chính họ.

### 5.6. Claim lãi hoãn — `claimPendingInterest(depositId)`

- **Chỉ chủ NFT hiện tại** của `depositId` được gọi (ai giữ NFT thì hưởng — nhất quán với Q1) `[D23]`.
- **All-or-nothing** `[D23]`: `require(usdc.balanceOf(vault) >= unpaidInterest[id])`, thiếu → revert `ClaimNotCovered`.
  - *Giá trị của all-or-nothing*: C2 đã đưa `unpaid` vào cam kết → admin **không thể** rút phần bảo chứng cho khoản nợ này.
  - ***Không được nói "chắc thắng"***: điều kiện trên chỉ đảm bảo thắng **khi `vault.balance ≥ totalCommittedInterest` tổng thể**. Khi vault còn thiếu (admin chưa nạp đủ), nhiều khoản nợ cùng tồn tại → **ai claim trước được trả trước** (first-come-first-served). Phải ghi vào README và chuẩn bị cho vấn đáp.
- Trả xong: `totalCommittedInterest −= unpaidInterest[id]` (nội bộ); `unpaidInterest[id] = 0`; `emit InterestClaimed(id, user, amount)`.

### 5.7. Bảng tổng hợp cập nhật `totalCommittedInterest` `[D30]`

> Biến nằm ở **`SavingCore`** → toàn bộ bảng dưới đây là **thao tác nội bộ, 0 lời gọi ngoài** `[D25]`.

| Luồng | Chuyển động | Ghi chú |
|---|---|---|
| `openDeposit` | **+** `I` (lãi toàn kỳ) | `I = _calcInterest(cert)` snapshot tại open — test `[I2]` |
| `withdrawAtMaturity` — vault đủ | **−** `I` | lãi trả ngay, xong nợ |
| `withdrawAtMaturity` — vault thiếu | **−** `I` (hết cam kết Active) **rồi +** `I` (vào unpaid) | tổng **không đổi** |
| `earlyWithdraw` | **−** `I` | lãi forfeit, giải phóng cam kết |
| `renewDeposit` | **−** `I_old`, **+** `I_new` | `I_new` tính trên `newPrincipal` đã nhập lãi |
| `autoRenewDeposit` | **−** `I_old`, **+** `I_new` | tương tự |
| `claimPendingInterest` | **−** `U` (unpaid đã trả) | all-or-nothing: trừ trọn vẹn |
| `fundVault` | không đổi committed | chỉ tăng balance |
| `withdrawVault` | không đổi committed | **đọc 1 staticcall** `ISavingCore.totalCommittedInterest()` |

**Công thức C2** `[D25]`:

$$\text{totalCommittedInterest} \;=\; \sum_{\text{c ∈ Active}} \_calcInterest(c) \;+\; \sum_{\text{d}} \text{unpaidInterest}[d]$$

```solidity
// VaultManager.withdrawVault — thứ tự kiểm tra để KHÔNG bao giờ panic underflow
require(amount <= usdc.balanceOf(address(this)), AmountExceedsBalance);   // [D25]
require(usdc.balanceOf(address(this)) - amount >= savingCore.totalCommittedInterest(),
        InsufficientCommitted);
```

> **Caveat bắt buộc ghi README/vấn đáp**: backdate + compound làm `I_new` có thể **lớn hơn** số vừa trả ra → sau một lần renew, `balance` có thể **nhỏ hơn** `committed`. **C2 không thể chống undercollateralization — nó chỉ chống admin rút cạn.** Bổ sung thanh khoản là việc của `fundVault`. Khi `balance < committed` thì `withdrawVault` chặn mọi mức rút (vẫn an toàn), claim all-or-nothing revert đến khi được nạp — và khi đó **claim theo thứ tự đến trước, trả trước**.

---

## 6. THAM SỐ CÁ NHÂN HÓA THEO MSSV (VARIANT PARAMETERS)

### 6.1. Quy tắc (không đổi so với v1)

- $A$ = **chữ số cuối cùng** của MSSV · $B$ = **chữ số kế cuối** của MSSV.

| Thông số | Công thức |
| :--- | :--- |
| Grace Period | $(A \bmod 3) + 2$ ngày |
| Default Plan APR | $(200 + A \times 25)$ bps |
| Early Penalty | $(300 + B \times 50)$ bps |
| Default Tenor | $B$ chẵn $\Rightarrow 90$ ngày · $B$ lẻ $\Rightarrow 180$ ngày |

### 6.2. Giá trị của đồ án này — **A = 1, B = 4** (MSSV kết thúc bằng …41)

| Thông số | Thay thế | **Giá trị** |
|---|---|---|
| Grace Period | $(1 \bmod 3) + 2$ | **3 ngày = 259,200 giây** |
| Default Plan APR | $200 + 1 \times 25$ | **225 bps = 2.25%** |
| Early Penalty | $300 + 4 \times 50$ | **500 bps = 5.00%** |
| Default Tenor | B=4 chẵn | **90 ngày** |
| Plan 0 `minDeposit` | *(config seed, không phải variant)* | 10 USDC = `10_000_000` |
| Plan 0 `maxDeposit` | *(config seed)* | 100,000 USDC = `100_000_000_000` |

### 6.3. Một nguồn sự thật cho số variant — `smartcontract/config/variant.ts` `[D29]`

```ts
// smartcontract/config/variant.ts — NƠI DUY NHẤT chứa số VARIANT (MSSV). Dùng cho SEED (Ignition) và TEST.
// Import trong test: import { VARIANT } from "../config/variant.js" (ESM node20, cần đuôi .js).
export const A = 1;   // chữ số CUỐI MSSV
export const B = 4;   // chữ số KẾ CUỐI MSSV

export const VARIANT = {
  gracePeriodSeconds: ((A % 3) + 2) * 86400,  // 3 ngày
  defaultAprBps: 200 + A * 25,                 // 225
  earlyPenaltyBps: 300 + B * 50,               // 500
  defaultTenorDays: B % 2 === 0 ? 90 : 180,    // 90 (B=4 chẵn)
} as const;
```

- `SavingCore` nhận các giá trị này qua **constructor (immutable)** — không hardcode trong Solidity `[D28]`.
- Test import `variant.ts` và **đồng thời assert đúng công thức** (chống "test tự đồng thuận với chính nó") — test `[V1]`.
- **Phạm vi**: chỉ **seed + test**. **Frontend đọc số liệu gói tiết kiệm từ chain** (`SavingCore.getAllPlans()`) `[D29]` — nếu admin thay đổi plan thì UI tự đúng (xem 11.2).

### 6.4. Bộ số vàng cho test & demo (gốc 1,000 USDC = `1_000_000_000` units, gói 90d/225bps)

| Hạng mục | Công thức | Kết quả |
|---|---|---|
| Lãi đáo hạn | `1e9 × 225 × (90×86400) / (365×86400×10000)` | **`5_547_945` units = 5.547945 USDC** |
| Phạt rút sớm | `1e9 × 500 / 10000` | **`50_000_000` = 50 USDC** → user nhận 950 USDC |
| Gốc sau renew | `1_000_000_000 + 5_547_945` | **`1_005_547_945`** |

> **Lưu ý test `interest = 0`**: với Plan 0 (225bps/90d) thì `interest = 0 ⇔ principal ≤ 180 units` — nhưng `minDeposit = 10 USDC` chặn các giá trị này. Do đó seed phải có **Plan 2 với `minDeposit = 0`** để test nhánh `interest = 0` (xem 11.1).

---

## 7. DANH SÁCH SỰ KIỆN (EVENTS)

### 7.1. 5 event bắt buộc (chữ ký GIỮ NGUYÊN v1)

```solidity
event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
event DepositOpened(uint256 indexed depositId, address indexed owner, uint256 indexed planId,
                     uint256 principal, uint256 maturityAt, uint256 aprBpsAtOpen);
event Withdrawn(uint256 indexed depositId, address indexed owner,
                uint256 principal, uint256 interest, bool isEarly);
event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId,
              uint256 newPrincipal, uint256 newPlanId);
```

### 7.2. Semantics của `Withdrawn` `[D18]`

| Trường | Ý nghĩa |
|---|---|
| `principal` | **Luôn là gốc gốc tại thời điểm mở sổ** — không bao giờ là `amountToUser` |
| `interest` | **Số lãi ĐÃ TRẢ NGAY trong giao dịch này** (0 nếu early hoặc C1 hoãn) |
| `isEarly` | `true` ⇔ `earlyWithdraw` |

> Indexer muốn biết user thực nhận bao giờ cũng đọc cert (`principal`, `penaltyBpsAtOpen`) — event 1 mình không đủ để suy ra phạt early.

### 7.3. Event phụ (ngoài 5 event bắt buộc — nên có)

```solidity
event InterestDeferred(uint256 indexed depositId, address indexed owner, uint256 amount);   // C1 hoãn lãi
event InterestClaimed(uint256 indexed depositId, address indexed claimer, uint256 amount);   // C1 claim
event PenaltyCharged(uint256 indexed depositId, address indexed receiver, uint256 penalty);  // phạt early
event PlanToggled(uint256 indexed planId, bool enabled);                                     // enable/disable
event VaultFunded(address indexed funder, uint256 amount);
event VaultWithdrawn(address indexed to, uint256 amount);
event SavingCoreSet(address indexed core);          // set-once
event FeeReceiverSet(address indexed receiver);
event InterestPaid(address indexed to, uint256 amount);
```

---

## 8. CÂU HỎI BẢO VỆ ĐỒ ÁN (ORAL DEFENSE — Q1–Q7, bản v2)

1. **NFT chuyển nhượng — tốt hay nguy hiểm?**
   - *Quy tắc*: chỉ `ownerOf(depositId)` lúc gọi hàm được nhận gốc+lãi `[D31]`. Đây là chuẩn Web3 (thị trường thứ cấp cho chứng chỉ tiền gửi).
   - ***Mặt nguy hiểm phải nêu***: ai bán NFT **sau khi đã tất toán** (status `Withdrawn`) thì NFT vô giá trị — người mua mất tiền; hoặc người bán list NFT rồi **trước khi buyer nhận, seller rút trước hạn** → buyer nhận NFT rỗng. *Phòng vệ*: buyer luôn kiểm tra `status == Active` và `maturityAt` on-chain trước khi trả tiền.
   - **[D23]**: claim lãi hoãn cũng theo chủ NFT hiện tại — mua NFT = mua luôn quyền nhận nợ lãi còn lại.

2. **Kịch bản Vault rỗng (Empty Vault) — đã có C1 `[D22]`**
   - Base v1: revert ⇒ có thể "giam" luôn cả gốc của user.
   - **v2: C1 là quyết định dứt khoát** — rút đúng hạn luôn trả 100% gốc, lãi vào `unpaidInterest`, claim sau khi được nạp. Kèm caveat C2 + first-come-first-served khi vault thiếu (Mục 5.6/5.7).

3. **Bot ngừng hoạt động (Dead Bot) — Backdate `[D21]`**
   - V1 mâu thuẫn (nói "bù lãi" nhưng `maturityAt = now + tenor`).
   - **v2: backdate bù đúng 1 kỳ/lần gọi** (ví dụ AR8: 4 lần gọi, cert cuối `T0+120`). Không mất tiền gốc, không mất ngày chết.
   - Điều kiện: có người gọi + vault đủ tiền; không incentive fee (thiết kế chủ đích — reward làm phức tạp C2 accounting). User luôn có lối thoát C1 nếu chuỗi kẹt.

4. **Số dư làm tròn (Rounding Dust) `[D9]`**
   - Phép chia số nguyên floor; **nhân trước chia sau**; dust nằm lại pool → không over-draw.
   - **Không tuyên bố "loại trừ hoàn toàn nguy cơ revert"** — thay bằng **bằng chứng test**: test làm tròn principal lẻ `[M12]` và nhánh `interest = 0` (`principal ≤ 180` với Plan 0, hoặc Plan 2 `min = 0`).

5. **Mốc thời gian biên**
   - Đúng giây `maturityAt` ⇒ dùng `>=` ⇒ tính là **rút đúng hạn** `[M4]`.
   - Auto-renew cần `>= maturityAt + grace` (3 ngày) `[AR2]`.
   - **Manual renew KHÔNG có cận trên** `[D12]` — renew được bất cứ lúc nào sau đáo hạn, kể cả đã qua grace.
   - Rút sớm dùng `<` (trước đáo hạn) — sai mốc → `AlreadyMatured` `[M5]`.

6. **Vô hiệu hóa gói khi đang có khoản gửi hoạt động**
   - `disablePlan` chỉ chặn khoản **mới** `[P3]`; khoản cũ vẫn đáo hạn rút bình thường.
   - Manual renew **vào gói đã disable ⇒ revert** `[M18]` `[D14]`; **auto-renew KHÔNG check enabled** `[D13]` (plan chỉ tắt nhận mới, không khóa khoản đang chạy — và check min/max có thể revert giữ tiền user vĩnh viễn).

7. **Phân tích tấn công (Attack Vectors & Defense)**
   - **Reentrancy**: CEI + `ReentrancyGuard` toàn bộ `[D32]`; ***vector đặc thù: callback `onERC721Received` qua `_safeMint` trong `openDeposit`*** `[D16]` — test `[M16]`.
   - ***Vector đặc thù: gọi trực tiếp `vault.payoutInterest()`*** từ ví lạ → khóa `NotSavingCore` `[D16]` — test `[M11]`.
   - **Double-withdrawal**: `status = Withdrawn` đặt trước mọi transfer — test `[M17]`.
   - **Token giả mạo**: `usdc` immutable trong constructor cả 2 contract `[D4]`.
   - **Mint `_mint` vs `_safeMint`** `[D15]`: `openDeposit` & `renewDeposit` dùng `_safeMint` (user chủ động nhận); `autoRenew` dùng `_mint` (người thứ ba kích hoạt — không để contract không có receiver chặn chuỗi backdate) — test `[AR6]`.
   - **Quyền operator**: `approve`/operator ERC-721 **không** gọi được luồng rút tiền `[D31]`.

---

## 9. CẤU TRÚC THƯ MỤC

```
banking-system/
├── docs/
│   ├── archive/PROJECT_OVERVIEW_v1.md
│   ├── plans/                      # Kế hoạch từng ngày (N1..N5) — viết TRƯỚC
│   └── progress/                   # Kết quả từng ngày (viết SAU) + index Q/D/Test-ID
├── smartcontract/
│   ├── config/
│   │   └── variant.ts              # NƠI DUY NHẤT chứa số VARIANT (seed + test) [D29]
│   ├── contracts/
│   │   ├── interfaces/
│   │   │   ├── ISavingCore.sol      # VaultManager đọc totalCommittedInterest() [D25]
│   │   │   └── IVaultManager.sol
│   │   ├── MockUSDC.sol
│   │   ├── SavingCore.sol
│   │   └── VaultManager.sol
│   ├── ignition/modules/BankingSystem.ts
│   ├── test/                        # Mocha + Chai (xem Mục 10, 11)
│   └── PROJECT_OVERVIEW.md          # file này
└── frontend/                        # React + Vite + ethers v6
```

> **Lưu ý vị trí `variant.ts`**: đặt trong `smartcontract/config/` (không phải gốc repo) để import ESM trong Hardhat hoạt động được (`../config/variant.js`). Frontend (Phase 5) cần cấu hình Vite `resolve.alias` hoặc `server.fs.allow` để import file này.

---

## 10. TEST MATRIX

> Chạy bằng Hardhat 3 built-in coverage: `npm run test:coverage` (không cài thêm package).
> Cột **Ngày**: `N3` = test suite Base · `N4` = bổ sung test C1/C2 (test base liên quan được **chuyển đổi**, xem `[D27]`).
> Nhóm: **V** = variant · **P** = plan management · **M** = luồng user · **I** = invariants/snapshot · **AR** = auto-renew.

| ID | Luồng | Kịch bản | Kỳ vọng chính | Ngày | D/Q |
|---|---|---|---|---|---|
| **V1** | Variant | Assert `variant.ts` đúng công thức MSSV | grace=3d, apr=225, penalty=500, tenor=90 | N3 | D28,D29 |
| **P1** | Plan | `createPlan` hợp lệ; invalid: `apr=0`, `apr=10001`, `tenor=0`, `tenor=3651`, `min>max` | hợp lệ → `PlanCreated`; invalid → `InvalidPlanParams` | N3 | D5 |
| **P2** | Plan | `updatePlan(planId, newAprBps)` — chỉ APR; `apr=0`/`10001` | emit `PlanUpdated`; invalid → `InvalidPlanParams` | N3 | D5 |
| **P3** | Plan | `disablePlan` rồi `openDeposit`; `enablePlan` rồi mở lại | disable → `PlanDisabled`; enable → chạy bình thường | N3 | D5,D14 |
| **M1** | open | Happy path 1,000 USDC | cert đúng, NFT về user, `maturityAt=now+90d`, event đủ 6 args | N3 | — |
| **M2** | open | planId sai / disabled / `amount=0` / `<min` / `>max` | revert đúng custom error | N3 | D5,D7 |
| **M3** | maturity | Rút đúng hạn 1,000 USDC | lãi = **5,547,945** units, balance đúng 2 phía | N3 | — |
| **M4** | maturity | Biên thời gian: đúng giây `maturityAt`, trước 1 giây, sau grace | `>=` tính đúng hạn; trước → `NotMatured`; sau grace vẫn rút được | N3 | D20 |
| **M5** | early | Rút sớm trước đáo hạn; sau đáo hạn gọi lại | phạt 50 USDC → feeReceiver, user 950, `isEarly=true`, `principal` gốc; lần 2 → `DepositNotActive` | N3 | D17,D18 |
| **M6** | renew | Manual renew hợp lệ | old=`ManualRenewed`, new cert forward-dated, APR theo plan mới | N3 | D12,D14 |
| **M7** | maturity | **C1: vault thiếu khi rút đúng hạn** | **gốc 100% về user, `unpaidInterest` tăng, `InterestDeferred` emit** *(N3: ghi nhận nhánh revert base → N4 chuyển đổi thành đây)* `[D27]` | N4 | D22 |
| **M8** | claim | `claimPendingInterest` all-or-nothing | thiếu → `ClaimNotCovered`; đủ → trả trọn, trừ committed; transfer NFT → chủ mới claim được | N4 | D23 |
| **M9** | renew | Renew/auto-renew khi vault thiếu | **revert `InsufficientVaultLiquidity`** (cả base lẫn C1) | N3 | D24 |
| **M10** | pause | Tắt pause rồi gọi từng luồng | open/maturity/early/renew/auto/claim → `SystemPaused`; `fundVault` vẫn chạy | N3 | D1,D2 |
| **M11** | access | Ví lạ gọi rút/renew; `payoutInterest` gọi ngoài; `setSavingCore` lần 2 | `NotDepositOwner` / `NotSavingCore` / `SavingCoreAlreadySet` | N3 | D3,D16,D31 |
| **M12** | rounding | Principal lẻ (`1_000_001`), case `interest=0` (Plan 2 min=0, principal ≤ 180 với Plan 0) | floor đúng, không revert thiếu wei, dust nằm pool | N3 | D9 |
| **M13** | C2 | Bảng cập nhật commitment đủ 7 luồng (5.7) — đọc `totalCommittedInterest()` từ SavingCore | khớp sau từng luồng, **không lời gọi ngoài ở luồng user** | N4 | D25,D30 |
| **M14** | C2 | `withdrawVault`: bằng guard → OK; vượt guard → `InsufficientCommitted`; **`amount > balance` → `AmountExceedsBalance` (không panic underflow)** | đúng 3 nhánh | N4 | D25 |
| **M15** | NFT | Alice transfer NFT sang Bob trước đáo hạn | Bob (người giữ) rút được, Alice → `NotDepositOwner`; `tokenOfOwnerByIndex` đúng | N3 | D19,D31,Q1 |
| **M16** | NFT | Reentrancy qua `onERC721Received` (mock receiver gọi lại `openDeposit`) | revert do `nonReentrant` | N3 | D16,D32 |
| **M17** | NFT | **Rút lần hai** (sau khi đã `Withdrawn`) & renew cert đã xong | → `DepositNotActive` | N3 | D32 |
| **M18** | renew | **Manual renew vào plan disabled; renew mà `newPrincipal > maxDeposit`** | cả hai → revert (`PlanDisabled` / `InvalidDepositAmount`) | N3 | D14 |
| **M19** | early | **Plan có `penaltyBps = 0`** → early withdraw | user nhận đủ 100% gốc, **không** transfer sang feeReceiver, không `PenaltyCharged` | N3 | D17 |
| **M20** | admin | `setFeeReceiver(address(0))` → revert; set ví khác hợp lệ | `ZeroAddress`; penalty chảy về ví mới ở lần early tiếp theo | N3 | D17 |
| **M21** | pause | **`unpause()`** sau pause | mọi luồng user chạy lại bình thường | N3 | D1 |
| **I1** | **Snapshot** | **Admin hạ APR SAU khi user đã mở** | `withdrawAtMaturity`/`renew` vẫn dùng **APR cũ** (`aprBpsAtOpen`) — invariant 15 điểm | N3 | D11,Q6 |
| **I2** | C2 | Sau `openDeposit`: cam kết tăng đúng `_calcInterest` | `totalCommittedInterest` == lãi toàn kỳ của cert vừa mở | N4 | D25,D30 |
| **I3** | **Invariant** | Sau chuỗi `open → early → renew → withdraw`: `usdc.balanceOf(SavingCore)` | **== Σ `principal` của mọi deposit `Active`** (bằng đúng, không sai 1 wei) | N4 | INV |
| **AR1** | auto | Auto-renew hợp lệ (qua grace, vault đủ) | backdate `startAt=oldMaturityAt`, APR/phạt khóa cũ, `_mint` | N3 | D21,D15 |
| **AR2** | auto | Gọi trước khi qua grace | revert | N3 | — |
| **AR3** | auto | Gọi khi plan đã `disable` | **vẫn thành công** (không check enabled) | N3 | D13 |
| **AR4** | auto | Gọi khi `newPrincipal > maxDeposit` của plan cũ | **vẫn thành công** (không check min/max) | N3 | D13 |
| **AR5** | auto | Permissionless: ví stranger gọi | thành công (không cần bot đặc quyền) | N3 | Q3 |
| **AR6** | auto | Chủ NFT là contract không có `onERC721Received`: chuyển NFT bằng **`transferFrom` (không safe)** sang contract đó rồi auto-renew | **vẫn mint được** (`_mint` không callback) | N3 | D15 |
| **AR7** | auto | Auto-renew cert **không còn `Active`** (đã Withdrawn/Renewed) | revert `DepositNotActive` | N3 | — |
| **AR8** | auto | **Backdate chuỗi**: bot chết 100 ngày, tenor 30d, grace 3d | **đúng 4 lần gọi**, cert cuối `[T0+90, T0+120]`; từng cert `startAt = maturityAt` của cert trước | N3 | D21 |

---

## 11. FRONTEND & DEPLOY SPEC

### 11.1. Deploy (Hardhat Ignition)

- Module `ignition/modules/BankingSystem.ts`, **tuần tự** `[D3]`:
  1. Deploy `MockUSDC`.
  2. Deploy `VaultManager(usdc, deployer)`.
  3. Deploy `SavingCore(usdc, vault, deployer, gracePeriod, plan0Params)` — truyền grace/Plan 0 từ **`config/variant.ts`** (module Ignition import trực tiếp — không nhập tay vào JSON parameters) `[D28][D29]`.
  4. `vault.setSavingCore(core)` — **một lần duy nhất** (set-once, onlyOwner, event `SavingCoreSet`).
- **Seed** (tham số Plan 1, Plan 2 đặt trong module Ignition; riêng hằng số min/max Plan 0 xuất từ `config/variant.ts` nạp vào constructor SavingCore):
  - `mint` 10,000 USDC cho các tài khoản test → `approve` → **`fundVault(10,000 USDC)`**.
  - **Plan 0** (constructor): 90d / 225bps / phạt 500 / min 10 USDC / max 100,000 USDC — gói mặc định variant.
  - **Plan 1**: **30 ngày**, APR 300bps, min 10 USDC, max 50,000 USDC — gói ngắn hạn cho demo renew + test renew vượt max `[M18]`.
  - **Plan 2**: 90 ngày, APR 225bps, **`minDeposit = 0`**, `maxDeposit = 0` (unlimited) — dùng cho test `interest = 0` `[M12]` và các case biên.
- Idempotent qua journal `ignition/deployments/chain-31337/` (gitignore).

### 11.2. Frontend (React + Vite + TypeScript + ethers v6)

| Màn hình | Chức năng | Mức độ |
|---|---|---|
| **Plans** | Danh sách gói đọc on-chain qua `getAllPlans()` (không đọc `variant.ts` — admin đổi plan là UI tự đúng) `[D29]` | Bắt buộc |
| **Faucet** | `MockUSDC.mint` (faucet mở) | Bắt buộc |
| **Open Deposit** | Chọn gói, nhập số tiền (quy đổi 6 decimals), `approve` + `openDeposit` | Bắt buộc |
| **My Certificates** | `tokenOfOwnerByIndex` (Enumerable): status, APR/phạt snapshot, **countdown đáo hạn**, lãi dự kiến (dùng `_calcInterest` replica ở FE hoặc view on-chain) | Bắt buộc |
| **Actions** | Rút đúng hạn (hiện lãi nhận / nợ hoãn), rút sớm (hiện phạt), Renew (chọn plan), **Claim pending interest** (hiện số nợ `unpaidInterest`) | Bắt buộc |
| **Activity** | Lịch sử event: `DepositOpened/Withdrawn/Renewed/InterestDeferred/InterestClaimed` | Bắt buộc |
| **Dev Time-Travel** | Nút **dev-only** (`import.meta.env.DEV && chainId === 31337`) gọi JSON-RPC `evm_increaseTime` + `evm_mine` để nhảy qua ngày đáo hạn/grace — phục vụ quay video (kịch bản "chạy time forward") | Bắt buộc (demo) |
| **Admin** | create/update/enable/disable plan · `fundVault` (hiện `balance` vs `committed`) · `withdrawVault` (guard C2) · `setFeeReceiver` · `pause/unpause` | **Stretch — nếu còn thời gian** (N5) |

- Chuỗi: local `hardhat node` (chainId 31337, `http://127.0.0.1:8545`), ví injected (MetaMask).
- **Quy tắc số liệu**: mọi con số plan đọc từ **chain**; `variant.ts` chỉ dùng cho **seed + test** `[D29]`.

---

## 12. README & VIDEO SPEC

**README bắt buộc gồm**:
1. Cảnh báo "dự án nội bộ — chưa audit".
2. Kiến trúc 3 contract + 2 pool độc lập (principal/interest) + `totalCommittedInterest` nằm ở SavingCore.
3. Công thức lãi/phạt + quy tắc làm tròn (floor, nhân trước chia sau).
4. Bảng variant (A=1, B=4) + cách `config/variant.ts` nạp vào seed/test.
5. Cách cài / chạy / test / deploy.
6. **Hạn chế đã biết**:
   - C2 chống admin rút cạn, **không** chống undercollateralization do compound khi renew.
   - Claim lãi hoãn: all-or-nothing; khi vault chưa nạp đủ → **first-come-first-served**.
   - Bù lãi (backdate) cần người gọi + vault đủ tiền; không incentive fee.
   - **Bất đối xứng renew**: manual renew tính từ **`block.timestamp` (now)**, auto-renew **backdate từ `oldMaturityAt`**.
   - NFT bán sau tất toán là NFT rỗng (Q1); buyer phải kiểm tra on-chain.
   - Admin hạ APR sau khi mở **không** ảnh hưởng khoản đã mở (snapshot).
   - `openDeposit` bị chặn khi pause (mở rộng so với spec gốc).
   - `_mint` ở auto-renew: contract không có receiver vẫn nhận NFT được (phải có luồng gọi rút).
7. Bản đồ Q-ID / D-ID / Test-ID.

**Video demo — 3–5 phút, 4 cảnh chính**:

| # | Cảnh | Nội dung |
|---|---|---|
| ① | Mở sổ | Faucet → open 1,000 USDC → show NFT + lãi dự kiến **5.547945** |
| ② | Time-forward & rút đúng hạn | Nút dev `evm_increaseTime` → rút đúng hạn, lãi chảy từ Vault |
| ③ | Rút sớm | Mở khoản khác → rút sớm → phạt 50 USDC sang `feeReceiver` |
| ④ | Renew + Admin | Manual renew (và/hoặc auto-renew) + thao tác Admin (fund/pause/guard C2) ngắn gọn |

---

## 13. PROGRESS TRACKER (LỘ TRÌNH 5 NGÀY — N1–N5)

| Ngày | Cổng bắt buộc (Gate) | File MD ghi nhận |
|---|---|---|
| **N1** Setup & Foundation | `npm run build` + `npm test` pass; smoke `openDeposit` OK | `docs/progress/N1_setup_and_foundation.md` |
| **N2** Năm luồng nghiệp vụ | Chạy trọn vòng đời 1 khoản trên local; đủ 5 event | `docs/progress/N2_five_core_flows.md` |
| **N3** Test suite Base + FE scaffold | Coverage Base ≥90%; scaffold Vite xong | `docs/progress/N3_test_suite_base.md` |
| **N4** C2 → C1 + Deploy | Coverage tổng ≥90%; Ignition deploy local + seed (3 gói) | `docs/progress/N4_bonuses_c2_c1.md` |
| **N5** Frontend + Docs | Demo end-to-end; README + Q1–Q7 | `docs/progress/N5_frontend_docs.md` |

> Kế hoạch chi tiết từng ngày: `docs/plans/N*.md` · File MD kết quả viết **sau** khi hoàn tất ngày, mỗi file ghi: việc đã làm ↔ Q/D/Test-ID trả lời ↔ tại sao chọn phương án ↔ bằng chứng verify.

**Hai lưu ý vận hành:**

1. **Hardhat 3 tooling** (ESM, cú pháp test `network.create()`, coverage built-in) là lựa chọn đã chốt vì hợp template hiện có. **Ngay đầu N1 chạy smoke test đầu tiên** để đo độ quen thuộc; nếu tooling chặn quá nửa ngày → **báo cáo lại, cân nhắc lùi về Hardhat 2 + `solidity-coverage`** (việc này đòi hỏi **cài package mới → phải được phê duyệt trước** theo `AGENTS.md`).
2. **N5 là ngày nặng nhất** (frontend đầy đủ + README + video + luyện vấn đáp) → phân bổ: frontend màn hình bắt buộc trong nửa đầu ngày, **Admin panel là stretch goal**; giữ **ít nhất nửa ngày buffer** cho video 3–5 phút và README.

---

## 14. BẢNG API TỔNG HỢP & CUSTOM ERRORS

### 14.1. `MockUSDC.sol`

| Hàm | Quyền | Ghi chú |
|---|---|---|
| `decimals() → 6` | view/pure | ERC-20 chuẩn 6 decimals |
| `mint(address to, uint256 amount)` | **ai cũng gọi được** | faucet test, không cap |
| `approve/transfer/transferFrom/balanceOf/allowance` | ERC-20 chuẩn | — |

### 14.2. `VaultManager.sol`

| Hàm | Quyền | Ghi chú |
|---|---|---|
| `constructor(address usdc_, address owner_)` | — | `usdc` immutable |
| `setSavingCore(address core)` | onlyOwner, **một lần** | revert nếu đã set |
| `setFeeReceiver(address r)` | onlyOwner | revert `ZeroAddress` |
| `fundVault(uint256 amount)` | onlyOwner (cần approve) | **không** bị pause chặn |
| `withdrawVault(uint256 amount)` | onlyOwner + whenNotPaused | 2 guard: `amount <= balance`, rồi `balance − amount ≥ committed` |
| `payoutInterest(address to, uint256 amount)` | **chỉ SavingCore** | whenNotPaused; thiếu → `InsufficientVaultLiquidity` |
| `pause()` / `unpause()` | onlyOwner | **nguồn pause duy nhất** |
| Views: `usdc`, `savingCore`, `feeReceiver`, `paused`, `owner` | view | — |

### 14.3. `SavingCore.sol`

**Admin:**

| Hàm | Quyền |
|---|---|
| `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps) → planId` | onlyOwner |
| `updatePlan(planId, newAprBps)` | onlyOwner — **chỉ APR, đúng đề** |
| `enablePlan(planId)` / `disablePlan(planId)` | onlyOwner |

**User:**

| Hàm | Điều kiện chính |
|---|---|
| `openDeposit(planId, amount) → depositId` | not paused, plan enabled, `amount > 0`, min/max |
| `withdrawAtMaturity(depositId)` | owner, Active, `now >= maturityAt`, not paused |
| `earlyWithdraw(depositId)` | owner, Active, `now < maturityAt`, not paused |
| `renewDeposit(oldId, newPlanId)` | owner, Active, `now >= maturityAt`, plan mới enabled, vault đủ lãi, min/max |
| `autoRenewDeposit(oldId)` | **ai cũng gọi được**, Active, `now >= maturityAt + grace`, vault đủ lãi |
| `claimPendingInterest(depositId)` | **chủ NFT hiện tại**, `unpaid > 0`, vault đủ số nợ |

**Views cho frontend `[D19]`:**

```
getCertificate(depositId) → DepositCertificate
getAllPlans() → SavingPlan[]                 // frontend đọc số liệu plan từ CHAIN [D29]
getCertificatesOfOwner(address account) → DepositCertificate[] // view tiện ích gom toàn bộ cert của ví (0 warning)
unpaidInterest(depositId) → uint256
totalCommittedInterest() → uint256
gracePeriod() → uint256
planCount() / nextDepositId / plans(id)
ERC721Enumerable: balanceOf / tokenOfOwnerByIndex / ownerOf / tokenURI?
```

### 14.4. Bảng Custom Errors (tổng hợp)

| Error | Nơi revert | Test |
|---|---|---|
| `SystemPaused()` | mọi luồng user trong SavingCore | M10 |
| `EnforcedPause()` (OZ `Pausable`) | `withdrawVault` / `payoutInterest` khi pause | S8, S9 |
| `PlanNotFound(uint256)` | open/create với id sai | M2 |
| `DepositNotFound(uint256)` | `getCertificate`/`previewInterest` với id chưa tồn tại | S11 |
| `PlanDisabled()` | open kế disable; renew vào plan tắt | P3, M18 |
| `InvalidPlanParams()` | create/update plan vượt biên (`apr=0`, `apr=10001`, tenor, min>max) | P1, P2 |
| `InvalidDepositAmount()` | `amount=0`, vượt min/max; renew vượt max của plan mới | M2, M18 |
| `NotDepositOwner()` | ví không phải `ownerOf` gọi luồng sở hữu | M11, M15 |
| `DepositNotActive()` | rút/renew lần hai, auto-renew cert đã xong | M17, AR7 |
| `NotMatured()` | gọi `withdrawAtMaturity`/`renew` **trước** đáo hạn | M4, M6 |
| `AlreadyMatured()` | gọi `earlyWithdraw` **sau** đáo hạn | M5 |
| `InsufficientVaultLiquidity()` | `payoutInterest`; renew/auto-renew khi vault thiếu | M9 |
| `ClaimNotCovered()` | claim khi `vault.balance < unpaid` | M8 |
| `ZeroAddress()` | `setFeeReceiver(0)` | M20 |
| `SavingCoreAlreadySet()` | `setSavingCore` lần 2 | M11 |
| `NotSavingCore()` | `payoutInterest` gọi từ ví lạ | M11 |
| `AmountExceedsBalance()` | `withdrawVault` > balance (không panic underflow) | M14 |
| `InsufficientCommitted()` | guard C2: `balance − amount < committed` | M14 |
| `ReentrancyGuardReentrantCall()` (OZ `ReentrancyGuard`) | reentrancy | M16 |

---

## 15. PHỤ LỤC — DECISION REGISTRY (D1–D32)

| D-ID | Quyết định | Trạng thái | Change-item |
|---|---|---|---|
| **D1** | Pause **chỉ** ở `VaultManager`; `SavingCore` đọc `vault.paused()`; `fundVault` không bị pause chặn | ✅ | A2, B10-mục |
| **D2** | `openDeposit` **cũng** bị chặn khi pause *(mở rộng so với spec gốc — ghi README)* | ✅ | B11 |
| **D3** | Deploy tuần tự + `setSavingCore` một lần (vòng phụ thuộc địa chỉ) | ✅ | B10 |
| **D4** | `MockUSDC` immutable trong constructor cả 2 contract + `SafeERC20` mọi luồng | ✅ | F/Q7 |
| **D5** | Validate plan khi `createPlan`: `tenor∈[1,3650]`, **`aprBps∈[1,10000]`**, `penaltyBps≤10000` (0 được), min≤max; `updatePlan` **chỉ sửa APR** đúng đề | ✅ | B15 + review #6/#7 |
| **D6** | `depositId` bắt đầu từ 1 | ✅ | B15 |
| **D7** | `amount > 0` | ✅ | B15 |
| **D8** | Không burn NFT — đổi `status`, giữ làm lịch sử | ✅ | A4 |
| **D9** | Làm tròn: nhân trước chia sau, floor; dust ở lại pool; **không** tuyên bố loại trừ hoàn toàn revert | ✅ | A5 |
| **D10** | Kỳ hạn tính từ `maturityAt − startAt` | ✅ | B16 |
| **D11** | Một hàm `_calcInterest` dùng chung cho cam kết **và** trả ra (không lệch 1 wei); luôn đọc snapshot `aprBpsAtOpen` | ✅ | B16 |
| **D12** | Manual renew **không có cận trên** thời gian (chỉ cần `≥ maturityAt`) | ✅ | A7 |
| **D13** | Auto-renew **không** check `enabled` và min/max | ✅ | B12 |
| **D14** | Manual renew **có** check `enabled` và min/max | ✅ | B12 |
| **D15** | Auto-renew dùng `_mint`; open & manual renew dùng `_safeMint` | ✅ | B13 |
| **D16** | Đóng reentrancy qua `onERC721Received` + `payoutInterest` khóa `onlySavingCore` | ✅ | A8 |
| **D17** | `feeReceiver` mặc định = owner; chặn `address(0)`; `penalty=0` bỏ qua transfer | ✅ | B14 |
| **D18** | `Withdrawn`: luôn ghi `principal` gốc, `interest` = lãi đã trả ngay | ✅ | A3 |
| **D19** | `ERC721Enumerable` + bộ view (`getAllPlans`, `getCertificate`, `unpaidInterest`, …) cho frontend | ✅ | B17 + review |
| **D20** | `withdrawAtMaturity` dùng được **sau grace** nếu cert còn `Active` | ✅ | B18 |
| **D21** | **Auto-renew Backdate [B3]**: `startAt = oldMaturityAt`; mỗi gọi bù đúng 1 kỳ | ✅ | A1 |
| **D22** | C1: vault thiếu → trả **100% gốc**, ghi `unpaidInterest`, emit `InterestDeferred` (no partial) | ✅ | C21 |
| **D23** | C1: `claimPendingInterest` **all-or-nothing**, do **chủ NFT hiện tại** gọi; thiếu vault → first-come-first-served (ghi README) | ✅ | C22 + review #8 |
| **D24** | Renew/auto-renew **revert** khi vault thiếu (user vẫn rút được gốc qua C1) | ✅ | C23 *(đảo quyết định "principal-only renew" trước đó)* |
| **D25** | C2: **`totalCommittedInterest` đặt ở `SavingCore`** (cập nhật nội bộ, 0 lời gọi ngoài); `withdrawVault` đọc qua `ISavingCore` + kiểm tra `amount ≤ balance` trước | ✅ | C24 + review #3/#10 |
| **D26** | C2 **không** chặn `openDeposit` khi vault thiếu | ✅ | C25 |
| **D27** | Test base "vault thiếu → revert" **chuyển đổi** thành M7 ("gốc trả, lãi hoãn") ở N4 | ✅ | C27 |
| **D28** | Grace period là `immutable` truyền qua constructor | ✅ | B19 |
| **D29** | `smartcontract/config/variant.ts` là nơi **duy nhất** chứa số **variant** — dùng cho **seed + test**; frontend đọc số liệu plan **từ chain**; import test: `"../config/variant.js"` (ESM). *Đặt trong `smartcontract/config/` để Hardhat ESM resolve hoạt động; frontend Phase 5 cần Vite alias* | ✅ | B20 + review #9 + plan update 2026-10-25 |
| **D30** | Bảng cập nhật `totalCommittedInterest` theo từng luồng (5.7) — thao tác nội bộ trong SavingCore | ✅ | C26 |
| **D31** | **Chỉ `ownerOf(depositId)`** được gọi các luồng sở hữu; account được `approve`/operator ERC-721 **không có quyền** này (chỉ được `transferFrom`) | ✅ | review — quyết định riêng |
| **D32** | **CEI + `ReentrancyGuard`** trên mọi luồng ra/vào tiền; `status` cập nhật trước mọi transfer | ✅ | F/Q7 + review |

**Ánh xạ bổ sung**: A6 → Q1 (Mục 8) · A9 → D22–D24 · A4 → D8 · A7 → D12 · AR8=4 lần → `[AR8]` (Mục 4.5/10) · Mục 9–13 (E) là phần mới hoàn toàn · review vòng 1 → D5, D19, D23, D25, D29, D31, D32.
