# 🚌 高雄公車到站查詢 Telegram Bot

在低頻寬環境下，透過 Telegram 純文字指令即時查詢高雄市公車到站時間。

## ✨ 功能

## 📋 指令一覽

| 指令 | 說明 |
|---|---|
| `/start` | 歡迎訊息與快速開始按鈕 |
| `/help` | 顯示使用說明 |
| `/bus 路線名` | 查詢路線全站到站時間（例：`/bus 紅3`），選擇去程／返程後顯示 |
| `/setup` | 設定通勤站牌對（上車站 + 下車站），依序輸入站名並選擇 |
| `/go` | 查通勤到站，依時間自動判斷方向（切換時間前為上班、之後為下班，預設 12:00） |
| `/back` | 查反方向 |
| `/list` | 查看目前儲存的設定（上下車站、切換時間、匹配路線） |
| `/delete` | 刪除所有個人設定 |

## ✨ 功能

- **子路線支援** — 如紅3 的子路線會自動分群讓你選擇
- **多路線比較** — 通勤模式同時顯示所有能到的公車，依到站時間排序
- **重新整理按鈕** — `/bus` 結果附「重新整理」，通勤結果附方向切換按鈕
- **限流** — 每位使用者每分鐘最多 20 則訊息、30 次按鈕操作，超過會被忽略

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
│   ├── ibus.ts           # iBus+ API（GuestToken、到站時間；每個路線＋方向各送一個請求）
│   └── citygpt.ts        # CityGPT API（路線、站牌）
├── bot/
│   ├── commands.ts       # Bot 指令處理
│   └── keyboard.ts       # Inline Keyboard 建構
├── store/
│   └── user.ts           # KV 使用者設定存取
└── utils/
    ├── direction.ts      # 通勤方向判斷
    ├── format.ts         # 訊息格式化
    └── ratelimit.ts      # 每分鐘請求限流（KV）
```

## ⚠️ 已知限制

- API Key 為 iBus+ 前端公開的 Key，可能被更換
- 每次查詢都會重新取得 GuestToken，不快取
- **不要把多個「路線＋方向」放進同一個 `CustomEstimateTime` 請求**：實測批次請求會回傳過期或不一致的預估時間（相差數分鐘到半小時以上，甚至顯示已駛過站的車），單獨請求才與官方 `RealEstimateTime` 一致。因此 `getEstimateTime` 對每個路線＋方向各送一個請求
- 預估時間為空且「下一班」時間已過時，會顯示「未發車」
- Cloudflare Workers 免費方案：每日 10 萬次請求；每次查詢的子請求數量有上限（免費方案 50 個），通勤路線過多時需留意

## 📄 授權

MIT License
