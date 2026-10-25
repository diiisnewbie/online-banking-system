# PROJECT OVERVIEW: ON-CHAIN TERM DEPOSIT SYSTEM (ONLINE BANKING)

> **Document Purpose**: Đây là tài liệu quy chuẩn kỹ thuật và nghiệp vụ tổng thể (Single Source of Truth) dành cho lập trình viên và các mô hình AI (Claude, Cursor, Copilot, ChatGPT). Tài liệu này mô tả chi tiết kiến trúc, luồng hoạt động, công thức toán học, ràng buộc bảo mật, và danh mục kiểm thử của hệ thống ngân hàng tiết kiệm trên Blockchain.

---

## 1. TỔNG QUAN HỆ THỐNG (SYSTEM SUMMARY)

Dự án hiện thực hóa một hệ thống gửi tiết kiệm có kỳ hạn (Term Deposit Banking System) chạy phi tập trung hoàn toàn bằng Smart Contract trên EVM:
- **Người gửi (Depositor / User)**: Gửi tiền (USDC) vào hợp đồng theo kỳ hạn (tenor), nhận chứng chỉ tiền gửi dưới dạng **ERC-721 NFT**. Đến hạn hoặc trước hạn, người dùng có thể rút gốc + lãi, rút sớm (chịu phạt), hoặc tái tục (manual renew / auto renew).
- **Ngân hàng (Bank Admin)**: Thiết lập và quản lý các gói tiết kiệm (Saving Plans), nạp thanh khoản vào quỹ trả lãi (Interest Vault), tạm dừng hệ thống trong trường hợp khẩn cấp (Emergency Pause), chỉ định ví thu phí phạt rút sớm (`feeReceiver`).
- **Token thanh toán**: `MockUSDC` (chuẩn ERC-20, **chính xác 6 decimals**).

---

## 2. NGUYÊN TẮC KIẾN TRÚC CỐT LÕI (ARCHITECTURE & SEPARATION OF DUTIES)

Hệ thống bắt buộc phải tách biệt thành **3 hợp đồng độc lập** để đảm bảo an toàn tài sản và phân tách trách nhiệm (Separation of Concerns):

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
|                             |---------------------->|                                |
| - Holds Users' Principal    |                       | - Holds Bank's Interest Fund   |
| - Manages Saving Plans      |                       | - Admin Liquidity Control      |
| - Mints ERC-721 Certificate |                       | - Fee Receiver Configuration   |
| - Executes User Flows       |                       | - Emergency Pause Master       |
+-----------------------------+                       +--------------------------------+
```

### 2.1. Phân định vai trò & trách nhiệm lưu trữ:
1. **`MockUSDC.sol`**:
   - Token thử nghiệm mô phỏng USDC chuẩn.
   - **Bắt buộc 6 decimals** (1 USDC = $10^6$ units = $1{,}000{,}000$ wei-equivalent).
   - Bất kỳ ai cũng có thể gọi `mint(address to, uint256 amount)` để nhận token phục vụ kiểm thử.
2. **`VaultManager.sol`**:
   - Lưu trữ **tiền riêng của ngân hàng (Interest Liquidity Pool)**.
   - Admin nạp tiền (`fundVault`) và rút vốn (`withdrawVault`).
   - Cung cấp hàm `payoutInterest(address to, uint256 amount)`: **Chỉ có contract `SavingCore` mới được phép gọi hàm này**.
   - Admin cấu hình địa chỉ ví nhận phạt rút sớm (`feeReceiver`).
   - Quản lý trạng thái `pause()` / `unpause()` cho toàn hệ thống.
3. **`SavingCore.sol`**:
   - Lưu trữ **toàn bộ tiền gốc (Principal) của người dùng**.
   - Quản lý danh sách các gói tiết kiệm (`SavingPlan`).
   - Đóng vai trò là hợp đồng **ERC-721**: Mỗi khoản tiền gửi là một NFT duy nhất (`depositId`), đại diện cho quyền sở hữu chứng chỉ tiền gửi.
   - Xử lý toàn bộ logic nghiệp vụ: Mở sổ (`openDeposit`), Rút đáo hạn (`withdrawAtMaturity`), Rút trước hạn (`earlyWithdraw`), Tái tục thủ công (`renewDeposit`), Tái tục tự động (`autoRenewDeposit`).

> **BẤT BIẾN TỐI QUAN TRỌNG (CRITICAL INVARIANT)**:
> Tiền gốc của người dùng (`SavingCore`) và tiền lãi của ngân hàng (`VaultManager`) **hoàn toàn độc lập**. Tiền lãi trả cho người gửi **luôn luôn** được trích xuất từ `VaultManager`, **tuyệt đối không bao giờ** dùng tiền gốc của người gửi sau trả lãi cho người gửi trước (mô hình Ponzi).

---

## 3. CẤU TRÚC DỮ LIỆU CHÍNH (DATA STRUCTURES)

### 3.1. Saving Plan (Gói tiết kiệm)
```solidity
struct SavingPlan {
    uint256 planId;
    uint256 tenorDays;                // Kỳ hạn gửi (ví dụ: 7, 30, 90, 180, 365 ngày)
    uint256 aprBps;                   // Lãi suất năm tính bằng Basis Points (1 bps = 0.01%, 800 bps = 8.00%)
    uint256 minDeposit;               // Mức gửi tối thiểu (0 = không giới hạn)
    uint256 maxDeposit;               // Mức gửi tối đa (0 = không giới hạn)
    uint256 earlyWithdrawPenaltyBps;  // Tỷ lệ phạt khi rút sớm tính bằng bps (500 bps = 5.00%)
    bool enabled;                     // Admin bật/tắt nhận khoản gửi mới
}
```

### 3.2. Deposit Certificate (Chứng chỉ tiền gửi - ERC721 Token Data)
```solidity
enum DepositStatus {
    Active,         // Đang hoạt động, chờ đáo hạn
    Withdrawn,      // Đã tất toán (rút đúng hạn hoặc rút sớm)
    ManualRenewed,  // Đã tái tục thủ công sang gói mới
    AutoRenewed     // Đã được bot hoặc hệ thống tái tục tự động
}

struct DepositCertificate {
    uint256 depositId;                // Token ID của ERC-721 NFT
    uint256 planId;                   // ID của gói tiết kiệm đã chọn
    uint256 principal;                // Tiền gốc (6 decimals)
    uint256 startAt;                  // Timestamp bắt đầu gửi (block.timestamp)
    uint256 maturityAt;               // Timestamp ngày đáo hạn (startAt + tenorDays * 86400)
    uint256 aprBpsAtOpen;             // Snapshot APR tại thời điểm mở sổ (BẤT BIẾN)
    uint256 penaltyBpsAtOpen;         // Snapshot phí phạt rút sớm tại thời điểm mở sổ (BẤT BIẾN)
    DepositStatus status;             // Trạng thái của khoản gửi
}
```

---

## 4. QUY TRÌNH NGHIỆP VỤ CHI TIẾT (CORE USER FLOWS)

### 4.1. Mở sổ tiết kiệm (`openDeposit`)
1. **Tiền điều kiện**: Người dùng gọi `MockUSDC.approve(address(savingCore), amount)`.
2. **Gọi hàm**: Người dùng gọi `openDeposit(uint256 planId, uint256 amount)`.
3. **Kiểm tra (Validations)**:
   - Hệ thống không ở trạng thái tạm dừng (`whenNotPaused`).
   - Gói tiết kiệm tồn tại và đang bật (`plan.enabled == true`).
   - Số tiền gửi hợp lệ: `amount >= plan.minDeposit` (nếu `minDeposit > 0`) và `amount <= plan.maxDeposit` (nếu `maxDeposit > 0`).
4. **Thực thi**:
   - Chuyển `amount` token USDC từ người dùng vào hợp đồng `SavingCore`.
   - Sinh ra `depositId` mới duy nhất.
   - Mint một NFT đại diện cho `depositId` gửi đến ví người dùng (`_safeMint(msg.sender, depositId)`).
   - Thiết lập `maturityAt = block.timestamp + (plan.tenorDays * 86400)`.
   - **Snapshot**: Ghi nhận `aprBpsAtOpen = plan.aprBps` và `penaltyBpsAtOpen = plan.earlyWithdrawPenaltyBps`.
   - Trạng thái: `status = DepositStatus.Active`.
5. **Phát sự kiện**: `emit DepositOpened(...)`.

---

### 4.2. Rút tiền đúng hạn (`withdrawAtMaturity`)
1. **Điều kiện kích hoạt**:
   - Người gọi là chủ sở hữu NFT (`ownerOf(depositId) == msg.sender`).
   - Khoản gửi đang ở trạng thái `DepositStatus.Active`.
   - Thời gian hiện tại đã đến hoặc vượt quá ngày đáo hạn: `block.timestamp >= certificate.maturityAt`.
   - Hệ thống không bị tạm dừng (`whenNotPaused`).
2. **Tính toán lãi (Simple Interest)**:
   $$\text{tenorSeconds} = \text{tenorDays} \times 86{,}400$$
   $$\text{interest} = \frac{\text{principal} \times \text{aprBpsAtOpen} \times \text{tenorSeconds}}{365 \times 86{,}400 \times 10{,}000}$$
   *(Lưu ý: Luôn nhân các số hạng ở tử số trước, sau đó mới chia mẫu số để tránh mất độ chính xác).*
3. **Thanh toán**:
   - Yêu cầu `VaultManager` thanh toán khoản `interest` này cho người dùng thông qua hàm `payoutInterest(msg.sender, interest)`.
   - Nếu quỹ trong `VaultManager` không đủ trả lãi: Báo lỗi (`revert InsufficientVaultLiquidity()`) theo chuẩn cơ bản (hoặc xử lý theo Bonus C1).
   - Hợp đồng `SavingCore` chuyển trả toàn bộ `principal` (tiền gốc) cho người dùng.
4. **Cập nhật trạng thái**:
   - Chuyển `certificate.status = DepositStatus.Withdrawn`.
   - Burn hoặc giữ NFT tùy theo thiết kế (thông thường giữ lại nhưng đổi status sang `Withdrawn` để lưu vết lịch sử trên UI).
5. **Phát sự kiện**: `emit Withdrawn(depositId, msg.sender, principal, interest, false)`.

---

### 4.3. Rút tiền trước hạn (`earlyWithdraw`)
1. **Điều kiện kích hoạt**:
   - Người gọi là chủ sở hữu NFT (`ownerOf(depositId) == msg.sender`).
   - Khoản gửi đang ở trạng thái `DepositStatus.Active`.
   - Thời gian hiện tại chưa đến ngày đáo hạn: `block.timestamp < certificate.maturityAt`.
   - Hệ thống không bị tạm dừng (`whenNotPaused`).
2. **Tính toán phạt**:
   - Tiền lãi nhận được: $\text{interest} = 0$.
   $$\text{penalty} = \frac{\text{principal} \times \text{penaltyBpsAtOpen}}{10{,}000}$$
   $$\text{amountToUser} = \text{principal} - \text{penalty}$$
3. **Thanh toán**:
   - Chuyển `penalty` từ `SavingCore` đến ví `feeReceiver` (do `VaultManager` chỉ định).
   - Chuyển `amountToUser` từ `SavingCore` đến ví người dùng.
4. **Cập nhật trạng thái**:
   - `certificate.status = DepositStatus.Withdrawn`.
5. **Phát sự kiện**: `emit Withdrawn(depositId, msg.sender, amountToUser, 0, true)`.

---

### 4.4. Tái tục thủ công (`renewDeposit`)
1. **Điều kiện kích hoạt**:
   - Người gọi là chủ sở hữu NFT (`ownerOf(depositId) == msg.sender`).
   - Trạng thái khoản gửi cũ là `Active`.
   - Đã đến ngày đáo hạn: `block.timestamp >= oldCertificate.maturityAt`.
   - Gói mới `newPlanId` đang được kích hoạt (`enabled == true`).
2. **Tính toán**:
   - Tính khoản lãi của kỳ hạn cũ: $\text{oldInterest}$.
   - Yêu cầu `VaultManager` chuyển `oldInterest` từ Vault sang `SavingCore` để nhập gốc:
     $$\text{newPrincipal} = \text{oldPrincipal} + \text{oldInterest}$$
   - Kiểm tra `newPrincipal` có thỏa mãn giới hạn `minDeposit`/`maxDeposit` của `newPlanId` hay không.
3. **Thực thi**:
   - Đánh dấu trạng thái chứng chỉ cũ: `oldCertificate.status = DepositStatus.ManualRenewed`.
   - Mint một chứng chỉ NFT mới (`newDepositId`) cho người dùng với:
     - Gốc mới: `newPrincipal`.
     - Lãi suất và phạt: Lấy theo snapshot của `newPlanId`.
     - Ngày đáo hạn mới: `block.timestamp + (newPlan.tenorDays * 86400)`.
     - Trạng thái: `Active`.
4. **Phát sự kiện**: `emit Renewed(oldDepositId, newDepositId, newPrincipal, newPlanId)`.

---

### 4.5. Tái tục tự động (`autoRenewDeposit`)
1. **Bối cảnh**: Người dùng không thực hiện bất kỳ hành động nào sau khi khoản gửi đáo hạn và đã vượt qua thời gian ân hạn (Grace Period).
2. **Điều kiện kích hoạt**:
   - Được gọi bởi Bot off-chain hoặc bất kỳ người dùng nào (`msg.sender` bất kỳ).
   - Khoản gửi cũ đang ở trạng thái `Active`.
   - Đã vượt quá thời gian ân hạn:
     $$\text{block.timestamp} \ge \text{certificate.maturityAt} + \text{gracePeriod}$$
3. **Quy tắc bảo vệ người dùng (Investor Protection Rule)**:
   - Kỳ hạn mới: Giữ nguyên `tenorDays` của gói cũ.
   - Lãi suất mới: **Bắt buộc khóa theo `aprBpsAtOpen` cũ**, không dùng tỷ lệ của gói hiện tại (để bảo vệ người dùng nếu Admin hạ lãi suất).
   - Phí phạt mới: Giữ theo tỷ lệ phạt cũ `penaltyBpsAtOpen`.
   - Tiền lãi kỳ cũ được chuyển từ `VaultManager` vào `SavingCore` để nhập gốc:
     $$\text{newPrincipal} = \text{oldPrincipal} + \text{oldInterest}$$
4. **Thực thi**:
   - Đánh dấu chứng chỉ cũ: `oldCertificate.status = DepositStatus.AutoRenewed`.
   - Mint NFT mới gửi cho chính chủ sở hữu của NFT cũ (`ownerOf(oldDepositId)`).
   - Thiết lập `maturityAt = block.timestamp + (tenorDays * 86400)`.
5. **Phát sự kiện**: `emit Renewed(oldDepositId, newDepositId, newPrincipal, oldPlanId)`.

---

## 5. THÔNG SỐ CÁ NHÂN HÓA THEO MSSV (PERSONAL VARIANT PARAMETERS)

Dự án yêu cầu bắt buộc áp dụng công thức cá nhân hóa theo 2 chữ số cuối của Mã số sinh viên:
- Gọi $A$ là chữ số cuối cùng của MSSV.
- Gọi $B$ là chữ số kế cuối của MSSV.

| Thông số | Công thức quy định | Ý nghĩa nghiệp vụ |
| :--- | :--- | :--- |
| **Grace Period** | $(A \bmod 3) + 2$ ngày | Khoảng thời gian chờ sau ngày đáo hạn trước khi Bot được phép gọi Auto-Renew. |
| **Default Plan APR** | $(200 + A \times 25)$ bps | Lãi suất năm mặc định của gói tiết kiệm tạo sẵn (ví dụ: $A=7 \implies 375$ bps = $3.75\%$). |
| **Early Penalty** | $(300 + B \times 50)$ bps | Tỷ lệ phạt rút sớm mặc định (ví dụ: $B=4 \implies 500$ bps = $5.00\%$). |
| **Default Tenor** | $B$ chẵn $\implies 90$ ngày;<br>$B$ lẻ $\implies 180$ ngày | Kỳ hạn mặc định của gói tiết kiệm khởi tạo ban đầu. |

> **Quy chuẩn kiểm thử**: Toàn bộ unit tests và số liệu trên Frontend demo video **phải phản ánh chính xác các con số tính theo công thức của MSSV này**.

---

## 6. DANH SÁCH SỰ KIỆN BẮT BUỘC (REQUIRED EVENTS)

Hệ thống bắt buộc phải phát (emit) đầy đủ các event sau để phục vụ Frontend và Indexer:

```solidity
event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
event DepositOpened(
    uint256 indexed depositId,
    address indexed owner,
    uint256 indexed planId,
    uint256 principal,
    uint256 maturityAt,
    uint256 aprBpsAtOpen
);
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
```

---

## 7. CÂU HỎI BẢO VỆ ĐỒ ÁN (ORAL DEFENSE & DESIGN DECISIONS)

Dưới đây là 7 vấn đề cốt lõi sinh viên cần nắm vững để giải trình khi vấn đáp:

1. **NFT chuyển nhượng (Transferable Certificate)**:
   - *Tình huống*: Alice bán NFT chứng chỉ cho Bob trước ngày đáo hạn. Ai là người được rút tiền?
   - *Quy tắc*: Hợp đồng kiểm tra `require(ownerOf(depositId) == msg.sender)`. Do đó, người nắm giữ NFT tại thời điểm gọi hàm (Bob) là người nhận toàn bộ gốc và lãi.
   - *Đánh giá*: Đây là cơ chế chuẩn của Web3/DeFi (tạo thị trường thứ cấp cho chứng chỉ tiền gửi), người mua chấp nhận trả tiền để sở hữu dòng tiền tương lai.
2. **Kịch bản Vault rỗng (Empty Vault)**:
   - *Quy tắc cơ bản*: Revert giao dịch nếu Vault không đủ trả lãi.
   - *Hạn chế*: Ngân hàng có thể vô tình hoặc cố ý "giam" luôn cả tiền gốc của người dùng bằng cách không nạp tiền trả lãi.
   - *Giải pháp nâng cao*: Triển khai Challenge C1 (cho phép rút gốc ngay lập tức, phần lãi đưa vào danh sách nợ để claim sau khi Vault có tiền).
3. **Sự cố Bot ngừng hoạt động (Dead Bot)**:
   - *Tình huống*: Bot auto-renew sập 1 tháng sau khi hết grace period.
   - *Hậu quả*: Người dùng không bị mất tiền gốc, nhưng tiền nằm im không sinh lãi thêm trong khoảng thời gian quá hạn đó.
   - *Đề xuất*: Cho phép bất kỳ ai (không chỉ bot) có quyền kích hoạt auto-renew và nhận một phần thưởng gas (incentive fee), hoặc tự động tính bù lãi quá hạn.
4. **Xử lý số dư làm tròn (Rounding Dust)**:
   - Phép chia số nguyên trong Solidity luôn làm tròn xuống (`floor`). Khoản "bụi token" này nằm lại trong `VaultManager`. Phép chia làm tròn xuống đảm bảo hợp đồng không bao giờ trả vượt quá số dư thực tế, loại trừ hoàn toàn nguy cơ revert do thiếu hụt 1 wei.
5. **Mốc thời gian biên (Boundary Timestamps)**:
   - *Tại chính xác thời điểm `maturityAt`*: Sử dụng toán tử `>=`. Do đó, tại đúng giây `maturityAt`, giao dịch được tính là **rút đúng hạn** (`withdrawAtMaturity`).
   - *Hết thời gian ân hạn*: `block.timestamp >= maturityAt + gracePeriod` mới cho phép kích hoạt auto-renew. Nếu chưa vượt qua giây này, người dùng vẫn có quyền thao tác thủ công.
6. **Vô hiệu hóa gói khi đang có khoản gửi hoạt động (Disabled Plan)**:
   - Admin gọi `disablePlan(planId)`. Những khoản gửi cũ vẫn chạy bình thường cho đến khi đáo hạn và rút tiền đầy đủ.
   - Người dùng **không được phép** `renewDeposit` vào gói đã bị vô hiệu hóa (`require(plan.enabled)`).
7. **Phân tích nguy cơ tấn công (Attack Vectors & Defense)**:
   - *Reentrancy Attack*: Áp dụng mẫu Checks-Effects-Interactions (CEI) và OpenZeppelin `ReentrancyGuard` trên tất cả các hàm rút tiền.
   - *Double Withdrawal*: Cập nhật trạng thái `status = Withdrawn` trước khi thực hiện các lệnh chuyển token.
   - *Token Giả mạo*: Địa chỉ của token `MockUSDC` được khóa cứng (immutable) trong constructor của cả hai contract.

---

## 8. CÁC THÁCH THỨC SÁNG TẠO (BONUS CHALLENGES - UP TO +10)

| ID | Thử thách | Mô tả giải pháp |
| :--- | :--- | :--- |
| **C1** | **Principal is always safe** | Nếu `VaultManager` hết tiền, cho phép người dùng rút trước $100\%$ tiền gốc `principal`. Số tiền lãi `interest` chưa trả được ghi nhận vào mapping nợ (`unpaidInterest[depositId]`). Người dùng có thể gọi hàm `claimPendingInterest(depositId)` sau này khi Vault đã được nạp tiền. |
| **C2** | **Solvency Guard** | Ngăn chặn Admin rút cạn tiền từ Vault. Contract duy trì biến `totalCommittedInterest` (tổng số tiền lãi đã cam kết chi trả cho toàn bộ các deposit đang `Active`). Hàm `withdrawVault(amount)` của Admin bắt buộc phải thỏa mãn: $\text{vaultBalance} - \text{amount} \ge \text{totalCommittedInterest}$. |

---

## 9. HƯỚNG DẪN DÀNH CHO AI TRONG QUÁ TRÌNH VIẾT CODE & KIỂM THỬ

Khi hỗ trợ lập trình dự án này, AI bắt buộc phải tuân theo các nguyên tắc kỹ thuật sau:
1. **Kiểm tra Decimals**: Mọi phép tính toán lượng token USDC phải dựa trên $10^6$ (`1_000_000`), không sử dụng $10^{18}$.
2. **Thứ tự phép tính**: Luôn luôn thực hiện phép nhân trước phép chia `(a * b * c) / d` để hạn chế tối đa sai số làm tròn.
3. **Thư viện chuẩn**:
   - Sử dụng `@openzeppelin/contracts` phiên bản v5.x (hoặc v4.9) cho `ERC721`, `ERC20`, `Ownable`, `Pausable`, `ReentrancyGuard`, `SafeERC20`.
4. **Kiểm thử tự động (Hardhat Test Suite)**:
   - Sử dụng thư viện `@nomicfoundation/hardhat-network-helpers` (`time.increase`, `time.latest`) để giả lập thời gian trôi qua ngày đáo hạn và qua thời gian ân hạn.
   - Độ bao phủ kiểm thử (Test Coverage) toàn hệ thống phải đạt **trên 90%** (`npx hardhat coverage`).
5. **Đồng bộ hóa tiến độ**:
   - Mọi thay đổi logic code lớn đều cần giải thích lý do thiết kế và cập nhật trạng thái tương ứng vào file quản lý tiến độ.