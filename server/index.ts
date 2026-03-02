import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import logger from './utils/logger.js';
import db from './db/database.js';
import { createOrdersRouter } from './routes/orders.js';
import { createWebhookRouter } from './routes/webhook.js';
import { errorHandler } from './middleware/errorHandler.js';
import { calculatePriorityScore } from './services/priorityEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// ─── Express App Setup ───────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

// Socket.io with CORS
const io = new SocketServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// ─── Security Middleware ──────────────────────────────────────────────────────

app.use(
  helmet({
    contentSecurityPolicy: NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  })
);

// ─── Request Parsing ──────────────────────────────────────────────────────────

// Raw body for LINE webhook signature verification (must be BEFORE express.json)
app.use('/webhook', express.raw({ type: 'application/json', limit: '1mb' }));

// JSON for all other routes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ─────────────────────────────────────────────────────────

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')?.substring(0, 60),
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/orders', createOrdersRouter(io));
app.use('/webhook', createWebhookRouter(io));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── Serve Frontend (Production) ─────────────────────────────────────────────

const distPath = join(__dirname, '../dist');
if (existsSync(distPath)) {
  logger.info(`Serving static frontend from ${distPath}`);
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  logger.info('Frontend dist not found — running in API-only mode');
  app.get('/', (_req, res) => {
    res.json({
      message: '🥥 Coconut Shop Manager API',
      docs: 'See README.md for API documentation',
      health: '/api/health',
    });
  });
}

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  logger.info(`Dashboard connected: ${socket.id}`);

  // Send current active orders on connect
  try {
    const activeOrders = db
      .prepare(`
        SELECT * FROM orders
        WHERE status IN ('waiting', 'making')
        ORDER BY priority_score DESC, created_at ASC
      `)
      .all();

    socket.emit('orders:init', activeOrders.map((row: any) => ({
      id: String(row.id),
      queueNumber: row.queue_number,
      customerName: row.customer_name,
      customerLineId: row.customer_line_id,
      items: JSON.parse(row.items),
      totalPrice: row.total_price,
      pickupTime: row.pickup_time,
      status: row.status,
      priorityScore: row.priority_score,
      note: row.note,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    logger.error('Failed to send init orders', { error: String(err) });
  }

  socket.on('disconnect', (reason) => {
    logger.info(`Dashboard disconnected: ${socket.id}`, { reason });
  });
});

// Recalculate priority scores every 5 minutes (pickup times become more urgent)
setInterval(() => {
  void (async () => { try {
    const activeOrders = db
      .prepare(`SELECT id, pickup_time FROM orders WHERE status IN ('waiting', 'making')`)
      .all() as { id: number; pickup_time: string | null }[];

    if (activeOrders.length === 0) return;

    const updateStmt = db.prepare(
      `UPDATE orders SET priority_score = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now', 'localtime') WHERE id = ?`
    );

    const updateMany = db.transaction(() => {
      for (const order of activeOrders) {
        const newScore = calculatePriorityScore(order.pickup_time);
        updateStmt.run(newScore, order.id);
      }
    });

    updateMany();

    // Emit updated order list to all clients
    const updated = db
      .prepare(`
        SELECT * FROM orders
        WHERE status IN ('waiting', 'making')
        ORDER BY priority_score DESC, created_at ASC
      `)
      .all();

    io.emit('orders:resorted', updated.map((row: any) => ({
      id: String(row.id),
      queueNumber: row.queue_number,
      customerName: row.customer_name,
      items: JSON.parse(row.items),
      totalPrice: row.total_price,
      pickupTime: row.pickup_time,
      status: row.status,
      priorityScore: row.priority_score,
      note: row.note,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));

    logger.debug(`Priority scores updated for ${activeOrders.length} orders`);
  } catch (err) {
    logger.error('Priority recalculation error', { error: String(err) });
  } })();
}, 5 * 60 * 1000);

// ─── Start Server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info(`🥥 Coconut Shop Manager started`, {
    port: PORT,
    environment: NODE_ENV,
    cors: CORS_ORIGIN,
  });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  httpServer.close(() => {
    db.close();
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: String(err), stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
