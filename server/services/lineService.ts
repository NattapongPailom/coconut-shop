import crypto from 'crypto';
import logger from '../utils/logger.js';

const LINE_REPLY_API = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push';

export interface LineTextMessage {
  type: 'text';
  text: string;
}

export interface LineFlexMessage {
  type: 'flex';
  altText: string;
  contents: object;
}

export type LineMessage = LineTextMessage | LineFlexMessage;

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

// Build Flex Message for "making" status notification
export function buildMakingFlexMessage(
  queueNumber: string,
  customerName: string | null,
  items: { name: string; quantity: number; unit: string }[]
): LineFlexMessage {
  const itemRows = items.map((item) => ({
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      { type: 'text', text: item.name, color: '#374151', size: 'md', flex: 4, wrap: true },
      { type: 'text', text: `× ${item.quantity} ${item.unit}`, color: '#6B7280', size: 'md', flex: 2, align: 'end' },
    ],
  }));

  const bodyContents: object[] = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'หมายเลขคิว', color: '#6B7280', size: 'sm', flex: 2 },
        { type: 'text', text: queueNumber, color: '#1D4ED8', size: 'xxl', weight: 'bold', flex: 3, align: 'end' },
      ],
    },
    ...(customerName
      ? [{ type: 'text', text: `👤 ${customerName}`, color: '#6B7280', size: 'sm', margin: 'md' }]
      : []),
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: 'รายการที่สั่ง', color: '#6B7280', size: 'sm', margin: 'lg' },
    ...itemRows,
  ];

  return {
    type: 'flex',
    altText: `⏳ ออเดอร์ ${queueNumber} กำลังดำเนินการอยู่ค่ะ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#2563EB',
        contents: [
          { type: 'text', text: '⏳ กำลังทำออเดอร์ของคุณแล้วค่ะ!', color: '#FFFFFF', size: 'lg', weight: 'bold' },
          { type: 'text', text: 'มะพร้าวเจ๊ประจวบ 🥥', color: '#BFDBFE', size: 'sm', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '15px',
        backgroundColor: '#EFF6FF',
        contents: [
          {
            type: 'text',
            text: 'เราจะแจ้งให้ทราบอีกครั้งเมื่อพร้อมให้มารับค่ะ 😊',
            color: '#2563EB',
            size: 'sm',
            wrap: true,
            align: 'center',
          },
        ],
      },
    },
  };
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
