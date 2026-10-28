# PHASE 5 — FULL FRONTEND, DOCUMENTATION & VIDEO DEMO (Kế hoạch chi tiết v3 — Technical Reviewer Edition)

> **Loại file:** KẾ HOẠCH CHI TIẾT (viết trước khi thi hành). Kết quả thực tế sẽ ghi nhận vào `docs/progress/N5_frontend_docs.md`.
> **Nguồn sự thật:** Đề thi gốc (`Final_Assignment`), `smartcontract/PROJECT_OVERVIEW.md` (bản v2.3), Mục 7–15 & Mã nguồn hợp đồng thực tế.
> **Quy ước nhãn:**
> - `[Dn]` = Decision ID (Mục 15 Overview; D1–D34).
> - `[Qn]` = Oral Defense Question (Mục 8 Overview; Q1–Q7).
> - `[Mn]`/`[ARn]`/`[In]` = Test ID (Mục 10 Overview).
> - Ký hiệu phase: **N5** (Phase 5 — Hoàn thiện Frontend, Tài liệu & Demo).
> **Workspace:**
> - Frontend: `D:\AppsCyclone\banking-system\frontend\`
> - Smartcontract: `D:\AppsCyclone\banking-system\smartcontract\`
> - Root: `D:\AppsCyclone\banking-system\`

---

## 1. MỤC TIÊU VÀ PHẠM VI DỰ ÁN

### 1.1. Mục tiêu cốt lõi
Phase 5 là giai đoạn tích hợp toàn diện nhằm chuyển giao sản phẩm hoàn chỉnh cho kỳ bảo vệ đồ án, tập trung vào 5 trụ cột được chấm điểm trực tiếp theo Rubric (Mục 9 của Đề):
1. **Frontend Web3 Đầy Đủ (10 điểm Rubric)**: Hoàn thiện lát cắt dọc giao diện người dùng tương tác trực tiếp với Smart Contract qua `ethers v6`. Đọc 100% dữ liệu on-chain, giải mã Custom Error thân thiện, hỗ trợ đầy đủ 5 luồng nghiệp vụ cơ bản + luồng nhận nợ lãi C1.
2. **Vấn đáp & Thấu hiểu thiết kế (10 điểm Rubric)**: Soạn thảo mục "Design Answers" (Q1–Q7) trong `README.md` với dẫn chứng chính xác `file:dòng` và test case chứng minh, sẵn sàng phản xạ các câu hỏi đổi số từ giảng viên.
3. **Thách thức sáng tạo (Creative Challenges C1 & C2 — Tối đa +10 điểm bù khuyết)**: Bản ghi chú kỹ thuật phân tích Problem / Solution / Trade-offs cho cơ chế Hoãn trả lãi C1 và Solvency Guard C2.
4. **Chất lượng mã nguồn, Tài liệu & NatSpec (5 điểm Rubric)**: Tài liệu `README.md` chuẩn mực, trung thực, có cảnh báo an toàn và hướng dẫn khởi chạy đa terminal.
5. **Kiểm thử & Độ bao phủ (15 điểm Rubric)**: Duy trì Line Coverage $\ge 90\%$ (hiện trạng đã đạt **94.53%** với 65/65 tests passing), bổ sung 6 test case biên nếu còn thời gian để nâng cao độ an toàn.

### 1.2. Phạm vi công việc (Scope Boundaries)
- **Trong phạm vi (In-Scope)**:
  - Tích hợp Web3 Frontend: Mở sổ (Approve + Open), Danh sách sổ (Active vs Closed), Rút đúng hạn, Rút trước hạn, Tái tục thủ công, Tái tục tự động, Nhận nợ lãi C1.
  - Bảng Quản trị Admin tối giản: Quản lý nạp/rút quỹ Vault, hiển thị Solvency Guard C2, Pause/Unpause hệ thống, phân định quyền sở hữu riêng biệt giữa `SavingCore` và `VaultManager`.
  - Bộ giải mã Custom Error trên Frontend (`core.interface.parseError` & `vault.interface.parseError`).
  - Dev Time-Travel modal trên mạng local development (chainId 31337).
  - Soạn thảo `README.md` hoàn chỉnh theo chuẩn Mục 7.4 & 8 của Đề thi.
  - Kịch bản và video demo 3–5 phút (4 phân cảnh).
  - Bổ sung 6 test case biên (nếu thời gian cho phép).
- **Ngoài phạm vi (Out-of-Scope)**:
  - Không xây dựng UI tạo gói (`createPlan`) hoặc cập nhật gói (`updatePlan`) trên Frontend (các gói đã được seed sẵn qua Hardhat Ignition).
  - Không xây dựng hệ thống Indexer ngoài (The Graph/Subsquid) cho Activity Log — chỉ sử dụng RPC event query cơ bản của ethers.
  - Không triển khai lên mạng Mainnet hoặc Testnet công khai (chỉ chạy local `hardhat node`).

---

## 2. PREREQUISITES & TRẠNG THÁI XÁC MINH CODEBASE

Dưới đây là bảng đối chiếu giữa tài liệu và mã nguồn thực tế tại thời điểm lập Plan:

| Thành phần | Trạng thái Codebase | Chi tiết xác minh từ mã nguồn |
|---|:---:|---|
| **Contract `MockUSDC.sol`** | ✅ Đã xác minh | `decimals() pure returns (6)`, `mint(to, amount)` faucet mở ([MockUSDC.sol:9-15](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/MockUSDC.sol#L9-L15)). |
| **Contract `VaultManager.sol`** | ✅ Đã xác minh | `feeReceiver` ([L33](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L33)), `savingCore` ([L32](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L32)), `owner()` (Ownable), `paused()` (Pausable), `fundVault` ([L58](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L58)), `withdrawVault` ([L63](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L63)), `payoutInterest` ([L77](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L77)), `setSavingCore` ([L45](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L45)). |
| **Contract `SavingCore.sol`** | ✅ Đã xác minh | `getAllPlans()` ([L405](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L405)), `getPlan(id)` ([L393](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L393)), `getCertificate(id)` ([L398](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L398)), `getCertificatesOfOwner(account)` ([L415](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L415)), `unpaidInterest(id)` ([L106](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L106)), `totalCommittedInterest()` ([L105](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L105)), `gracePeriod()` ([L101](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L101)), `owner()` (Ownable). |
| **5 Luồng Core User** | ✅ Đã xác minh | `openDeposit` ([L190](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L190)), `withdrawAtMaturity` ([L221](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L221)), `earlyWithdraw` ([L252](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L252)), `renewDeposit` ([L279](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L279)), `autoRenewDeposit` ([L322](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L322)). |
| **Luồng C1 Deferred** | ✅ Đã xác minh | `claimPendingInterest(depositId)` ([L369](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L369)), emit `InterestDeferred` ([L248](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L248)), `InterestClaimed` ([L384](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L384)). |
| **Solvency Guard C2** | ✅ Đã xác minh | `withdrawVault` kiểm tra `amount <= balance`, sau đó `balance - amount >= totalCommittedInterest` ([VaultManager.sol:64-71](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L64-L71)). |
| **Hardhat Ignition Module** | ✅ Đã xác minh | `ignition/modules/BankingSystem.ts` seed sẵn Plan 0, Plan 1, Plan 2; nạp 10k USDC Vault, wire `setSavingCore`. |
| **Frontend Scaffold** | ✅ Đã xác minh | React 18, Vite 6, TailwindCSS 4, ethers v6. `npm run build` đạt 0 error, 0 warning. Đã có `useWeb3`, `useBankingContracts`, `PlansList`, `Faucet`, `DevTimeTravelModal`. |

---

## 3. DANH SÁCH NHIỆM VỤ CHI TIẾT (ORDERED TASK BREAKDOWN)

### ƯU TIÊN 0: Điều kiện nền — Đồng bộ ABI & Khởi tạo Môi trường (Ước tính: 30 phút)
*Mục tiêu: Đảm bảo Frontend sở hữu các định nghĩa ABI mới nhất và kết nối chuẩn xác với smart contract trên local chain.*

- [ ] **Task 0.1: Build & Tái xuất bản ABI (Re-export ABI)**
  - **Module liên quan**: `smartcontract/scripts/export-abi.js`, `frontend/src/contracts/abis/`.
  - **Các bước thực hiện**:
    1. Chạy `npm run build` trong thư mục `smartcontract/` để cập nhật artifacts.
    2. Chạy `node scripts/export-abi.js`.
    3. Kiểm tra `git diff` đối với các file ABI: `SavingCore.json`, `VaultManager.json`, `MockUSDC.json`.
  - **Tiêu chí nghiệm thu (Acceptance Criteria)**:
    - `SavingCore.json` chứa các hàm: `unpaidInterest`, `claimPendingInterest`, `totalCommittedInterest`, `getAllPlans`, `getCertificatesOfOwner`.
    - `SavingCore.json` chứa các Custom Error: `NoPendingInterest`, `ClaimNotCovered`, `InsufficientVaultLiquidity`, `NotMatured`, `AlreadyMatured`.
    - `VaultManager.json` chứa Custom Error: `InsufficientCommitted`, `AmountExceedsBalance`.

- [ ] **Task 0.2: Khởi động Local Chain & Cập nhật `.env`**
  - **Module liên quan**: `frontend/.env`, `smartcontract/ignition/modules/BankingSystem.ts`.
  - **Các bước thực hiện**:
    1. Khởi động terminal 1: `npm run node` tại `smartcontract/`.
    2. Khởi động terminal 2: `npm run deploy:local` tại `smartcontract/`.
    3. Đọc địa chỉ deployed của `SavingCore` từ log output của Ignition.
    4. Cập nhật `VITE_SAVING_CORE_ADDRESS` trong `frontend/.env`.
  - **Tiêu chí nghiệm thu**:
    - Chạy `npm run dev` trong `frontend/`. Mở trình duyệt, component `PlansList` tải và hiển thị đúng 3 gói (Plan 0: 90d/225bps, Plan 1: 30d/300bps, Plan 2: 90d/225bps/min=0). Không xuất hiện cảnh báo console về decode ABI.

---

### ƯU TIÊN 1: Lát cắt dọc Frontend Nghiệp vụ & Xử lý Giao dịch (Ước tính: 3.5 giờ)
*Mục tiêu: Cung cấp giao diện trực quan cho 5 luồng cốt lõi + C1, phân định rõ Pre-checks ở Frontend và Enforced Constraints ở Smart Contract.*

- [ ] **Task 1.1: Bộ giải mã Custom Error Web3 (`frontend/src/utils/errors.ts`)**
  - **Module liên quan**: Tạo mới file `frontend/src/utils/errors.ts`.
  - **Thiết kế kỹ thuật**:
    - Smart contract revert sẽ trả về dữ liệu mã hóa qua thuộc tính `err.data` hoặc `err.error.data`.
    - Hàm `parseContractError(err: any, contracts: { core?: Contract, vault?: Contract }): string` thực hiện phân cấp 5 mức độ:
      1. *Lỗi tiền kiểm duyệt Frontend*: Hiển thị thông báo ngay trước khi gọi signer.
      2. *Người dùng hủy ký*: Bắt error code `ACTION_REJECTED` / EIP-1193 code `4001` $\implies$ "Giao dịch đã bị hủy bởi người dùng."
      3. *Giao dịch revert on-chain*: Dùng `contracts.core.interface.parseError(data)` hoặc `contracts.vault.interface.parseError(data)`.
      4. *Lỗi mạng / RPC*: Timeout, mất kết nối local node $\implies$ "Mất kết nối tới RPC node (127.0.0.1:8545)."
      5. *Lỗi không xác định*: Thông báo dự phòng kèm chuỗi lỗi gốc tóm tắt, tuyệt đối không hiển thị thành công giả.
  - **Bảng ánh xạ Custom Error sang tiếng Việt**:
    - `NotMatured()` $\rightarrow$ "Khoản tiền gửi chưa đến ngày đáo hạn (hoặc chưa qua thời gian ân hạn)."
    - `AlreadyMatured()` $\rightarrow$ "Khoản tiền gửi đã đáo hạn, không thể rút trước hạn. Vui lòng chọn Rút đúng hạn."
    - `DepositNotActive()` $\rightarrow$ "Chứng chỉ này đã được tất toán hoặc đã tái tục trước đó."
    - `NotDepositOwner()` $\rightarrow$ "Ví kết nối hiện tại không phải chủ sở hữu chứng chỉ NFT này."
    - `DepositNotFound(uint256)` $\rightarrow$ "Không tìm thấy chứng chỉ tiền gửi trên hệ thống."
    - `PlanDisabled()` $\rightarrow$ "Gói tiết kiệm này đã bị tạm dừng tiếp nhận khoản gửi mới."
    - `InvalidDepositAmount()` $\rightarrow$ "Số tiền gửi không thỏa hạn mức tối thiểu/tối đa của gói."
    - `InsufficientVaultLiquidity()` $\rightarrow$ "Quỹ thanh khoản của ngân hàng không đủ để thực hiện tái tục."
    - `ClaimNotCovered()` $\rightarrow$ "Số dư quỹ Vault chưa đủ để thanh toán trọn vẹn khoản nợ lãi này (All-or-Nothing)."
    - `NoPendingInterest()` $\rightarrow$ "Chứng chỉ này không có khoản nợ lãi nào đang chờ thanh toán."
    - `SystemPaused()` $\rightarrow$ "Hệ thống đang trong trạng thái tạm dừng khẩn cấp."
    - `InsufficientCommitted()` $\rightarrow$ "Số tiền rút vượt quá hạn mức thanh khoản an toàn (Solvency Guard C2)."
    - `AmountExceedsBalance()` $\rightarrow$ "Số tiền yêu cầu rút vượt quá số dư thực tế của Vault."
  - **Tiêu chí nghiệm thu**: Gọi thử các hành vi lỗi (ví dụ: rút sớm khi đã quá hạn) $\implies$ UI hiển thị banner đỏ với đúng câu tiếng Việt thân thiện, không hiển thị raw json RPC.

- [ ] **Task 1.2: Form Mở Sổ Tiết Kiệm & Quy Trình Approve 2 Bước (`frontend/src/components/OpenDepositModal.tsx`)**
  - **Module liên quan**: Tạo mới `frontend/src/components/OpenDepositModal.tsx`.
  - **Thiết kế kỹ thuật & Phân tách trách nhiệm**:
    - *Frontend Pre-checks*: Đọc thông số gói on-chain: `tenorDays`, `aprBps`, `minDeposit`, `maxDeposit`. Xử lý hạn mức theo quy ước đề: `0 = không giới hạn` $\implies$ `if (plan.minDeposit > 0n && amount < plan.minDeposit)` và `if (plan.maxDeposit > 0n && amount > plan.maxDeposit)`.
    - *Quy trình Approve 2 bước*: Đọc `usdc.allowance(account, savingCoreAddress)`. Nếu `allowance < amount` $\implies$ Hiển thị nút "Approve USDC". Khi approve thành công $\implies$ Chuyển thành nút "Xác Nhận Mở Sổ" (`core.openDeposit(planId, amount)`).
    - *Smart Contract Enforced Constraints*: Hợp đồng [SavingCore.sol:191-196](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L191-L196) kiểm tra lại toàn bộ điều kiện. Nếu user cố tình bypass frontend, giao dịch sẽ revert với `InvalidDepositAmount` hoặc `PlanDisabled`.
    - *Xử lý trạng thái*: Hiển thị spinner khi tx đang chờ khai thác (`tx.wait()`), tự động đóng modal và làm mới danh sách sổ khi tx thành công.
  - **Tiêu chí nghiệm thu**: Mở sổ thành công 1,000 USDC cho Plan 0 bằng Account #1. Số dư USDC giảm 1,000, số lượng chứng chỉ tăng 1.

- [ ] **Task 1.3: Danh Sách Sổ & 4 Action Modals (`frontend/src/components/CertificatesList.tsx`, `CertificateCard.tsx`)**
  - **Module liên quan**: `frontend/src/hooks/useCertificates.ts`, `frontend/src/components/CertificateCard.tsx`.
  - **Thiết kế kỹ thuật & Phân tách trách nhiệm**:
    - *Phân loại hiển thị*: Chia thành 2 tabs rõ ràng: **"Sổ Đang Hoạt Động"** (`status == DepositStatus.Active`) và **"Lịch Sử Tất Toán"** (`status != DepositStatus.Active`). Tại tab lịch sử, gắn nhãn badge xám/đỏ: `ĐÃ TẤT TOÁN / ĐÃ TÁI TỤC — KHÔNG CÒN GIÁ TRỊ TÀI CHÍNH` nhằm giải quyết rủi ro lừa đảo thứ cấp `[Q1]`.
    - *Dữ liệu snapshot*: Đọc và hiển thị `aprBpsAtOpen` và `penaltyBpsAtOpen` trực tiếp từ certificate on-chain, không tính theo plan hiện tại `[D29]`.
    - *Đếm ngược thời gian*: Sử dụng `currentSimulatedTime` (từ hook `useWeb3`, đồng bộ theo EVM timestamp + offset) so sánh với `cert.maturityAt`. Không sử dụng `Date.now()` của máy tính `[Q5]`.
    - **Nút Hành Động 1: Rút đúng hạn (`withdrawAtMaturity`)**:
      - *Frontend Pre-check*: Sáng lên khi `currentSimulatedTime >= cert.maturityAt`. Kiểm tra `usdc.balanceOf(vaultAddress) < interest` $\implies$ Hiển thị thông báo màu vàng: *"Quỹ trả lãi tạm thời thiếu tiền. Bạn sẽ nhận ngay 100% gốc, khoản lãi sẽ được ghi nhận nợ để nhận sau (C1)."*
      - *Contract Enforced Constraint*: [SavingCore.sol:227](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L227) kiểm tra `block.timestamp >= maturityAt` và xử lý chuyển tiền/ghi nợ trọn vẹn theo CEI.
    - **Nút Hành Động 2: Rút trước hạn (`earlyWithdraw`)**:
      - *Frontend Pre-check*: Hiển thị khi `currentSimulatedTime < cert.maturityAt`. Modal hiển thị chi tiết: Gốc, Tỷ lệ phạt snapshot, Tiền phạt chuyển cho `feeReceiver`, Số tiền thực nhận về ví.
      - *Contract Enforced Constraint*: [SavingCore.sol:258](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L258) kiểm tra `block.timestamp < maturityAt` revert `AlreadyMatured` nếu cố rút khi đã đáo hạn.
    - **Nút Hành Động 3: Tái tục thủ công (`renewDeposit`)**:
      - *Frontend Pre-check*: Dropdown chỉ hiển thị các gói có `enabled == true`. Kiểm tra `usdc.balanceOf(vaultAddress) >= oldInterest`. Nếu thiếu, vô hiệu hóa nút Renew kèm tooltip giải thích `[D24]` và gợi ý chọn Rút đúng hạn.
      - *Contract Enforced Constraint*: Hợp đồng [SavingCore.sol:318](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L318) gọi `vault.payoutInterest(...)`. Nếu số dư Vault thay đổi giữa lúc frontend check và lúc tx thực thi, contract revert `InsufficientVaultLiquidity()`.
    - **Nút Hành Động 4: Nhận nợ lãi hoãn trả (`claimPendingInterest`)**:
      - *Frontend Pre-check*: Hiển thị khi `unpaidInterest[depositId] > 0`. Nút chỉ kích hoạt khi `usdc.balanceOf(vaultAddress) >= unpaidInterest`.
      - *Contract Enforced Constraint*: [SavingCore.sol:376](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L376) kiểm tra `vault.balance >= unpaid` (revert `ClaimNotCovered`). CEI đặt `unpaidInterest = 0` trước khi chuyển tiền, ngăn chặn double-claim.
  - **Tiêu chí nghiệm thu**: Thao tác thành công cả 4 hành động trên giao diện web, dữ liệu danh sách sổ và số dư ví tự động làm mới sau khi giao dịch xác nhận.

- [ ] **Task 1.4: Lịch Sử Hoạt Động Tối Giản (`frontend/src/components/ActivityLog.tsx`)**
  - **Module liên quan**: Tạo mới `frontend/src/components/ActivityLog.tsx`.
  - **Thiết kế kỹ thuật**:
    - Truy vấn event trong 10,000 block gần nhất: `core.queryFilter(core.filters.Withdrawn(null, account))`, `core.queryFilter(core.filters.DepositOpened(null, account))`.
    - Ghép nối sự kiện: Khi event `Withdrawn` có `interest == 0` và `isEarly == false`, truy vấn kèm event `InterestDeferred` theo `depositId` để hiển thị đúng: *"Tất toán: Đã nhận gốc X USDC, hoãn trả lãi Y USDC (C1)"*.
    - Với `earlyWithdraw`, truy vấn event `PenaltyCharged` cùng `depositId` để hiển thị số tiền phạt đã chuyển về `feeReceiver`.
  - **Tiêu chí nghiệm thu**: Giao diện hiển thị bảng lịch sử giao dịch rõ ràng, chính xác theo từng `depositId`.

---

### ƯU TIÊN 2: Bảng Quản Trị Admin Tối Giản (Ước tính: 1.0 giờ)
*Mục tiêu: Cung cấp giao diện quản lý Vault và Pause phục vụ chứng minh Solvency Guard C2 trong video demo.*

- [ ] **Task 2.1: Admin Panel Component (`frontend/src/components/AdminPanel.tsx`)**
  - **Module liên quan**: Tạo mới `frontend/src/components/AdminPanel.tsx`.
  - **Thiết kế kỹ thuật & Phân quyền thực tế**:
    - *Xác thực quyền riêng biệt*: Đọc độc lập `core.owner()` và `vault.owner()`. Giao diện hiển thị badge trạng thái quyền cho từng hợp đồng (không giả định 2 contract luôn có cùng owner).
    - *Quản trị thanh khoản Vault*:
      - Hiển thị trực quan: `Số Dư Thực Tế (Vault Balance)` đối chiếu với `Tổng Lãi Cam Kết (totalCommittedInterest)`.
      - Form `Nạp Quỹ (fundVault)`: Nhập số USDC, thực hiện approve và gọi `vault.fundVault(amount)`.
      - Form `Rút Quỹ (withdrawVault)`: Hiển thị hạn mức an toàn tối đa cho phép rút: $\max(0, \text{balance} - \text{committed})$.
      - *Frontend Pre-check*: Cảnh báo nếu admin nhập vượt quá hạn mức an toàn.
      - *Contract Enforced Constraint*: [VaultManager.sol:68-71](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L68-L71) bắt buộc revert `InsufficientCommitted` nếu vi phạm C2.
    - *Quản trị Tạm Dừng Khẩn Cấp*:
      - Hiển thị nút `Pause Hệ Thống` và `Unpause Hệ Thống` (gọi tới `vault.pause()` và `vault.unpause()`).
  - **Tiêu chí nghiệm thu**: Đăng nhập bằng Account #0, thấy tab Admin. Thử rút quá hạn mức cam kết $\implies$ UI hiển thị lỗi Solvency Guard. Bấm Pause $\implies$ Các luồng người dùng trên giao diện bị khóa.

---

### ƯU TIÊN 3: Tài Liệu `README.md` Chuẩn Mực & Bàn Giao (Ước tính: 1.5 giờ)
*Mục tiêu: Đảm bảo tài liệu đáp ứng 100% yêu cầu Mục 7.4, 8.1, 8.2, 8.3 của Đề thi và bảo vệ trọn vẹn điểm số.*

- [ ] **Task 3.1: Biên soạn `README.md` tại thư mục gốc**
  - **Nội dung bắt buộc gồm 8 phần**:
    1. **Thông tin Sinh viên & Variant (Đầu file — Mục 8.1)**:
       - Họ tên, MSSV (kết thúc bằng …41), Chữ số $A=1$, $B=4$.
       - Bảng thông số: Grace Period = 3 ngày (259,200s), Default Plan APR = 225 bps (2.25%), Early Penalty = 500 bps (5.00%), Default Tenor = 90 ngày.
    2. **Cảnh báo an ninh**: Ghi rõ đây là đồ án môn học nội bộ (Educational/Demo), chưa qua kiểm toán bảo mật độc lập. `MockUSDC` là token thử nghiệm (faucet mở), không phải stablecoin thật.
    3. **Kiến trúc hệ thống**: Sơ đồ ASCII 3 hợp đồng (`MockUSDC`, `VaultManager`, `SavingCore`) và nguyên tắc phân tách 2 quỹ độc lập (Anti-Ponzi).
    4. **Công thức toán học**: Lãi đơn floor (nhân trước chia sau), phạt rút sớm, lãi kép tái tục.
    5. **Hướng dẫn khởi chạy đa terminal trung thực**:
       - Terminal 1: `npm run node`
       - Terminal 2: `npm run deploy:local` (Hardhat Ignition)
       - Cấu hình file `frontend/.env`
       - Terminal 3: `npm run dev` (Frontend)
       - *Lưu ý lỗi lệch nonce MetaMask*: Hướng dẫn chi tiết vào Settings $\rightarrow$ Advanced $\rightarrow$ Clear activity tab data sau mỗi lần restart node.
    6. **Design Answers (Mục 8.2 — Trả lời 7 câu hỏi bảo vệ đồ án)**:
       - Tự diễn giải bằng 3–6 câu cho mỗi câu Q1–Q7:
         - **Q1 (NFT Certificate Transfer)**: Chỉ `ownerOf` tại thời điểm gọi hàm được rút tiền ([SavingCore.sol:223](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L223)) và nhận nợ ([SavingCore.sol:371](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L371)). Nêu rõ rủi ro bán NFT đã tất toán trên thị trường thứ cấp và biện pháp phòng vệ on-chain.
         - **Q2 (Empty Vault & C1)**: Gốc 100% trả ngay, lãi hoãn trả thành nợ ([SavingCore.sol:233-248](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L233-L248)).
         - **Q3 (Dead Bot & Backdate)**: Tự động tính bù lãi liên tục từng kỳ ([SavingCore.sol:338-339](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L338-L339)). Không có incentive fee (thiết kế chủ đích bảo vệ invariant).
         - **Q4 (Rounding Dust)**: Làm tròn floor, bụi token nằm lại pool. **Trỏ trực tiếp đến test chứng minh**: `test/Phase2.core_flows.test.ts:606` (TC-21, test gốc lẻ `1_000_001` và ngưỡng `180` vs `181` wei).
         - **Q5 (Time Boundaries)**: Rút đúng hạn dùng `<` revert `NotMatured` ([SavingCore.sol:227](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L227)), rút sớm dùng `>=` revert `AlreadyMatured` ([SavingCore.sol:258](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L258)), auto-renew dùng `< maturityAt + grace` ([SavingCore.sol:327](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L327)).
         - **Q6 (Disabled Plan & Snapshot APR)**: Snapshot APR bất biến. Manual renew vào gói tắt bị revert ([SavingCore.sol:289](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L289)), auto-renew vẫn chạy để bảo vệ khách hàng (`[D13]`).
         - **Q7 (Attack Vectors & CEI)**: ReentrancyGuard toàn bộ, CEI cập nhật `status` trước transfer ([SavingCore.sol:229](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L229)). `VaultManager.payoutInterest` khóa `onlySavingCore` ([VaultManager.sol:78](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L78)).
    7. **Creative Challenges Note (Mục 8.3 — Bonus C1 & C2)**:
       - Ghi rõ cấu trúc Problem / Solution / Trade-offs cho C1 và C2.
       - *Caveat bắt buộc C2*: Solvency Guard chống Admin rút cạn, **không chống được undercollateralization do compound khi renew**.
       - *Caveat bắt buộc C1*: Cơ chế All-or-Nothing và First-Come-First-Served (FCFS) khi Vault nạp thiếu để tối ưu Gas và chống DoS loop.
    8. **Bản đồ ánh xạ Q-ID / D-ID / Test-ID**.
  - **Tiêu chí nghiệm thu**: File `README.md` không chứa private key/secret, giải trình mạch lạc, chính xác từng số liệu và đường dẫn code.

---

### ƯU TIÊN 4: Kịch Bản Demo Video Thực Chiến & Luyện Vấn Đáp (Ước tính: 1.5 giờ + Buffer)
*Mục tiêu: Chuẩn bị kịch bản quay video 3–5 phút chạy mượt mà trên môi trường local development, có thể tái hiện thực tế 100%.*

- [ ] **Task 4.1: Thiết lập môi trường và cấu hình ví demo**
  - **Phân bổ 3 ví Hardhat tách bạch**:
    - Ví 0 (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`): Ví Admin (Deploy, nạp Vault, Pause).
    - Ví 1 (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`): Ví Người dùng Demo (Mở sổ, rút tiền, chịu phạt).
    - Ví 2 (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`): Ví Thu Phạt (`feeReceiver`).
  - **Thao tác chuẩn bị (Pre-demo setup)**:
    - Admin gọi `vault.setFeeReceiver(Ví 2)` để tách bạch ví nhận phạt rút sớm.

- [ ] **Task 4.2: Kịch bản 4 phân cảnh quay video (Thời lượng 3–5 phút)**
  - **Cảnh 1: Mở sổ tiết kiệm & Khám phá NFT (Thời lượng ~1.0 phút)**:
    - Ví 1 kết nối, bấm nhận 1,000 USDC từ Faucet.
    - Mở sổ Plan 0 (90 ngày) $\implies$ Approve USDC $\implies$ Confirm Open.
    - Hiển thị chứng chỉ NFT ERC-721: Token ID #1, Countdown timer ~90 ngày, Snapshot APR 2.25%, Lãi dự kiến: **5.547945 USDC**.
  - **Cảnh 2: Nhảy thời gian & Rút đúng hạn (Thời lượng ~1.0 phút)**:
    - Bật modal `DevTimeTravel`, bấm tua nhanh **+90 Ngày** $\implies$ EVM timestamp nhảy qua ngày đáo hạn, Countdown timer chuyển sang badge xanh *"Đã Đáo Hạn"*.
    - Bấm "Rút Đúng Hạn" $\implies$ Số dư ví 1 nhận đủ 1,000 USDC gốc từ SavingCore và **5.547945 USDC** lãi từ VaultManager. Trạng thái sổ chuyển sang tab *"Lịch Sử Tất Toán"*.
  - **Cảnh 3: Rút trước hạn chịu phạt (Thời lượng ~1.0 phút)**:
    - Mở sổ mới 1,000 USDC (Token ID #2).
    - Bấm "Rút Trước Hạn" ngay lập tức $\implies$ Modal cảnh báo hiển thị: Phạt 5.00% (50.00 USDC), Thực nhận 950.00 USDC.
    - Xác nhận rút $\implies$ Ví 1 nhận 950 USDC, số dư Ví 2 (`feeReceiver`) tăng đúng **50 USDC**.
  - **Cảnh 4: Tái tục & Minh chứng Solvency Guard C2 (Thời lượng ~1.5 phút)**:
    - Mở sổ mới 1,000 USDC (Token ID #3), nhảy thời gian +90 ngày.
    - Bấm "Tái Tục (Renew)" sang Plan 1 (30 ngày) $\implies$ Gốc mới: **1,005.547945 USDC**, snapshot APR mới 3.00%.
    - Chuyển sang ví Admin (Ví 0): Mở tab Admin Panel, chỉ rõ: `Vault Balance` và `Total Committed Interest` đang khóa quỹ bảo chứng.
    - Thử rút vượt mức cam kết $\implies$ Solvency Guard C2 chặn giao dịch, UI hiển thị cảnh báo an toàn.
  - *(Ghi chú demo C1)*: Trình bày cơ chế hoãn trả lãi C1 bằng sơ đồ trên UI hoặc thực hiện claim 1 sổ nợ mẫu đã chuẩn bị trước.

---

### ƯU TIÊN 5: Bổ Sung 6 Test Case Biên Vá Coverage (Ước tính: 30 phút — Làm nếu còn thời gian)
*Mục tiêu: Đưa độ bao phủ Line Coverage từ 94.53% lên $\ge 98\%$ để đạt sự hoàn hảo kỹ thuật.*

- [ ] **Task 5.1: Thêm file `smartcontract/test/Phase5.edge_cases.test.ts`**
  - **Danh mục 6 test case biên**:
    1. `VaultManager.constructor` với `usdc == address(0)` revert `ZeroAddress()`.
    2. `SavingCore.constructor` với `usdc == address(0)` hoặc `vault == address(0)` revert `ZeroAddress()`.
    3. `SavingCore.enablePlan(999)` với planId chưa tạo revert `PlanNotFound(999)`.
    4. `SavingCore.renewDeposit` với `newPlanId = 999` revert `PlanNotFound(999)`.
    5. `SavingCore.renewDeposit` vào gói có `minDeposit > newPrincipal` revert `InvalidDepositAmount()`.
    6. `SavingCore.getPlan(999)` revert `PlanNotFound(999)`.
  - **Tiêu chí nghiệm thu**: Chạy `npm run test:coverage` đạt Line Coverage $\ge 98\%$, 100% tests pass.

---

## 4. BẢNG DỰ TOÁN THỜI GIAN & PHÂN BỔ BUFFER AN TOÀN

| Thứ tự | Hạng mục công việc | Thời gian thực tế | Buffer rủi ro sự cố | Ghi chú rủi ro |
|---|---|:---:|:---:|---|
| **0** | Re-export ABI & Cấu hình môi trường | 30 phút | 15 phút | Tránh lệch ABI làm vỡ các hàm C1/C2. |
| **1** | Lát cắt dọc Frontend & Giải mã lỗi | 3.5 giờ | 1.5 giờ | Dành thời gian xử lý lệch nonce MetaMask và style CSS. |
| **2** | Bảng Quản trị Admin tối giản | 1.0 giờ | 30 phút | Kiểm tra đúng quyền owner của cả 2 hợp đồng. |
| **3** | Tài liệu `README.md` (Design Answers & Bonus) | 1.5 giờ | 30 phút | Rà soát từng câu chữ, dẫn chứng `file:dòng` chuẩn đề. |
| **4** | Kịch bản Video Demo & Ôn luyện vấn đáp | 1.5 giờ | **2.5 giờ** | Dành buffer quay lại nhiều lần và cắt ghép video. |
| **5** | 6 Test case biên (Coverage $\ge 98\%$) | 30 phút | 15 phút | Tùy chọn thực hiện nếu còn thời gian. |
| **Σ** | **TỔNG THỜI GIAN DỰ KIẾN** | **9.5 giờ** | **5.5 giờ** | **Tổng quỹ thời gian an toàn: 15 giờ** |

---

## 5. ĐỊNH NGHĨA HOÀN THÀNH (DEFINITION OF DONE — PHASE 5)

Dự án chỉ được coi là hoàn tất 100% Phase 5 khi thỏa mãn toàn bộ 6 điều kiện sau:
1. `smartcontract/`: `npm run build` sạch 0 warning; `npm run test:coverage` đạt Line Coverage $\ge 90\%$ (duy trì $\ge 94.53\%$), 100% tests pass.
2. `frontend/`: `npm run build` sạch 0 lỗi TypeScript, 0 warning.
3. Chạy `npm run node` + deploy Ignition: Thực hiện mượt mà 5 luồng người dùng trên giao diện web bằng ví Account #1, các thông báo lỗi hiển thị bằng tiếng Việt chuẩn xác.
4. File `README.md` tại thư mục gốc hoàn thiện đầy đủ 8 mục theo yêu cầu Đề thi Mục 7.4 & 8.
5. Video demo 3–5 phút ghi lại rõ ràng 4 phân cảnh thực tế trên máy local.
6. File tiến độ `docs/progress/N5_frontend_docs.md` được lập và xác nhận hoàn thành toàn bộ đồ án.
