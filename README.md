# 🥥 ระบบจัดการออเดอร์ร้านมะพร้าวหอม
# Coconut Shop Order Management System

A complete production-ready order management dashboard for a coconut retail shop in Thailand. Integrates with LINE Official Account to receive orders automatically, parse them, prioritize by pickup time, and display in a real-time dashboard.

---

## 📐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LINE Official Account                     │
│              Customer sends order via LINE Chat              │
└─────────────────────┬───────────────────────────────────────┘
                       │ Webhook POST /webhook
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express Backend (Port 3001)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  LINE        │  │  Priority    │  │  REST API          │ │
│  │  Webhook     │→ │  Engine      │→ │  /api/orders       │ │
│  │  Handler     │  │  (30min rule)│  │  /api/orders/stats │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
│         │                                        │           │
│  ┌──────▼──────────────────────────┐  ┌─────────▼─────────┐ │
│  │       SQLite Database            │  │   Socket.io       │ │
│  │    (better-sqlite3 / WAL mode)   │  │   Real-time WS    │ │
│  └─────────────────────────────────┘  └─────────────────── ┘ │
└────────────────────────────────────────────────┬────────────┘
                                                 │ WebSocket
                                                 ▼
┌─────────────────────────────────────────────────────────────┐
│               React Dashboard (Port 3000 dev)               │
│      Large-text, elderly-friendly, real-time updates        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Project Structure

```
Order/
├── server/                    # Backend (Express + TypeScript)
│   ├── index.ts               # Server entry point
│   ├── db/
│   │   └── database.ts        # SQLite setup (WAL mode)
│   ├── routes/
│   │   ├── orders.ts          # REST API for orders
│   │   └── webhook.ts         # LINE webhook handler
│   ├── services/
│   │   ├── lineService.ts     # LINE API & signature verification
│   │   ├── orderParser.ts     # Parse Thai/English order messages
│   │   └── priorityEngine.ts  # Priority score calculation
│   ├── middleware/
│   │   └── errorHandler.ts    # Global error handler
│   └── utils/
│       └── logger.ts          # Winston logger
├── src/                       # Frontend (React + Vite)
│   ├── App.tsx                # Main app with socket integration
│   ├── types.ts               # Type definitions
│   ├── components/
│   │   ├── Header.tsx         # Live clock, stats bar
│   │   ├── OrderCard.tsx      # Order card with urgency indicators
│   │   ├── OrderGrid.tsx      # Grid layout for orders
│   │   ├── CompletedOrders.tsx # Collapsible history
│   │   ├── Notification.tsx   # Toast notifications
│   │   └── ConnectionStatus.tsx # WebSocket status bar
│   ├── hooks/
│   │   └── useSocket.ts       # Socket.io hook
│   └── services/
│       └── api.ts             # REST API client
├── prisma/
│   └── schema.prisma          # PostgreSQL schema (for scaling)
├── data/                      # SQLite database (gitignored)
├── logs/                      # Log files (gitignored)
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── vite.config.ts
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm 10+

### 1. Clone & Install

```bash
cd /path/to/Order
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your LINE credentials:
```env
LINE_CHANNEL_SECRET=your_actual_secret
LINE_CHANNEL_ACCESS_TOKEN=your_actual_token
```

### 3. Start Development

**Terminal 1 — Frontend (Vite):**
```bash
npm run dev
```

**Terminal 2 — Backend (Express):**
```bash
npm run dev:server
```

Or run both at once:
```bash
npm run dev:all
```

**Dashboard URL:** http://localhost:3000  
**API URL:** http://localhost:3001/api  

---

## 🌐 LINE Webhook Setup

### 1. Create LINE Official Account
- Go to [LINE Developers Console](https://developers.line.biz)
- Create a Messaging API channel
- Copy **Channel Secret** and **Channel Access Token**

### 2. Expose Local Server (Development)

Install ngrok: https://ngrok.com/download

```bash
ngrok http 3001
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 3. Configure Webhook URL
In LINE Developers Console:
- **Webhook URL:** `https://abc123.ngrok.io/webhook`
- Enable **Use webhook**
- Click **Verify** to test

---

## 📱 Supported LINE Message Formats

Customers can send orders in Thai or English:

**Format 1 (Structured Thai):**
```
ชื่อ: คุณสมศรี
สั่ง: น้ำมะพร้าวปั่น 2 แก้ว
รับเวลา: 10:30
หมายเหตุ: หวานน้อย
```

**Format 2 (Casual Thai):**
```
น้ำมะพร้าวปั่น 2 แก้ว รับ 11:00 ชื่อ นิดา
```

**Format 3 (English):**
```
Name: John
Order: coconut smoothie x2, grated coconut 1kg
Pickup: 10:30
```

### Products & Prices
| Product | Thai | Price |
|---------|------|-------|
| Coconut Smoothie | น้ำมะพร้าวปั่น | ฿50/แก้ว |
| Whole Coconut | มะพร้าวทั้งลูก | ฿40/ลูก |
| Grated Coconut | มะพร้าวขูด | ฿80/กก. |
| Fresh Coconut Milk | กะทิสด | ฿100/กก. |

---

## 🎯 Priority Engine

Orders are sorted by pickup urgency:

| Condition | Priority Score | Display |
|-----------|---------------|---------|
| Overdue (past pickup time) | 10000+ | 🔴 Red, pulsing |
| Within 30 minutes | 1000–1300 | 🟠 Orange ring |
| 30+ minutes away | 0–999 | Normal |
| No pickup time | 0 | FIFO order |

Priority scores recalculate automatically every 5 minutes.

---

## 📡 API Documentation

### Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | Active orders (waiting + making), sorted by priority |
| GET | `/api/orders/history` | Completed/cancelled orders (last 7 days) |
| GET | `/api/orders/stats` | Daily statistics |
| POST | `/api/orders` | Create manual order (walk-in) |
| PATCH | `/api/orders/:id/status` | Update order status |
| DELETE | `/api/orders/:id` | Cancel an order |

### Webhook

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook` | LINE webhook receiver |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |

---

### Example: Create Manual Order

```bash
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "คุณสมศรี",
    "items": [
      {"name": "น้ำมะพร้าวปั่น", "quantity": 2, "unit": "แก้ว", "pricePerUnit": 50},
      {"name": "มะพร้าวขูด", "quantity": 1, "unit": "กก.", "pricePerUnit": 80}
    ],
    "pickupTime": "10:30",
    "note": "หวานน้อย"
  }'
```

### Example LINE Webhook Payload

```json
{
  "destination": "U123456789",
  "events": [
    {
      "type": "message",
      "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
      "source": {
        "type": "user",
        "userId": "U4af4980629..."
      },
      "message": {
        "type": "text",
        "text": "ชื่อ: คุณสมศรี\nสั่ง: น้ำมะพร้าวปั่น 2 แก้ว\nรับเวลา: 10:30"
      }
    }
  ]
}
```

---

## 🐳 Docker Deployment

### Build & Run

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env with LINE credentials

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop
docker-compose down
```

Access dashboard at: http://localhost:3001

### Scale to PostgreSQL

1. Install Prisma:
   ```bash
   npm install prisma @prisma/client
   ```

2. Set `DATABASE_URL` in `.env`:
   ```env
   DATABASE_URL=postgresql://user:pass@localhost:5432/coconut_shop
   ```

3. Run migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

---

## 🔌 WebSocket Events

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `orders:init` | `Order[]` | Full order list on connect |
| `order:new` | `Order` | New LINE order arrived |
| `orders:update` | `{type, order?, orderId?}` | Status change |
| `orders:resorted` | `Order[]` | Priority recalculated |

### Update Types
- `created` — new order
- `status_changed` — waiting/making/done/cancelled
- `cancelled` — order cancelled

---

## 🛡️ Security Features

- **LINE Signature Verification** — HMAC-SHA256, timing-safe comparison
- **Helmet.js** — HTTP security headers
- **CORS** — Restricted to configured origin
- **Input Validation** — Items, quantities, status values
- **Error Sanitization** — Stack traces only in development
- **Non-root Docker** — Runs as unprivileged user

---

## 📊 Logging

Logs are stored in `./logs/`:
- `combined.log` — All log levels
- `error.log` — Error level only

Log format: JSON with timestamps. Console output is colorized.

Set log level via `.env`:
```env
LOG_LEVEL=debug   # error|warn|info|debug
```

---

## 🧪 Testing

### Test the API manually:

```bash
# Health check
curl http://localhost:3001/api/health

# Create test order
curl -X POST http://localhost:3001/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test", "items":[{"name":"น้ำมะพร้าวปั่น","quantity":1,"unit":"แก้ว","pricePerUnit":50}], "pickupTime":"10:30"}'

# Get all orders
curl http://localhost:3001/api/orders

# Update status
curl -X PATCH http://localhost:3001/api/orders/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"making"}'
```

### Simulate LINE webhook (dev mode, no secret needed):

```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "x-line-signature: dev" \
  -d '{
    "destination": "U123",
    "events": [{
      "type": "message",
      "replyToken": "test-token",
      "source": {"type": "user", "userId": "U001"},
      "message": {"type": "text", "text": "น้ำมะพร้าวปั่น 2 แก้ว รับ 10:30 ชื่อ: คุณทดสอบ"}
    }]
  }'
```

---

## 🏗️ Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set real `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN`
- [ ] Set `CORS_ORIGIN` to your actual domain
- [ ] Use HTTPS with valid SSL certificate
- [ ] Configure LINE webhook URL to your HTTPS domain
- [ ] Set up daily database backups (`data/shop.db`)
- [ ] Monitor `logs/error.log`
- [ ] Set up process restart (PM2 or Docker restart policy)

---

*Built for ร้านมะพร้าวหอม — A real coconut shop in Thailand 🥥*
