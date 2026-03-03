import { Router, Request, Response } from 'express';
import { Server as SocketServer } from 'socket.io';
import db from '../db/database.js';
import { calculatePriorityScore } from '../services/priorityEngine.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';
import { sendPushMessage, buildMakingFlexMessage, buildDoneFlexMessage, buildCancelledFlexMessage } from '../services/lineService.js';

interface OrderRow {
  id: number;
  queue_number: string;
  customer_name: string | null;
  customer_line_id: string | null;
  items: string;
  total_price: number;
  pickup_time: string | null;
  status: 'waiting' | 'making' | 'done' | 'cancelled';
  priority_score: number;
  note: string | null;
  source: string;
  raw_message: string | null;
  created_at: string;
  updated_at: string;
}

function serializeOrder(row: OrderRow) {
  return {
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
    rawMessage: row.raw_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function generateQueueNumber(): string {
  const today = new Date().toISOString().split('T')[0];
  const result = db
    .prepare("SELECT COUNT(*) as cnt FROM orders WHERE date(created_at) = ?")
    .get(today) as { cnt: number };
  const count = (result?.cnt || 0) + 1;

  if (count <= 99) return `A${String(count).padStart(2, '0')}`;
  if (count <= 198) return `B${String(count - 99).padStart(2, '0')}`;
  return `C${String(count - 198).padStart(2, '0')}`;
}

export function createOrdersRouter(io: SocketServer): Router {
  const router = Router();

  // GET /api/orders — get active orders sorted by priority
  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      const rows = db
        .prepare(`
          SELECT * FROM orders
          WHERE status IN ('waiting', 'making')
          ORDER BY priority_score DESC, created_at ASC
        `)
        .all() as OrderRow[];

      res.json(rows.map(serializeOrder));
    })
  );

  // GET /api/orders/history — completed & cancelled orders (last 7 days)
  router.get(
    '/history',
    asyncHandler(async (_req: Request, res: Response) => {
      const rows = db
        .prepare(`
          SELECT * FROM orders
          WHERE status IN ('done', 'cancelled')
            AND date(created_at) >= date('now', '-7 days')
          ORDER BY updated_at DESC
          LIMIT 100
        `)
        .all() as OrderRow[];

      res.json(rows.map(serializeOrder));
    })
  );

  // GET /api/orders/stats — daily statistics
  router.get(
    '/stats',
    asyncHandler(async (_req: Request, res: Response) => {
      const today = new Date().toISOString().split('T')[0];

      const stats = db
        .prepare(`
          SELECT
            COUNT(*) as total_orders,
            COUNT(CASE WHEN status = 'done' THEN 1 END) as completed_orders,
            COUNT(CASE WHEN status IN ('waiting', 'making') THEN 1 END) as active_orders,
            COALESCE(SUM(CASE WHEN status = 'done' THEN total_price ELSE 0 END), 0) as daily_revenue
          FROM orders
          WHERE date(created_at) = ?
        `)
        .get(today) as {
          total_orders: number;
          completed_orders: number;
          active_orders: number;
          daily_revenue: number;
        };

      res.json({
        totalOrders: stats.total_orders,
        completedOrders: stats.completed_orders,
        activeOrders: stats.active_orders,
        dailyRevenue: stats.daily_revenue,
        date: today,
      });
    })
  );

  // POST /api/orders — create order manually (walk-in customer)
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { customerName, items, pickupTime, note } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw createError('รายการสินค้าไม่ถูกต้อง (Invalid items)', 400, 'INVALID_ITEMS');
      }

      for (const item of items) {
        if (!item.name || typeof item.quantity !== 'number' || item.quantity <= 0) {
          throw createError('ข้อมูลสินค้าไม่ถูกต้อง (Invalid item data)', 400, 'INVALID_ITEM_DATA');
        }
      }

      const queueNumber = generateQueueNumber();
      const totalPrice = items.reduce(
        (sum: number, item: { pricePerUnit: number; quantity: number }) =>
          sum + (item.pricePerUnit || 0) * item.quantity,
        0
      );
      const priorityScore = calculatePriorityScore(pickupTime || null);
      const now = new Date().toISOString().replace('T', ' ').split('.')[0];

      const result = db
        .prepare(`
          INSERT INTO orders
            (queue_number, customer_name, items, total_price, pickup_time,
             priority_score, note, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
        `)
        .run(
          queueNumber,
          customerName || null,
          JSON.stringify(items),
          totalPrice,
          pickupTime || null,
          priorityScore,
          note || null,
          now,
          now
        );

      const newOrder = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(result.lastInsertRowid) as OrderRow;

      const serialized = serializeOrder(newOrder);

      // Notify all connected clients
      io.emit('order:new', serialized);
      io.emit('orders:update', { type: 'created', order: serialized });

      logger.info('Order created manually', { queueNumber, totalPrice });
      res.status(201).json(serialized);
    })
  );

  // PATCH /api/orders/:id/status — update order status
  router.patch(
    '/:id/status',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['waiting', 'making', 'done', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw createError(`สถานะไม่ถูกต้อง (Invalid status: ${status})`, 400, 'INVALID_STATUS');
      }

      const existing = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id) as OrderRow | undefined;

      if (!existing) {
        throw createError('ไม่พบออเดอร์ (Order not found)', 404, 'ORDER_NOT_FOUND');
      }

      const now = new Date().toISOString().replace('T', ' ').split('.')[0];

      db.prepare(`
        UPDATE orders
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(status, now, id);

      const updated = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id) as OrderRow;

      const serialized = serializeOrder(updated);

      // Notify all connected clients in real-time
      io.emit('orders:update', { type: 'status_changed', order: serialized });

      logger.info('Order status updated', {
        id,
        from: existing.status,
        to: status,
        queueNumber: existing.queue_number,
      });

      // ─── LINE Push: แจ้งลูกค้าเมื่อเริ่มทำ ───────────────────────────────
      if (status === 'making' && updated.customer_line_id) {
        const items: { name: string; quantity: number; unit: string }[] = JSON.parse(updated.items);
        const flexMsg = buildMakingFlexMessage(updated.queue_number, updated.customer_name, items);
        sendPushMessage(updated.customer_line_id, [flexMsg]).catch((err) =>
          logger.error('Failed to push making notification', { error: String(err), id })
        );
      }

      // ─── LINE Push: แจ้งลูกค้าเมื่อออเดอร์เสร็จ ──────────────────────────
      if (status === 'done' && updated.customer_line_id) {
        const items: { name: string; quantity: number; unit: string }[] = JSON.parse(updated.items);
        const hasDrink = items.some((i) => i.unit === 'แก้ว');
        const hasSolid = items.some((i) => i.unit === 'กก.');
        const flexMsg = buildDoneFlexMessage(
          updated.queue_number, items, hasDrink, hasSolid, updated.pickup_time
        );
        sendPushMessage(updated.customer_line_id, [flexMsg]).catch((err) =>
          logger.error('Failed to push order-done notification', { error: String(err), id })
        );
      }

      // ─── LINE Push: แจ้งลูกค้าเมื่อออเดอร์ถูกยกเลิก (จากหลังบ้าน) ────────
      if (status === 'cancelled' && updated.customer_line_id) {
        const items: { name: string; quantity: number; unit: string }[] = JSON.parse(updated.items);
        const flexMsg = buildCancelledFlexMessage(updated.queue_number, items);
        sendPushMessage(updated.customer_line_id, [flexMsg]).catch((err) =>
          logger.error('Failed to push cancelled notification', { error: String(err), id })
        );
      }

      res.json(serialized);
    })
  );

  // DELETE /api/orders/:id — cancel/delete an order
  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;

      const existing = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id) as OrderRow | undefined;

      if (!existing) {
        throw createError('ไม่พบออเดอร์ (Order not found)', 404, 'ORDER_NOT_FOUND');
      }

      const now = new Date().toISOString().replace('T', ' ').split('.')[0];

      db.prepare(`
        UPDATE orders SET status = 'cancelled', updated_at = ?
        WHERE id = ?
      `).run(now, id);

      io.emit('orders:update', { type: 'cancelled', orderId: id });

      logger.info('Order cancelled', { id, queueNumber: existing.queue_number });
      res.json({ success: true, id });
    })
  );

  return router;
}
