# 🏦 On-Chain Term Deposit Keeper Bot (Autonomous 24/7 Worker)

Keeper Worker chuyên trách kích hoạt **Auto-Renew (Tái tục tự động)** cho hệ thống tiết kiệm kỳ hạn on-chain.

---

## 🌟 Tính Năng Nổi Bật

1. **Tự động quét và phát hiện các chứng chỉ đến hạn:**
   - Quét các chứng chỉ NFT có trạng thái `Active`.
   - Kiểm tra điều kiện đáo hạn + ân hạn: `block.timestamp >= maturityAt + gracePeriod`.
2. **Cơ chế An Toàn Chống Mất Gas (Pre-flight Dry-Run Simulation):**
   - Trước khi gửi transaction thật, bot luôn thực hiện `autoRenewDeposit.staticCall(id)` (`eth_call`).
   - Nếu Vault tạm thời thiếu thanh khoản hoặc hệ thống bị paused, mô phỏng sẽ revert. Bot sẽ lập tức bỏ qua và in cảnh báo thay vì gửi transaction gây tốn gas vô ích.
3. **Bảo vệ Biến động Phí Gas (Gas Price Safeguard):**
   - Tự động hoãn kích hoạt nếu gas mạng vượt ngưỡng trần `MAX_GAS_PRICE_GWEI`.
4. **Cơ chế Bù Lãi (Backdated Accounting Support):**
   - Hợp đồng thông minh `SavingCore` tự động tính ngày bắt đầu của sổ mới bằng đúng ngày đáo hạn của sổ cũ (`newStartAt = oldCert.maturityAt`), đảm bảo quyền lợi khách hàng trọn vẹn dù bot chạy bất đồng bộ hoặc trễ.
5. **Thông Báo Đa Kênh (Discord / Telegram Webhook):**
   - Tự động ping thông báo khi có giao dịch Auto-Renew thành công on-chain.

---

## 🚀 Hướng Dẫn Khởi Chạy

### Cách 1: Chạy trực tiếp với Node.js (Local Development)

```bash
cd keeper
npm install
npm start
```

### Cách 2: Chạy với Docker (Khuyên dùng cho môi trường 24/7)

```bash
cd keeper

# Build Docker image
docker build -t term-deposit-keeper .

# Chạy container ngầm 24/7
docker run -d \
  --name term-deposit-keeper \
  --restart unless-stopped \
  --env-file .env \
  term-deposit-keeper
```

Hoặc dùng Docker Compose:

```bash
docker compose up -d
# Xem log trực tiếp
docker compose logs -f
```

---

## ⚙️ Cấu Hình Biến Môi Trường (`.env`)

| Biến | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `RPC_URL` | `http://127.0.0.1:8545` | Endpoint RPC (Hardhat Local hoặc Sepolia) |
| `SAVING_CORE_ADDRESS` | `0x5FC8d3...` | Địa chỉ hợp đồng SavingCore |
| `KEEPER_PRIVATE_KEY` | *(Account #3)* | Private key ví bot (phải có ETH để trả phí gas) |
| `POLL_INTERVAL_MS` | `3000` | Chu kỳ quét blockchain (ms) |
| `MAX_GAS_PRICE_GWEI` | `100` | Mức trần gas price cho phép gửi tx |
| `DISCORD_WEBHOOK_URL` | *None* | (Tùy chọn) Webhook Discord nhận thông báo |
| `TELEGRAM_BOT_TOKEN` | *None* | (Tùy chọn) Token Bot Telegram |
| `TELEGRAM_CHAT_ID` | *None* | (Tùy chọn) Chat ID Telegram nhận thông báo |

---

## 🌐 Hướng Dẫn Deploy Lên Cloud 24/7

### 1. Deploy lên Railway (Nhanh nhất - Không cần server)
1. Đăng nhập [railway.app](https://railway.app) và chọn **New Project** ➔ **Deploy from GitHub repo**.
2. Chọn thư mục Root Directory là `/keeper`.
3. Trong tab **Variables**, nhập các biến từ `.env`:
   - `RPC_URL`: Endpoint RPC Sepolia (ví dụ từ Alchemy / Infura).
   - `SAVING_CORE_ADDRESS`: Địa chỉ `SavingCore` đã deploy trên Sepolia.
   - `KEEPER_PRIVATE_KEY`: Private key ví Sepolia của bot (đã faucet một ít Sepolia ETH).
4. Railway sẽ tự động build từ `Dockerfile` và duy trì container chạy 24/7.

### 2. Deploy lên VPS (Ubuntu / Debian)
```bash
git clone <repo-url>
cd banking-system/keeper
cp .env.example .env
# Chỉnh sửa file .env với thông tin Sepolia
nano .env

# Chạy bằng Docker Compose
docker compose up -d
```

