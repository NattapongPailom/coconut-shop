import { Router, Request, Response } from 'express';
import { Server as SocketServer } from 'socket.io';
import { verifyLineSignature, sendReplyMessage, buildConfirmationMessage, getLineUserProfile } from '../services/lineService.js';
import { parseOrderMessage, isOrderMessage, buildInvalidFormatReply } from '../services/orderParser.js';
import { calculatePriorityScore } from '../services/priorityEngine.js';
import db from '../db/database.js';
import logger from '../utils/logger.js';

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: {
    type: string;
    text: string;
  };
  source?: {
    type: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
}

interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

interface OrderRow {
  id: number;
  queue_number: string;
  customer_name: string | null;
  customer_line_id: string | null;
  items: string;
  total_price: number;
  pickup_time: string | null;
  status: string;
  priority_score: number;
  note: string | null;
  source: string;
  raw_message: string | null;
  created_at: string;
  updated_at: string;
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

export function createWebhookRouter(io: SocketServer): Router {
  const router = Router();

  // LINE webhook verification endpoint (GET)
  router.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'Coconut Shop LINE Webhook' });
  });

  // LINE webhook POST endpoint
  router.post('/', async (req: Request, res: Response) => {
    // req.body is a Buffer because we use express.raw() for this route
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : JSON.stringify(req.body);

    const signature = req.headers['x-line-signature'] as string;

    // Verify LINE signature
    if (!verifyLineSignature(rawBody, signature)) {
      logger.warn('Invalid LINE webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Always respond 200 immediately (LINE requires < 1s response)
    res.status(200).json({ status: 'ok' });

    // Process events asynchronously after responding
    try {
      const body: LineWebhookBody = JSON.parse(rawBody);
      logger.info('LINE webhook received', {
        destination: body.destination,
        eventCount: body.events?.length,
      });

      for (const event of body.events || []) {
        await processLineEvent(event, io).catch((err) => {
          logger.error('Error processing LINE event', { error: String(err), event });
        });
      }
    } catch (err) {
      logger.error('Failed to parse LINE webhook body', { error: String(err) });
    }
  });

  return router;
}

async function processLineEvent(event: LineEvent, io: SocketServer): Promise<void> {
  if (event.type !== 'message' || event.message?.type !== 'text') {
    logger.debug('Skipping non-text event', { type: event.type });
    return;
  }

  const text = event.message.text.trim();
  const replyToken = event.replyToken;
  const userId = event.source?.userId;

  logger.info('LINE text message received', {
    userId,
    text: text.substring(0, 100),
  });

  // Check if this looks like an order
  if (!isOrderMessage(text)) {
    logger.debug('Message is not an order, skipping');
    return;
  }

  // Parse the order
  const parsed = parseOrderMessage(text);

  if (!parsed.isValid || parsed.items.length === 0) {
    logger.info('Invalid order format, sending help message', {
      errors: parsed.parseErrors,
    });

    if (replyToken) {
      await sendReplyMessage(replyToken, [
        { type: 'text', text: buildInvalidFormatReply() },
      ]);
    }
    return;
  }

  // ดึงชื่อจาก LINE Profile ถ้า parser หาชื่อไม่เจอ
  let customerName = parsed.customerName;
  if (!customerName && userId) {
    const profile = await getLineUserProfile(userId);
    if (profile?.displayName) {
      customerName = profile.displayName;
      logger.info('Used LINE profile name', { displayName: customerName });
    }
  }

  // Save order to database
  const queueNumber = generateQueueNumber();
  const priorityScore = calculatePriorityScore(parsed.pickupTime);
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];

  const itemsForDb = parsed.items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    pricePerUnit: item.pricePerUnit,
    totalPrice: item.totalPrice,
  }));

  let newOrderRow: OrderRow | undefined;

  try {
    const result = db
      .prepare(`
        INSERT INTO orders
          (queue_number, customer_name, customer_line_id, items, total_price,
           pickup_time, priority_score, note, source, raw_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'line', ?, ?, ?)
      `)
      .run(
        queueNumber,
        customerName || null,
        userId || null,
        JSON.stringify(itemsForDb),
        parsed.totalPrice,
        parsed.pickupTime || null,
        priorityScore,
        parsed.note || null,
        text,
        now,
        now
      );

    newOrderRow = db
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(result.lastInsertRowid) as OrderRow;

    logger.info('LINE order saved', {
      queueNumber,
      totalPrice: parsed.totalPrice,
      itemCount: parsed.items.length,
      pickupTime: parsed.pickupTime,
    });
  } catch (err) {
    logger.error('Failed to save LINE order', { error: String(err) });

    if (replyToken) {
      await sendReplyMessage(replyToken, [
        {
          type: 'text',
          text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้งค่ะ (Error, please try again)',
        },
      ]);
    }
    return;
  }

  // Emit real-time update to dashboard
  if (newOrderRow) {
    const serialized = serializeOrder(newOrderRow);
    io.emit('order:new', serialized);
    io.emit('orders:update', { type: 'created', order: serialized });
  }

  // Send confirmation reply to LINE
  if (replyToken) {
    const confirmMsg = buildConfirmationMessage(
      queueNumber,
      parsed.items,
      parsed.pickupTime,
      parsed.totalPrice
    );

    await sendReplyMessage(replyToken, [confirmMsg]);
  }
}
