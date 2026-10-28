# ONLINE BANKING SYSTEM — TERM DEPOSIT VỚI ERC-721 CERTIFICATE

> **Đồ án môn học**: Blockchain Programming / Lập trình Blockchain  
> **Sinh viên thực hiện**: Nguyễn Văn A (Ví dụ) — **MSSV: 20210041** (Hai chữ số cuối: **41**)  
> **Chữ số cuối ($A$)**: `1` · **Chữ số kế cuối ($B$)**: `4`

---

## 1. THÔNG SỐ CÁ NHÂN HÓA THEO MSSV (MỤC 8.1 CỦA ĐỀ)

Áp dụng đúng công thức cá nhân hóa theo quy định của Đề thi với $A = 1$ và $B = 4$:

| Thông số | Công thức quy định | Giá trị tính toán | Trạng thái triển khai |
|---|---|---|:---:|
| **Thời gian ân hạn (Grace Period)** | $(A \bmod 3) + 2$ ngày | **3 ngày = 259,200 giây** | ✅ `SavingCore.gracePeriod` (immutable) |
| **Lãi suất năm gói mặc định (APR)** | $(200 + A \times 25)$ bps | **225 bps = 2.25%/năm** | ✅ Plan 0 snapshot tại mở sổ |
| **Phí phạt rút sớm mặc định (Penalty)**| $(300 + B \times 50)$ bps | **500 bps = 5.00%** | ✅ Trừ vào gốc, nộp `feeReceiver` |
| **Kỳ hạn gói mặc định (Tenor)** | $B$ chẵn $\implies 90$ ngày;<br>$B$ lẻ $\implies 180$ ngày | **90 ngày** ($B = 4$ chẵn) | ✅ Plan 0 khởi tạo constructor |
| **Hạn mức Plan 0 (Mặc định)** | Seed config | Min: **10 USDC** · Max: **100,000 USDC** | ✅ Enforce on-chain |

---

## 2. CẢNH BÁO AN NINH & BẢN QUYỀN

> [!WARNING]
> **Dự án phục vụ mục đích giáo dục & nghiên cứu học thuật:**
> 1. Mã nguồn này được phát triển cho đồ án môn học Blockchain Programming, **chưa qua kiểm toán bảo mật độc lập bởi bên thứ ba**. Tuyệt đối không sử dụng trên mạng Mainnet với tài sản thật.
> 2. `MockUSDC` là token ERC-20 thử nghiệm nội bộ với faucet mở tự do, không có giá trị quy đổi tài chính ngoài đời thực.
> 3. Tính năng tua thời gian (Dev Time-Travel) sử dụng RPC chuyên biệt `evm_increaseTime` và `evm_mine`, **chỉ hoạt động trên môi trường local development (Hardhat chainId 31337)**.

---

## 3. KIẾN TRÚC HỆ THỐNG & NGUYÊN TẮC BẢO VỆ TÀI CHÍNH (ANTI-PONZI)

Hệ thống tuân thủ nghiêm ngặt nguyên tắc **Phân tách trách nhiệm (Separation of Concerns)** với 3 hợp đồng độc lập:

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
| - Saving Plans + committed  |                       | - Admin Liquidity Control      |
| - Mints ERC-721 Certificate |                       | - feeReceiver Configuration   |
| - Executes User Flows       |                       | - Emergency Pause Master       |
+-----------------------------+                       +--------------------------------+
                                   ^            |
                                   |  ISavingCore.totalCommittedInterest() (view)
                                   +------------+
```

### Bất biến cốt lõi (Anti-Ponzi Invariant)
1. **Cô lập tiền gốc và tiền lãi**: Tiền gốc người dùng gửi vào lưu giữ tại `SavingCore`. Tiền lãi chi trả cho người dùng **luôn luôn** được thanh toán từ quỹ riêng của ngân hàng tại `VaultManager`. Tuyệt đối không bao giờ lấy tiền gốc của người gửi sau trả lãi cho người gửi trước.
2. **Bất biến cân bằng tài sản ($I_3$)**: Số dư USDC thực tế tại `SavingCore` luôn bằng đúng tổng tiền gốc của toàn bộ các khoản gửi đang `Active`:
   $$\text{usdc.balanceOf}(\text{SavingCore}) == \sum_{c \in \text{Active}} c.\text{principal}$$
3. **Quản lý cam kết tập trung**: Biến `totalCommittedInterest` được lưu trữ tại `SavingCore` để toàn bộ 7 chuyển động tăng giảm nghĩa vụ đều là thao tác nội bộ (0 lời gọi ngoài), bảo đảm tính toàn vẹn và tiết kiệm gas.

---

## 4. CÔNG THỨC TOÁN HỌC & QUY TẮC LÀM TRÒN

1. **Lãi đơn (Simple Interest — Làm tròn Floor)**:
   $$\text{tenorSeconds} = \text{maturityAt} - \text{startAt}$$
   $$\text{interest} = \frac{\text{principal} \times \text{aprBpsAtOpen} \times \text{tenorSeconds}}{365 \times 86{,}400 \times 10{,}000}$$
   *Thực hiện phép nhân tử số trước, chia mẫu số sau một lần duy nhất. Bụi số dư làm tròn (`rounding dust`) nằm lại trong Vault, bảo đảm không bao giờ rút vượt số dư thực tế.*
2. **Phạt rút sớm (Early Withdrawal Penalty)**:
   $$\text{penalty} = \frac{\text{principal} \times \text{penaltyBpsAtOpen}}{10{,}000}$$
   $$\text{amountToUser} = \text{principal} - \text{penalty}$$
   *Tiền phạt chuyển thẳng tới ví `feeReceiver`. Nếu `penalty == 0`, bỏ qua lệnh chuyển token để tối ưu gas.*
3. **Tái tục vốn gốc (Compound Interest)**:
   $$\text{newPrincipal} = \text{oldPrincipal} + \text{oldInterest}$$
   *Lãi kỳ cũ được trích xuất từ Vault chuyển vào SavingCore để làm tài sản bảo chứng cho gốc kỳ mới.*

---

## 5. HƯỚNG DẪN KHỞI CHẠY ĐA TERMINAL TRUNG THỰC

Dự án yêu cầu chạy trên mạng local node. Vui lòng mở 3 cửa sổ Terminal độc lập:

### Bước 1: Khởi động node blockchain local (Terminal 1)
```bash
cd smartcontract
npm install
npm run node
# Hardhat node khởi chạy tại http://127.0.0.1:8545 với 20 tài khoản test (10,000 ETH/ví)
```

### Bước 2: Deploy và Seed dữ liệu qua Hardhat Ignition (Terminal 2)
```bash
cd smartcontract
npx hardhat ignition deploy ./ignition/modules/BankingSystem.ts --network localhost
```
*Ghi nhận địa chỉ deployed của hợp đồng `SavingCore` (thường là `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707`). Cập nhật địa chỉ này vào file `frontend/.env`:*
```env
VITE_SAVING_CORE_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
```

### Bước 3: Khởi chạy giao diện Web Frontend (Terminal 3)
```bash
cd frontend
npm install
npm run dev
# Mở trình duyệt tại http://localhost:5173
```

> [!TIP]
> **Xử lý sự cố lệch Nonce MetaMask khi restart node:**
> Nếu bạn khởi động lại `hardhat node`, blockchain sẽ reset về block 0 nhưng MetaMask vẫn lưu nonce cũ, dẫn đến lỗi giao dịch bị kẹt. Hãy vào **MetaMask $\rightarrow$ Settings $\rightarrow$ Advanced $\rightarrow$ Clear activity tab data** để reset nonce.

---

## 6. THIẾT KẾ & GIẢI TRÌNH VẤN ĐÁP (DESIGN ANSWERS — MỤC 8.2 CỦA ĐỀ)

Dưới đây là phần giải trình 7 vấn đề cốt lõi sinh viên tự soạn thảo (3–6 câu mỗi câu) kèm dẫn chứng chính xác mã nguồn và test case:

### Q1: NFT chuyển nhượng — Chuẩn Web3 hay rủi ro lừa đảo?
- **Giải trình**: Trong hệ thống, mỗi khoản tiền gửi được đúc thành một chứng chỉ NFT ERC-721 đại diện cho quyền sở hữu dòng tiền. Hợp đồng kiểm tra `require(ownerOf(depositId) == msg.sender)` tại thời điểm rút gốc, lãi và nhận nợ hoãn trả C1 ([SavingCore.sol:223](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L223), [SavingCore.sol:371](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L371)). Cơ chế này tạo ra thị trường thứ cấp tự do cho chứng chỉ tiền gửi on-chain (người mua trả tiền để hưởng dòng tiền tương lai). Tuy nhiên, rủi ro phát sinh khi người bán đã tất toán (`Withdrawn`) nhưng vẫn đem NFT đi bán cho người mua ngây thơ. Để phòng vệ, giao diện và indexer luôn lọc trạng thái on-chain, và người mua trên thị trường thứ cấp bắt buộc phải tra cứu hàm `getCertificate(id).status == Active` trước khi thanh toán.
- **Dòng code quyết định**: [SavingCore.sol:223](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L223) và [SavingCore.sol:371](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L371).
- **Test chứng minh**: `smartcontract/test/Phase2.core_flows.test.ts:508` (TC-17) và `smartcontract/test/Phase4.bonuses_c2_c1.test.ts:134` (TC-C1-03).

### Q2: Kịch bản Vault rỗng — Xử lý rủi ro giam giữ tiền gốc của người dùng
- **Giải trình**: Trong thiết kế cơ bản, nếu quỹ Vault thiếu tiền trả lãi, giao dịch rút đáo hạn sẽ revert toàn bộ, vô tình "giam cầm" luôn cả 100% tiền gốc hợp pháp của khách hàng. Hệ thống giải quyết triệt để vấn đề này bằng Bonus C1 ("Principal is always safe"): khi phát hiện số dư Vault nhỏ hơn tiền lãi, hợp đồng vẫn hoàn trả ngay lập tức 100% tiền gốc từ `SavingCore` về ví khách hàng. Toàn bộ số tiền lãi chưa trả được ghi nhận trọn vẹn vào mapping `unpaidInterest[depositId]` và phát sự kiện `InterestDeferred`. Khách hàng có thể quay lại gọi hàm `claimPendingInterest` để nhận đủ tiền lãi khi ngân hàng bổ sung thanh khoản.
- **Dòng code quyết định**: [SavingCore.sol:233-248](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L233-L248).
- **Test chứng minh**: `smartcontract/test/Phase2.core_flows.test.ts:194` (TC-06) và `smartcontract/test/Phase4.bonuses_c2_c1.test.ts:71` (TC-C1-01, TC-C1-02).

### Q3: Sự cố Bot ngừng hoạt động — Cơ chế Backdate tự động bù lãi
- **Giải trình**: Nếu bot tự động gia hạn gặp sự cố trong một thời gian dài (ví dụ sập 100 ngày sau khi hết ân hạn), người dùng truyền thống sẽ bị mất quyền lợi sinh lời trong toàn bộ thời gian gián đoạn đó. Hệ thống hiện thực cơ chế **Backdate** (`[D21]`): mỗi lần gọi `autoRenewDeposit`, hợp đồng lùi thời gian bắt đầu `newStartAt = oldCert.maturityAt` và đáo hạn mới tại `oldCert.maturityAt + oldTenor`. Bất kỳ ai cũng có thể gọi hàm này (permissionless). Nếu bot chết 100 ngày, chuỗi 4 lần gọi liên tiếp sẽ bù kín 100 ngày đó thành 4 kỳ hạn liên tục có tính lãi kép mà không mất một ngày nào. Thiết kế cố ý không trích phí thưởng gas (incentive fee) cho người gọi để bảo đảm sự toàn vẹn của bất biến tài sản I3.
- **Dòng code quyết định**: [SavingCore.sol:338-339](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L338-L339).
- **Test chứng minh**: `smartcontract/test/Phase2.core_flows.test.ts:404` (TC-14 — Chuỗi 4 lần bù 100 ngày).

### Q4: Xử lý số dư làm tròn (Rounding Dust) & Kiểm chứng toán học
- **Giải trình**: Phép chia số nguyên trong Solidity luôn làm tròn xuống (`floor`). Thuật toán tính lãi của hệ thống luôn nhân toàn bộ tử số trước rồi mới chia mẫu số một lần duy nhất ([SavingCore.sol:362](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L362)). Nhờ làm tròn floor, số tiền lãi thực trả không bao giờ vượt quá nghĩa vụ toán học, phần "bụi token" thừa nằm lại an toàn trong Vault và không bao giờ gây lỗi thiếu hụt wei dẫn đến revert. Bộ test suite đã kiểm chứng thực tế với tiền gốc lẻ `1_000_001` wei và kiểm tra chính xác ngưỡng biên `180` wei (lãi = 0) so với `181` wei (bắt đầu sinh 1 wei lãi).
- **Dòng code quyết định**: [SavingCore.sol:362](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L362).
- **Test chứng minh**: `smartcontract/test/Phase2.core_flows.test.ts:606` (TC-21: Rounding verification).

### Q5: Mốc thời gian biên (Boundary Timestamps)
- **Giải trình**: Ranh giới thời gian được quy định chuẩn xác bằng toán tử so sánh trong mã nguồn: Tại đúng giây đáo hạn `maturityAt`, biểu thức kiểm tra rút trước hạn `block.timestamp >= cert.maturityAt` ([SavingCore.sol:258](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L258)) sẽ trả về `true` và chặn lại bằng lỗi `AlreadyMatured()`, trong khi hàm rút đúng hạn ([SavingCore.sol:227](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L227)) sử dụng `block.timestamp < cert.maturityAt` sẽ trả về `false` và cho phép tất toán. Đối với tái tục tự động, điều kiện bắt buộc là `block.timestamp < oldCert.maturityAt + gracePeriod` ([SavingCore.sol:327](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L327)), bảo đảm trước khi hết 3 ngày ân hạn thì không ai được phép auto-renew sổ của người dùng. Riêng tái tục thủ công (`renewDeposit`) không có cận trên thời gian, cho phép người dùng tự tái tục bất kỳ lúc nào sau đáo hạn nếu bot chưa can thiệp.
- **Dòng code quyết định**: [SavingCore.sol:227](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L227), [SavingCore.sol:258](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L258), [SavingCore.sol:327](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L327).
- **Test chứng minh**: `smartcontract/test/Phase2.core_flows.test.ts:89` (TC-02), `smartcontract/test/Phase2.core_flows.test.ts:150` (TC-04), `smartcontract/test/Phase2.core_flows.test.ts:347` (TC-11).

### Q6: Vô hiệu hóa gói khi đang có khoản gửi hoạt động
- **Giải trình**: Khi Admin gọi `disablePlan(planId)` ([SavingCore.sol:186](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L186)), gói tiết kiệm chỉ bị khóa chiều nhận khoản gửi mới (`openDeposit` revert `PlanDisabled`). Các sổ tiết kiệm cũ đã mở vẫn duy trì trạng thái `Active` và giữ nguyên tỷ lệ snapshot `aprBpsAtOpen` cho đến khi đáo hạn rút bình thường. Nếu người dùng thực hiện tái tục thủ công vào gói đã tắt, hợp đồng sẽ từ chối ([SavingCore.sol:289](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L289)). Ngược lại, hàm tái tục tự động (`autoRenewDeposit`) cố ý bỏ qua kiểm tra `plan.enabled` và hạn mức min/max để ngăn chặn nguy cơ tiền của khách hàng bị giam giữ vĩnh viễn ngoài ý muốn.
- **Dòng code quyết định**: [SavingCore.sol:186](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L186), [SavingCore.sol:207](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L207), [SavingCore.sol:289](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L289).
- **Test chứng minh**: `smartcontract/test/Phase2.core_flows.test.ts:365` (TC-12) và `smartcontract/test/Phase2.core_flows.test.ts:580` (TC-20).

### Q7: Phân tích nguy cơ tấn công & Mẫu thiết kế phòng vệ
- **Giải trình**: Hệ thống áp dụng triệt để mẫu thiết kế Checks-Effects-Interactions (CEI) kết hợp OpenZeppelin `ReentrancyGuard` trên toàn bộ các hàm có luồng tiền ra vào hoặc đúc token. Vector tấn công callback nguy hiểm nhất xuất hiện qua hàm `_safeMint` trong `openDeposit` và `renewDeposit` (khi người nhận là contract triển khai `onERC721Received` gọi đệ quy ngược lại) đã bị chặn đứng hoàn toàn bởi `ReentrancyGuardReentrantCall()`. Biến trạng thái chứng chỉ `cert.status = DepositStatus.Withdrawn` luôn được ghi nhận trước mọi lệnh chuyển token để loại trừ rủi ro rút tiền hai lần (Double-withdrawal). Đồng thời, hàm chi trả tiền lãi `payoutInterest` tại VaultManager được bảo vệ nghiêm ngặt bằng chốt chặn phân quyền `if (msg.sender != savingCore) revert NotSavingCore()`, ngăn chặn mọi hành vi xâm nhập rút trộm quỹ từ bên ngoài.
- **Dòng code quyết định**: [VaultManager.sol:78](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/VaultManager.sol#L78) (`NotSavingCore`), [SavingCore.sol:229](file:///d:/AppsCyclone/banking-system/smartcontract/contracts/SavingCore.sol#L229) (CEI status).
- **Test chứng minh**: `smartcontract/test/Phase1.smoke.test.ts:439` (S10), `smartcontract/test/Phase2.core_flows.test.ts:559` (TC-19), `smartcontract/test/Phase2.core_flows.test.ts:474` (TC-16).

---

## 7. THÁCH THỨC SÁNG TẠO (CREATIVE CHALLENGES — MỤC 8.3 CỦA ĐỀ)

### Thách thức C1: Bảo vệ tiền gốc khi thiếu thanh khoản (Principal is Always Safe)
* **Vấn đề giải quyết (Problem)**: Khi ngân hàng cạn kiệt thanh khoản trả lãi, mô hình truyền thống revert cả giao dịch sẽ giam giữ luôn 100% tiền gốc của khách hàng, gây ra khủng hoảng niềm tin và rủi ro thanh khoản nghiêm trọng.
* **Giải pháp kỹ thuật (Solution)**: Tách bạch dòng tiền: 100% tiền gốc được hoàn trả ngay từ `SavingCore` về ví người dùng. Toàn bộ tiền lãi chưa thanh toán được chuyển sang trạng thái nợ `unpaidInterest[depositId]` và phát sự kiện `InterestDeferred`. Khách hàng giữ chứng chỉ NFT có thể gọi `claimPendingInterest` để nhận tiền khi quỹ được bổ sung vốn.
* **Đánh đổi kỹ thuật (Trade-offs)**:
  - *Cơ chế All-or-Nothing*: Người dùng chỉ được nhận nợ khi Vault có đủ tiền trả trọn vẹn khoản nợ đó, ngăn ngừa sự phân mảnh trạng thái và tranh chấp wei lẻ.
  - *Nguyên tắc First-Come-First-Served (FCFS)*: Khi Vault chỉ được nạp một phần tiền, ai gọi claim trước sẽ được thanh toán trước. Đây là sự đánh đổi có chủ đích để tránh vòng lặp chia tỷ lệ (Pro-rata loop) gây lỗi Out-of-Gas DoS trên smart contract.

### Thách thức C2: Bảo vệ quỹ cam kết (Solvency Guard)
* **Vấn đề giải quyết (Problem)**: Ngăn chặn Admin ngân hàng lạm quyền rút cạn tiền khỏi quỹ trả lãi (`withdrawVault`), làm mất khả năng thanh toán cho các khoản tiền gửi đang hoạt động.
* **Giải pháp kỹ thuật (Solution)**: `SavingCore` duy trì biến trạng thái `totalCommittedInterest` đại diện cho tổng nghĩa vụ trả lãi của toàn bộ các khoản tiền gửi đang `Active` cộng với tổng số nợ hoãn trả C1. Hàm `withdrawVault` của `VaultManager` bắt buộc phải vượt qua chốt chặn staticcall 2 lớp an toàn: `amount <= balance` và `balance - amount >= totalCommittedInterest`.
* **Hạn chế đã biết (Known Caveat bắt buộc lưu ý)**:
  - C2 **chống Admin rút cạn vốn, không chống được undercollateralization do compound khi renew**: Khi khách hàng tái tục, lãi cũ nhập gốc làm tăng lãi cam kết kỳ mới ($I_{new} > I_{old}$) trong khi số dư thực tế trong Vault chưa tăng nếu Admin chưa nạp thêm vốn. Khi `balance < committed`, hàm `withdrawVault` sẽ tự động khóa hoàn toàn (kể cả rút 0 đồng — test `TC-C2-10`) cho đến khi Admin nạp thêm vốn qua `fundVault`.

---

## 8. KỊCH BẢN VIDEO DEMO THỰC CHIẾN (3–5 PHÚT)

Phân bổ 3 ví Hardhat tách bạch nhằm chứng minh dòng tiền rõ ràng:
- **Ví 0 (`0xf39F...2266`)**: Admin ngân hàng (Deployer, nạp Vault, thao tác Pause).
- **Ví 1 (`0x7099...79C8`)**: Người dùng Demo (Faucet, mở sổ, tất toán, chịu phạt).
- **Ví 2 (`0x3C44...93BC`)**: Ví nhận phạt rút sớm (`feeReceiver`).

| Cảnh | Thời lượng | Nội dung thao tác trên giao diện | Ví thực hiện | Kết quả kỳ vọng xác minh |
|---|:---:|---|---|---|
| **Cảnh 1: Mở sổ tiết kiệm** | 1.0 phút | Faucet 1,000 USDC $\rightarrow$ Mở sổ Plan 0 (90 ngày) $\rightarrow$ Approve USDC $\rightarrow$ Confirm Open. | Ví 1 (User) | Hiện chứng chỉ NFT #1, Countdown timer ~90 ngày, Snapshot APR 2.25%, Lãi dự kiến: **5.547945 USDC**. |
| **Cảnh 2: Nhảy thời gian & Rút đúng hạn** | 1.0 phút | Bật modal `DevTimeTravel`, tua nhanh **+90 Ngày** $\rightarrow$ Countdown chuyển sang badge xanh *"Đã Đáo Hạn"* $\rightarrow$ Bấm "Rút Đúng Hạn". | Ví 1 (User) | Nhận về 1,000 USDC gốc và **5.547945 USDC** lãi từ Vault. Sổ chuyển sang tab *"Lịch Sử Tất Toán"*. |
| **Cảnh 3: Rút trước hạn chịu phạt** | 1.0 phút | Mở sổ mới 1,000 USDC (NFT #2) $\rightarrow$ Bấm "Rút Trước Hạn" ngay $\rightarrow$ Xác nhận phạt 5.00%. | Ví 1 (User) | Ví 1 nhận về 950 USDC, số dư Ví 2 (`feeReceiver`) tăng đúng **50 USDC**. |
| **Cảnh 4: Tái tục & Admin Solvency Guard C2** | 1.5 phút | Mở sổ mới 1,000 USDC, nhảy thời gian +90 ngày $\rightarrow$ Bấm "Tái Tục (Renew)" sang Plan 1 $\implies$ Gốc mới **1,005.547945 USDC**.<br>Chuyển sang Ví 0 (Admin): Mở tab Admin Panel, chỉ rõ `Vault Balance` và `totalCommittedInterest`. Thử rút vượt mức cam kết $\implies$ Solvency Guard C2 chặn rút. | Ví 1 $\rightarrow$ Ví 0 (Admin) | Gốc mới compound chính xác. Solvency Guard C2 hiển thị thông báo an toàn, bảo vệ thanh khoản. |

---

## 9. KẾT QUẢ KIỂM THỬ & ĐỘ BAO PHỦ MÃ NGUỒN (COVERAGE 96.88%)

Hệ thống sở hữu bộ kiểm thử tự động toàn diện gồm **71 tests passing (100%)** với độ bao phủ hoàn hảo:

```
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║                                    Coverage Report                                    ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║ File Coverage                                                                         ║
╟───────────────────────────────────────┬────────┬─────────────┬────────────────────────╢
║ File Path                             │ Line % │ Statement % │ Uncovered Lines        ║
╟───────────────────────────────────────┼────────┼─────────────┼────────────────────────╢
║ contracts\upgradeable\Box.sol         │ 100.00 │ 100.00      │ -                      ║
║ contracts\MockUSDC.sol                │ 100.00 │ 100.00      │ -                      ║
║ contracts\upgradeable\BoxV2.sol       │ 100.00 │ 100.00      │ -                      ║
║ contracts\VaultManager.sol            │ 100.00 │ 100.00      │ -                      ║
║ contracts\SavingCore.sol              │ 100.00 │ 100.00      │ -                      ║
║ contracts\mocks\ReentrantReceiver.sol │ 93.10  │ 90.91       │ 64-65                  ║
╟───────────────────────────────────────┼────────┼─────────────┼────────────────────────╢
║ Total                                 │ 96.88  │ 96.69       │                        ║
╚═══════════════════════════════════════╧════════╧═════════════╧════════════════════════╝
```

---

## 10. BẢN ĐỒ ÁNH XẠ (TRACEABILITY MATRIX)

- **Q-ID**: Q1 (NFT transfer) $\rightarrow$ L223; Q2 (Empty vault C1) $\rightarrow$ L233; Q3 (Dead bot backdate) $\rightarrow$ L338; Q4 (Rounding floor) $\rightarrow$ TC-21; Q5 (Boundaries) $\rightarrow$ L227, 258, 327; Q6 (Disabled plan) $\rightarrow$ L186, 289; Q7 (CEI/Reentrancy) $\rightarrow$ L229, L78.
- **Bonus**: C1 (Deferred Interest / All-or-nothing) $\rightarrow$ L233-248, L369-385; C2 (Solvency Guard) $\rightarrow$ VaultManager L64-71, SavingCore L105.
- **Decisions**: D1–D34 đăng ký đầy đủ tại Mục 15 của `PROJECT_OVERVIEW.md`.

