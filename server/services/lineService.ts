import crypto from 'crypto';
import logger from '../utils/logger.js';

const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push';

export interface LineTextMessage {
  type: 'text';
  text: string;
}

export type LineMessage = LineTextMessage;

// Verify LINE webhook signature using HMAC-SHA256
export function verifyLineSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) {
    logger.warn('LINE_CHANNEL_SECRET not configured — skipping signature verification');
    return true;
  }

  if (!signature) {
    logger.warn('Missing x-line-signature header');
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const digest = hmac.digest('base64');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const digestBuffer = Buffer.from(digest);

    if (sigBuffer.length !== digestBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(digestBuffer, sigBuffer);
  } catch (err) {
    logger.error('Signature verification failed', { error: err });
    return false;
  }
}

// Send reply message using LINE Reply API (can only be used once per webhook event)
export async function sendReplyMessage(
  replyToken: string,
  messages: LineMessage[]
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    logger.warn('LINE_CHANNEL_ACCESS_TOKEN not configured — skipping reply');
    return false;
  }

  try {
    const response = await fetch(LINE_REPLY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ replyToken, messages }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('LINE Reply API error', { status: response.status, error });
      return false;
    }

    logger.info('LINE reply sent successfully');
    return true;
  } catch (err) {
    logger.error('Failed to send LINE reply', { error: String(err) });
    return false;
  }
}

// Fetch LINE user profile (display name, picture)
export async function getLineUserProfile(
  userId: string
): Promise<{ displayName: string; pictureUrl?: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !userId) return null;

  try {
    const response = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) return null;
    return response.json() as Promise<{ displayName: string; pictureUrl?: string }>;
  } catch (err) {
    logger.error('Failed to fetch LINE profile', { userId, error: String(err) });
    return null;
  }
}

// Send push message (not limited to one per event, but uses quota)
export async function sendPushMessage(
  userId: string,
  messages: LineMessage[]
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    logger.warn('LINE_CHANNEL_ACCESS_TOKEN not configured — skipping push');
    return false;
  }

  try {
    const response = await fetch(LINE_PUSH_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ to: userId, messages }),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('LINE Push API error', { status: response.status, error });
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Failed to send LINE push', { error: String(err) });
    return false;
  }
}

// Build order confirmation message (Thai)
export function buildConfirmationMessage(
  queueNumber: string,
  items: { name: string; quantity: number; pricePerUnit: number }[],
  pickupTime: string | null,
  totalPrice: number
): LineMessage {
  const itemLines = items
    .map(i => `  • ${i.name} × ${i.quantity} = ฿${(i.quantity * i.pricePerUnit).toLocaleString()}`)
    .join('\n');

  const pickupLine = pickupTime
    ? `⏰ รับสินค้าเวลา: ${pickupTime} น.`
    : '⏰ ยังไม่ระบุเวลารับ';

  const text = [
    `✅ รับออเดอร์เรียบร้อยค่ะ!`,
    ``,
    `🎫 หมายเลขคิว: ${queueNumber}`,
    ``,
    `🥥 รายการที่สั่ง:`,
    itemLines,
    ``,
    `💰 ยอดรวม: ฿${totalPrice.toLocaleString()}`,
    pickupLine,
    ``,
    `🙏 กรุณารอรับสินค้าตามเวลาที่นัดไว้ค่ะ`,
    `ขอบคุณที่อุดหนุนมะพร้าวเจ๊ประจวบ 🥥`,
  ].join('\n');

  return { type: 'text', text };
}
