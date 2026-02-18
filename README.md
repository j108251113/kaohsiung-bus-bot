# 🚌 高雄公車到站查詢 Telegram Bot

在低頻寬環境下，透過 Telegram 純文字指令即時查詢高雄市公車到站時間。

## ✨ 功能

- **`/bus 路線名`** — 查詢任意路線全站到站時間
- **`/setup`** — 設定通勤站牌對（上車站 + 下車站）
- **`/go`** — 一鍵查通勤到站（自動判斷上下班方向）
- **`/back`** — 查反方向
- **子路線支援** — 如紅3 的 4 個子路線自動分群選擇
- **多路線比較** — 通勤模式同時顯示所有能到的公車

## 🏗️ 技術架構

- **Runtime**: Cloudflare Workers（Serverless，免費方案）
- **Language**: TypeScript
- **Storage**: Cloudflare KV（使用者設定）
- **Data Source**: 高雄 iBus+ 公開 API（CityGPT + CustomEstimateTime）

## 📦 部署步驟

### 1. 申請 Telegram Bot Token

在 Telegram 搜尋 [@BotFather](https://t.me/BotFather)，輸入 `/newbot`，依照指示取得 Token。

### 2. 安裝依賴

```bash
npm install
```

### 3. 建立 KV Namespace

```bash
npx wrangler kv namespace create "USER_SETTINGS"
```

將輸出的 `id` 填入 `wrangler.toml` 的 `[[kv_namespaces]]` 區段。

### 4. 設定 Bot Token

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
# 貼上你的 Bot Token
```

### 5. 部署

```bash
npx wrangler deploy
```

### 6. 設定 Webhook

部署成功後，用瀏覽器打開：

```
https://你的worker.workers.dev/setup-webhook
```

或手動執行：

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://你的worker.workers.dev/webhook"
```

### 7. 測試

在 Telegram 搜尋你的 Bot，輸入 `/start` 開始使用！

## 🔧 本地開發

```bash
# 建立 .dev.vars 放本地用的 secrets
echo 'TELEGRAM_BOT_TOKEN=你的token' > .dev.vars

# 啟動本地開發伺服器
npm run dev
```

## 📁 專案結構

```
src/
├── index.ts              # Worker 入口 + Webhook handler
├── types.ts              # TypeScript 型別定義
├── api/
│   ├── ibus.ts           # iBus+ API（GuestToken、到站時間）
│   └── citygpt.ts        # CityGPT API（路線、站牌）
├── bot/
│   ├── commands.ts       # Bot 指令處理
│   └── keyboard.ts       # Inline Keyboard 建構
├── store/
│   └── user.ts           # KV 使用者設定存取
└── utils/
    ├── direction.ts      # 通勤方向判斷
    └── format.ts         # 訊息格式化
```

## ⚠️ 已知限制

- API Key 為 iBus+ 前端公開的 Key，可能被更換
- GuestToken 有效期未知，程式已內建自動重試機制
- Cloudflare Workers 免費方案：每日 10 萬次請求

## 📄 授權

MIT License
