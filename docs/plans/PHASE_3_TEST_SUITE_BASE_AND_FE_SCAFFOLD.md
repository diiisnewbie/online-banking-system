# PHASE 3 — TEST SUITE BASE & FRONTEND SCAFFOLD (Kế hoạch chi tiết v3)

> **Loại file:** KẾ HOẠCH CHI TIẾT (viết trước khi thi hành). Kết quả thực tế ghi vào `docs/progress/N3_test_suite_base.md` **sau** khi xong.
> **Nguồn sự thật:** `smartcontract/PROJECT_OVERVIEW.md` (bản v2.1) & đợt cập nhật đồng bộ "Overview Patch" cuối N3 (nâng lên v2.2).
> **Quy ước nhãn:**
> - `[Dn]` = Decision ID — xem **Mục 15** Overview.
> - `[Mn]`/`[ARn]`/`[In]`/`[Vn]` = Test ID — xem **Mục 10** Overview.
> - `[Qn]` = Câu hỏi vấn đáp — xem **Mục 8** Overview.
> - Ký hiệu ngày/phase: **N3** (Phase 3).
> **Workspace:** 
> - Smartcontract: `D:\AppsCyclone\banking-system\smartcontract\`
> - Frontend: `D:\AppsCyclone\banking-system\frontend\`

---

## 1. MỤC TIÊU VÀ EXIT GATES (TIÊU CHÍ HOÀN THÀNH)

### 1.1. Mục tiêu của Phase 3 (N3)
Theo lộ trình tổng thể tại Mục 13 của `PROJECT_OVERVIEW.md`, Phase 3 (N3) hoàn thành hai trụ cột cốt lõi:
1. **Trụ cột 1: Smart Contract — Bổ Sung View Functions & Kiểm Toán Truy Vết Test Base:**
   - Thêm hàm `getAllPlans()` trên `SavingCore.sol` để Frontend đọc trực tiếp danh sách gói tiết kiệm on-chain theo đúng quyết định `[D29]` (không hardcode, không đọc `variant.ts`).
   - Thêm view tiện ích `getCertificatesOfOwner(address account)` giúp Frontend truy vấn toàn bộ danh sách sổ của một ví trong 1 cuộc gọi (đổi tên tham số thành `account` để tránh shadow hàm `owner()` của `Ownable`, bảo đảm 0 warning).
   - Viết test suite chuyên biệt `test/Phase3.frontend_views.test.ts` (TC-VIEW-01 đến TC-VIEW-03) kiểm tra chuẩn xác `depositId != 0` trên cả 3 con đường sinh cert: `openDeposit` (#1, #2), `renewDeposit` (#3), `autoRenewDeposit` (#4), và bao phủ nhánh ví rỗng.
   - Chuẩn hóa tag `[Test-ID]` trong tên các `it()` ở test suite, chạy lệnh grep kiểm tra tự động để chứng minh bảng **Traceability Audit** bao phủ đầy đủ 30 Test-ID Base của N3 (+ M7 và I3).
   - Đo lường và duy trì: **Line Coverage $\ge 90\%$**, đồng thời ghi nhận Statement & Branch coverage làm mốc cho N4.
2. **Trụ cột 2: Frontend — Khởi Tạo Scaffold & Khung Giao Diện Sớm:**
   - Khởi tạo kiến trúc ứng dụng Web3 Frontend tại thư mục `frontend/` bằng React 18 + Vite v6 + TypeScript + TailwindCSS v3 + ethers v6 (được phê duyệt package theo `AGENTS.md`).
   - Bổ sung đầy đủ file khai báo kiểu `src/vite-env.d.ts` (chứa `/// <reference types="vite/client" />` và khai báo `window.ethereum`) để `tsc -b` đạt 0 lỗi type.
   - Viết script ESM tự động xuất ABI `smartcontract/scripts/export-abi.js` (dùng `import.meta.url` để resolve đường dẫn tuyệt đối, chạy trực tiếp bằng `node scripts/export-abi.js`, **không sửa `package.json`** của smartcontract).
   - Tối giản cấu hình: Chỉ cần 1 biến môi trường `VITE_SAVING_CORE_ADDRESS` trong `addresses.ts`. Các địa chỉ Vault và USDC được hook `useBankingContracts` tự động truy vấn từ getter immutable `core.vault()` và `core.usdc()`.
   - Hạ mức phát biểu: `PlansList` ở N3 chỉ cần build sạch và render component chuẩn; việc đọc dữ liệu thật từ blockchain end-to-end sẽ được kiểm chứng chính thức ở N4 sau khi deploy Ignition và seed 3 gói.
   - Xây dựng thuật toán đồng hồ Countdown mượt mà: tính toán offset thời gian `offset = latestBlockTimestamp - Date.now()/1000`, cho phép giao diện tự động tick từng giây và tự cập nhật lại offset sau mỗi block hoặc sau khi tua thời gian.
   - `DevTimeTravelModal`: Tua thời gian dev-only (`evm_increaseTime` + `evm_mine`) sử dụng **JsonRpcProvider riêng** (`http://127.0.0.1:8545`) để không bị MetaMask chặn.
3. **Đồng bộ hóa Nguồn sự thật "Overview Patch" (Nâng lên v2.2):**
   - Rà soát và cập nhật đồng bộ các điểm lệch trong `PROJECT_OVERVIEW.md` (M5, I1, D11, tên view function, scripts/, Tailwind/lucide, nâng version).

---

### 1.2. Exit Gates (5 điều kiện bắt buộc để hoàn thành Phase 3)

| # | Gate | Tiêu chuẩn đánh giá |
|---|---|---|
| **G1** | Clean Contract Build | `npm run build` trong `smartcontract/` sạch 100%, **0 warning, 0 error** (không bị warning shadowing). Các hàm view mới hoạt động chuẩn xác. |
| **G2** | Base Test Suite Pass 100% | `npm test` vượt qua toàn bộ test suite, không skip bài nào. Bảng Traceability Audit xác nhận 100% Test-ID Base đã có test tương ứng qua kiểm tra tự động grep. |
| **G3** | Line Coverage $\ge 90\%$ | Chạy `npm run test:coverage` từ `smartcontract/` xác nhận Line Coverage $\ge 90\%$ (baseline kết thúc Phase 2 ngày 2026-10-26 ghi nhận **93.64% Line Coverage**, **93.30% Statement Coverage**). Ghi nhận con số Branch Coverage làm mốc cho N4. |
| **G4** | Frontend Build & Dev Clean | Trong thư mục `frontend/`: `npm run build` biên dịch sạch 100%, sinh bundle trong `frontend/dist/`, 0 lỗi TypeScript/Vite; `npm run dev` khởi động server trơn tru. |
| **G5** | Progress Report N3 | Lập tài liệu `docs/progress/N3_test_suite_base.md` đủ 6 phần quy chuẩn sau khi hoàn thành kiểm tra. |

---

## 2. BẢNG TRACEABILITY AUDIT (ĐỐI CHIẾU 30 TEST-ID BASE N3 + M7 & I3)

> **Ghi chú đếm Test-ID:** Bảng gồm đúng **30 Test-ID thuộc phạm vi Base của N3** (theo Mục 10 Overview), kèm 2 Test-ID đặc biệt: **M7** (nhánh base revert) và **I3** (invariant tài sản đã verify ở Phase 2, sẽ formal hóa ở N4).

| Test ID | Nội dung yêu cầu trong Overview Mục 10 | Vị trí File & Tên Test Khẳng Định | Trạng thái |
|---|---|---|---|
| **V1** | Assert `variant.ts` đúng công thức MSSV (grace=3d, apr=225, penalty=500, tenor=90) | `test/Phase1.smoke.test.ts` — S1 [V1, D28, D29, Q7] | ✅ Đã pass |
| **P1** | Plan CRUD: `createPlan` hợp lệ & các biên lỗi (`apr=0`, `apr=10001`, `tenor`, `min>max`) | `test/Phase1.smoke.test.ts` — S7 [P1, P2, D5] | ✅ Đã pass |
| **P2** | Plan Update: `updatePlan(planId, newAprBps)` — chỉ APR, bắt lỗi biên | `test/Phase1.smoke.test.ts` — S7 [P1, P2, D5] | ✅ Đã pass |
| **P3** | Plan Toggling: `disablePlan` rồi `openDeposit` chặn; `enablePlan` mở lại | `test/Phase1.smoke.test.ts` — S6 [P3, Q6] | ✅ Đã pass |
| **M1** | openDeposit Happy Path 1,000 USDC: cert đúng, NFT về user, event 6 args | `test/Phase1.smoke.test.ts` — S3 [M1, D32] | ✅ Đã pass |
| **M2** | openDeposit Validations: planId sai, plan disabled, amount=0, <min, >max | `test/Phase1.smoke.test.ts` — S4 [M2, D5, D7] | ✅ Đã pass |
| **M3** | withdrawAtMaturity: Rút đúng hạn 1,000 USDC, lãi đúng 5,547,945 units | `test/Phase2.core_flows.test.ts` — TC-01 [M3, D11] | ✅ Đã pass |
| **M4** | withdrawAtMaturity: Biên thời gian đúng giây, trước 1s revert, sau grace rút được | `test/Phase2.core_flows.test.ts` — TC-02 [M4, Q5] | ✅ Đã pass |
| **M5** | earlyWithdraw: Rút sớm chịu phạt 50 USDC về feeReceiver; sau đáo hạn revert | `test/Phase2.core_flows.test.ts` — TC-03, TC-04 [M5, Q5] | ✅ Đã pass |
| **M6** | renewDeposit: Manual renew hợp lệ, forward-dated, nhập lãi vào gốc | `test/Phase2.core_flows.test.ts` — TC-07 [M6, D12, D14] | ✅ Đã pass |
| **M7** | Base revert khi Vault thiếu thanh khoản lúc rút đúng hạn (chuyển đổi thành C1 ở N4) | `test/Phase2.core_flows.test.ts` — TC-06 [M7, Q2, D27] | ✅ Đã pass (Base branch) |
| **M9** | Renew / Auto-renew khi Vault thiếu thanh khoản revert `InsufficientVaultLiquidity` | `test/Phase2.core_flows.test.ts` — TC-15 [M9, D24] | ✅ Đã pass |
| **M10** | Emergency Pause: Vault pause chặn mọi luồng user; `fundVault` cứu hộ vẫn chạy | `test/Phase1.smoke.test.ts` — S8 [M10, D1, D2] & `Phase2` — TC-23 [M10, M21] | ✅ Đã pass |
| **M11** | Access Control: Ví lạ gọi rút/renew; `payoutInterest` gọi ngoài; `setSavingCore` lần 2 | `test/Phase1.smoke.test.ts` — S2, S9 [M11] & `Phase2` — TC-17 [M11, M15] | ✅ Đã pass |
| **M12** | Rounding Math: Principal lẻ `1_000_001n` (lãi 5547), case lãi = 0 (180 vs 181) | `test/Phase2.core_flows.test.ts` — TC-21 [M12] | ✅ Đã pass |
| **M15** | NFT Transfer: Alice chuyển NFT sang Bob; Bob rút được, Alice mất quyền | `test/Phase1.smoke.test.ts` — S12 [M15] & `Phase2` — TC-17 [M11, M15] | ✅ Đã pass |
| **M16** | Reentrancy Guard: Tấn công tái nhập qua `openDeposit` và `_safeMint` trong `renewDeposit` | `test/Phase1.smoke.test.ts` — S10 [M16] & `Phase2` — TC-19 [M16] | ✅ Đã pass |
| **M17** | Double-Withdrawal Guard: Ma trận 4 hàm x 3 trạng thái inactive revert `DepositNotActive` | `test/Phase2.core_flows.test.ts` — TC-16 [M17, AR7] | ✅ Đã pass |
| **M18** | Manual Renew Errors: Renew vào gói disabled; renew vượt `maxDeposit` | `test/Phase2.core_flows.test.ts` — TC-08 [M18, D14] | ✅ Đã pass |
| **M19** | earlyWithdraw với `penaltyBps = 0`: Nhận 100% gốc, không chuyển phí | `test/Phase2.core_flows.test.ts` — TC-05 [M19] | ✅ Đã pass |
| **M20** | feeReceiver Management: `setFeeReceiver(0)` revert; đổi ví nhận phạt thành công | `test/Phase1.smoke.test.ts` — S9 [M20] & `Phase2` — TC-22 [M20] | ✅ Đã pass |
| **M21** | Unpause: Hệ thống hoạt động bình thường trở lại sau khi unpause | `test/Phase2.core_flows.test.ts` — TC-23 [M10, M21] | ✅ Đã pass |
| **I1** | Snapshot APR Invariant (15 điểm): Admin hạ APR, rút đúng hạn và renew dùng APR cũ | `test/Phase2.core_flows.test.ts` — TC-20 [I1] | ✅ Đã pass |
| **I3** | Invariant cân bằng tài sản: `usdc.balanceOf(SavingCore) == sum(Active principal)` | `test/Phase2.core_flows.test.ts` — TC-24 [I3] | ✅ Đã pass (Bonus N2, formal hóa N4) |
| **AR1** | autoRenewDeposit hợp lệ: Qua grace, vault đủ, backdate, khóa APR cũ, `_mint` | `test/Phase2.core_flows.test.ts` — TC-10 [AR1, B3, D21] | ✅ Đã pass |
| **AR2** | autoRenewDeposit trước grace period revert `NotMatured` | `test/Phase2.core_flows.test.ts` — TC-11 [AR2] | ✅ Đã pass |
| **AR3** | autoRenewDeposit bỏ qua kiểm tra gói bị disable | `test/Phase2.core_flows.test.ts` — TC-12 [AR3, AR4] | ✅ Đã pass |
| **AR4** | autoRenewDeposit bỏ qua kiểm tra hạn mức `maxDeposit` | `test/Phase2.core_flows.test.ts` — TC-12 [AR3, AR4] | ✅ Đã pass |
| **AR5** | autoRenewDeposit Permissionless: Ví stranger gọi thành công | `test/Phase2.core_flows.test.ts` — TC-10 [AR1, AR5] | ✅ Đã pass |
| **AR6** | autoRenewDeposit an toàn: Chủ NFT là contract không có receiver (`MockUSDC`) | `test/Phase2.core_flows.test.ts` — TC-13 [AR6] | ✅ Đã pass |
| **AR7** | autoRenewDeposit cert không còn Active revert `DepositNotActive` | `test/Phase2.core_flows.test.ts` — TC-16 [M17, AR7] | ✅ Đã pass |
| **AR8** | Chuỗi Backdate liên tiếp khi bot trễ 100 ngày: Đúng 4 lần gọi, lần 5 revert | `test/Phase2.core_flows.test.ts` — TC-14 [AR8] | ✅ Đã pass |

---

## 3. DANH MỤC FILE & CẤU TRÚC DỰ ÁN

### 3.1. Phía Smart Contract (`smartcontract/`)
- **[MODIFY] `contracts/SavingCore.sol`:** Bổ sung hàm `getAllPlans()` và `getCertificatesOfOwner(address account)`.
- **[NEW] `scripts/export-abi.js`:** Script ESM trích xuất ABI tự động sang Frontend.
- **[NEW] `test/Phase3.frontend_views.test.ts`:** Bộ 3 test kiểm tra các hàm view mới.
- **[MODIFY] Chuẩn hóa tag Test-ID:** Đảm bảo các `it()` trong `Phase1.smoke.test.ts` và `Phase2.core_flows.test.ts` có đủ tag `[Test-ID]` phục vụ audit grep.

### 3.2. Cấu Trúc Thư Mục Frontend (`frontend/`)
```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── vite-env.d.ts         // Khai báo /// <reference types="vite/client" /> và window.ethereum
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── contracts/
│   │   ├── abis/
│   │   │   ├── MockUSDC.json
│   │   │   ├── VaultManager.json
│   │   │   └── SavingCore.json
│   │   ├── addresses.ts      // Chỉ cần VITE_SAVING_CORE_ADDRESS (Vault & USDC lấy qua getter core)
│   │   └── types.ts          // Type definition cho Plan, Certificate, Enum
│   ├── hooks/
│   │   ├── useWeb3.ts        // Kết nối ví MetaMask, chuyển mạng chainId 31337, quản lý EVM clock offset
│   │   ├── useBankingContracts.ts // Khởi tạo contract instances (SavingCore, Vault, USDC)
│   │   └── usePlans.ts       // Hook đọc danh sách gói on-chain (sẵn sàng cho N4)
│   ├── utils/
│   │   ├── formatters.ts     // Format USDC 6 decimals, ngày tháng, countdown dựa trên EVM time offset
│   │   └── interest.ts       // Replica công thức tính lãi _calcInterest bằng BigInt
│   └── components/
│       ├── Navbar.tsx        // Thanh điều hướng + nút Connect Wallet / Network indicator
│       ├── PlansList.tsx     // Component hiển thị danh sách gói on-chain (getAllPlans)
│       ├── Faucet.tsx        // Nút mint 1,000 USDC test nhanh
│       └── DevTimeTravelModal.tsx // Modal tua thời gian dev-only (EVM RPC qua JsonRpcProvider riêng)
```

---

## 4. CHI TIẾT THIẾT KẾ KỸ THUẬT

### 4.1. Bổ Sung View Functions vào `SavingCore.sol`

```solidity
/// @notice Tra ve toan bo danh sach cac goi tiet kiem de Frontend doc on-chain [D29]
/// @dev Trade-off: Khong phan trang, phu hop quy mo demo/do an. Production nen dung indexer hoac phan trang.
function getAllPlans() external view returns (SavingPlan[] memory allPlans) {
    allPlans = new SavingPlan[](planCount);
    for (uint256 i = 0; i < planCount; i++) {
        allPlans[i] = plans[i];
    }
}

/// @notice Tra ve toan bo cac chung chi thuoc so huu cua mot dia chi vi
/// @dev Doi ten tham so thanh account de tranh shadow ham owner() cua Ownable.
/// Tra ve ca cert da Withdrawn/Renewed (D8 khong burn NFT); Frontend se loc theo cert.status == Active.
function getCertificatesOfOwner(address account) external view returns (DepositCertificate[] memory certs) {
    uint256 count = balanceOf(account);
    certs = new DepositCertificate[](count);
    for (uint256 i = 0; i < count; i++) {
        uint256 depositId = tokenOfOwnerByIndex(account, i);
        certs[i] = certificates[depositId];
    }
}
```

---

### 4.2. Script Tự Động Xuất ABI (`smartcontract/scripts/export-abi.js`)

- **Định dạng:** Pure ESM (`import fs from "fs"`), dùng `import.meta.url` để định vị đường dẫn tuyệt đối độc lập với thư mục chạy lệnh.
- **Ràng buộc:** Chạy trực tiếp `node scripts/export-abi.js`. Tuyệt đối **không sửa `package.json`** của `smartcontract/`.
- **Thứ tự thực thi:**
  1. Chạy `npm run build` trong `smartcontract/` để sinh thư mục `artifacts/`.
  2. Chạy `node scripts/export-abi.js` $\rightarrow$ Script tự động `fs.mkdirSync('.../frontend/src/contracts/abis', { recursive: true })` và trích xuất mảng `abi` sạch sang Frontend.
- **Lời nhắc vận hành:** Bắt buộc chạy lại script này ở cuối Phase 4 (khi bổ sung C1/C2) và Phase 5.

---

### 4.3. Danh Mục Package Frontend Xin Phê Duyệt (`AGENTS.md`)

```json
{
  "name": "banking-system-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "ethers": "^6.13.5",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.3",
    "vite": "^6.0.3"
  }
}
```

> **Lý do ghim Tailwind v3 (`^3.4.17`):** Tailwind CSS v4 đổi cách cấu hình (chuyển sang cấu hình theo CSS directives @theme). Việc ghim v3 giúp giữ PostCSS và `tailwind.config.js` truyền thống ổn định, tương thích với tài liệu dự án.
> **Quy trình:** Chạy `npm view <pkg> version` để xác nhận phiên bản khả dụng trước khi cài đặt.

---

### 4.4. Quy Tắc Đồng Hồ Countdown Không Bị Đóng Băng
- **Vấn đề:** Nếu chỉ đọc `block.timestamp`, đồng hồ UI sẽ đứng yên giữa các giao dịch khi không có block mới được sinh ra. Nếu dùng `Date.now()`, đồng hồ sẽ lệch khi dev tua nhanh thời gian bằng `evm_increaseTime`.
- **Giải pháp chuẩn:** Tính độ lệch offset:
  ```ts
  // Khi connect hoac sau moi block/event/tua gio:
  const block = await provider.getBlock("latest");
  const blockTimestamp = block ? block.timestamp : Math.floor(Date.now() / 1000);
  const timeOffset = blockTimestamp - Math.floor(Date.now() / 1000);

  // Dong ho tren UI tu nhay moi giay bang:
  const currentSimulatedTime = Math.floor(Date.now() / 1000) + timeOffset;
  ```
  Mọi phép tính countdown đáo hạn (`maturityAt - currentSimulatedTime`) đều bảo đảm vừa nhảy từng giây mượt mà, vừa bám sát chính xác thời gian EVM.

---

### 4.5. DevTimeTravelModal (Bảo Vệ & Provider Riêng)
- **Điều kiện hiển thị:** `import.meta.env.DEV && chainId === 31337`.
- **Tránh bẫy MetaMask:** MetaMask `BrowserProvider` thường từ chối/báo lỗi khi trang web gọi các lệnh máy đào (`evm_increaseTime`, `evm_mine`).
- **Giải pháp:** Sử dụng trực tiếp JsonRpcProvider riêng:
  ```ts
  const rpcUrl = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
  const devProvider = new ethers.JsonRpcProvider(rpcUrl);
  await devProvider.send("evm_increaseTime", [seconds]);
  await devProvider.send("evm_mine", []);
  ```

---

## 5. MA TRẬN TEST KIỂM THỬ SMART CONTRACT PHASE 3 (`test/Phase3.frontend_views.test.ts`)

Bổ sung **3 kịch bản kiểm thử tự động**:

| Test ID | Tên kịch bản | Mô tả chi tiết & Kỳ vọng |
|---|---|---|
| **TC-VIEW-01** | `getAllPlans` khớp tham số seed chuẩn Overview Mục 11.1 | Hệ thống khởi tạo có Plan 0 mặc định (90d / 225bps / min 10 USDC / max 100k USDC / phạt 500). Tạo thêm Plan 1 (30d / 300bps / min 10 USDC / max 50k USDC / phạt 500) và Plan 2 (90d / 225bps / min 0 / max 0 / phạt 500). Gọi `getAllPlans()`, kiểm tra mảng trả về có đúng 3 phần tử, các trường `planId`, `tenorDays`, `aprBps`, `minDeposit`, `maxDeposit`, `earlyWithdrawPenaltyBps`, `enabled` khớp chính xác 100%. |
| **TC-VIEW-02** | `getCertificatesOfOwner` & assert `depositId != 0` trên cả 4 sổ | Alice mở Cert #1 và Cert #2 qua `openDeposit`. Đến hạn, Alice gọi `renewDeposit(1, 0)` tạo Cert #3. Qua grace, stranger gọi `autoRenewDeposit(2)` tạo Cert #4 (thuộc về Alice). Gọi `getCertificatesOfOwner(Alice)`: **trả về đủ 4 cert (#1 ManualRenewed, #2 AutoRenewed, #3 Active, #4 Active)**, assert `cert.depositId == expectedId && cert.depositId != 0` trên toàn bộ 4 cert. Alice chuyển Cert #4 sang Bob qua `transferFrom`: mảng Alice giảm về 3 cert (#1, #2, #3), mảng Bob tăng lên 1 cert (#4). |
| **TC-VIEW-03** | `getCertificatesOfOwner` cho ví chưa có sổ | Gọi `getCertificatesOfOwner(stranger)` cho một địa chỉ ví mới tinh chưa từng mở sổ. Kiểm tra kết quả trả về mảng rỗng `[]` (độ dài 0), không bị revert (bao phủ nhánh `count == 0`). |

---

## 6. DANH MỤC "OVERVIEW PATCH" (ĐỒNG BỘ NGUỒN SỰ THẬT LÊN v2.2)

Cuối Phase 3, sẽ thực hiện cập nhật đồng bộ các điểm lệch trong `smartcontract/PROJECT_OVERVIEW.md`:
1. **Nâng version:** Cập nhật phiên bản từ `v2.1` lên `v2.2`.
2. **Mục 9 (Cấu trúc thư mục):** Bổ sung thư mục `scripts/` chứa `export-abi.js`.
3. **Mục 11.2 (Frontend Spec):** Bổ sung ghi nhận `TailwindCSS` và `lucide-react` vào danh mục công nghệ Frontend.
4. **Mục 9 & D29 (Quy tắc variant.ts):** Xóa bỏ yêu cầu cấu hình "Vite alias cho variant.ts", khẳng định Frontend độc lập và đọc 100% on-chain qua `getAllPlans()` và `gracePeriod()`.
5. **M5:** Sửa mô tả: Rút lần 2 trên cert đã rút sớm trả về `DepositNotActive` (thay vì ghi nhầm `AlreadyMatured`).
6. **I1:** Sửa mô tả: Bỏ cụm từ "(và phạt)" vì hàm `updatePlan` theo đề bài chỉ cập nhật APR (`newAprBps`).
7. **D11:** Đồng bộ chữ ký hàm nội bộ `_calcInterest(principal, aprBps, tenorSeconds)` theo đúng Phase 1 & 2.
8. **Mục 14.3:** Cập nhật tên hàm view thành `getCertificatesOfOwner(address account)` và `getAllPlans()`.
9. **Mục 14.4:** Bổ sung cột "Test thực tế" tham chiếu chính xác các bài test từ bảng Traceability Audit.

---

## 7. KẾ HOẠCH THỰC THI TỪNG BƯỚC (STEP-BY-STEP)

1. **Bước 1 — Phê duyệt Kế hoạch & Danh mục Package:** Người dùng xem xét, phê duyệt bản kế hoạch chi tiết v3 và danh mục package frontend (theo `AGENTS.md`).
2. **Bước 2 — Phê duyệt Dự thảo Progress:** Soạn thảo `docs/progress/N3_test_suite_base.md` để Người dùng duyệt checklist công việc.
3. **Bước 3 — Cập nhật Smart Contract & Export ABI:**
   - Thêm `getAllPlans` và `getCertificatesOfOwner(address account)` vào `contracts/SavingCore.sol`.
   - Chuẩn hóa các tag `[Test-ID]` trong `Phase1.smoke.test.ts` và `Phase2.core_flows.test.ts`.
   - Chạy `npm run build` trong `smartcontract/` sinh artifacts.
   - Chạy `node scripts/export-abi.js` trích xuất ABI tự động sang `frontend/src/contracts/abis/`.
4. **Bước 4 — Viết Test Suite View & Chạy Coverage:**
   - Viết file test `test/Phase3.frontend_views.test.ts` (TC-VIEW-01 đến TC-VIEW-03).
   - Chạy `npm test` xác nhận toàn bộ test suite pass 100%, không skip.
   - Chạy `npm run test:coverage` xác nhận Line Coverage $\ge 90\%$, ghi nhận số liệu Statement và Branch.
   - Chạy lệnh grep tự động xác minh 100% Test-ID trong bảng Traceability Audit.
5. **Bước 5 — Khởi tạo Scaffold Frontend & Cài đặt Dependencies:**
   - Kiểm tra phiên bản bằng `npm view`, tạo cấu trúc thư mục trong `frontend/`.
   - Tạo file `frontend/src/vite-env.d.ts` khai báo `vite/client` và `window.ethereum`.
   - Cài đặt package theo danh mục đã phê duyệt.
   - Cấu hình `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`.
6. **Bước 6 — Xây dựng Khung UI & Tích hợp Web3 Sớm:**
   - Viết `src/hooks/useWeb3.ts` (kèm thuật toán time offset), `src/hooks/useBankingContracts.ts` (chỉ đọc `VITE_SAVING_CORE_ADDRESS`), `src/utils/interest.ts`, `src/utils/formatters.ts`.
   - Dựng các component: `Navbar`, `PlansList`, `Faucet`, `DevTimeTravelModal`.
   - Ghép nối vào `App.tsx`.
7. **Bước 7 — Build Verify Frontend:**
   - Chạy `npm run build` trong `frontend/` đảm bảo TypeScript và Vite build sạch 100% không warning/error.
8. **Bước 8 — Cập nhật "Overview Patch" & Báo Cáo Nghiệm Thu N3:**
   - Cập nhật các điểm đồng bộ trong `PROJECT_OVERVIEW.md` lên v2.2.
   - Ghi đầy đủ bằng chứng verify, log chạy, bảng audit vào `docs/progress/N3_test_suite_base.md`.
