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

// Build Flex Message for order confirmation (รับออเดอร์)
export function buildConfirmationFlexMessage(
  queueNumber: string,
  items: { name: string; quantity: number; pricePerUnit: number }[],
  pickupTime: string | null,
  totalPrice: number
): LineFlexMessage {
  const itemRows = items.map((item) => ({
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      { type: 'text', text: item.name, color: '#374151', size: 'md', flex: 4, wrap: true },
      { type: 'text', text: `× ${item.quantity}`, color: '#6B7280', size: 'md', flex: 1, align: 'center' },
      { type: 'text', text: `฿${(item.quantity * item.pricePerUnit).toLocaleString()}`, color: '#16A34A', size: 'md', weight: 'bold', flex: 2, align: 'end' },
    ],
  }));

  const bodyContents: object[] = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: 'หมายเลขคิว', color: '#6B7280', size: 'sm', flex: 2 },
        { type: 'text', text: queueNumber, color: '#16A34A', size: 'xxl', weight: 'bold', flex: 3, align: 'end' },
      ],
    },
    { type: 'separator', margin: 'lg' },
    { type: 'text', text: 'รายการที่สั่ง', color: '#6B7280', size: 'sm', margin: 'lg' },
    ...itemRows,
    { type: 'separator', margin: 'lg' },
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'lg',
      contents: [
        { type: 'text', text: 'ยอดรวม', color: '#374151', size: 'md', weight: 'bold', flex: 2 },
        { type: 'text', text: `฿${totalPrice.toLocaleString()}`, color: '#16A34A', size: 'lg', weight: 'bold', flex: 3, align: 'end' },
      ],
    },
    ...(pickupTime ? [{
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        { type: 'text', text: '⏰ รับสินค้าเวลา', color: '#6B7280', size: 'sm', flex: 2 },
        { type: 'text', text: `${pickupTime} น.`, color: '#374151', size: 'md', weight: 'bold', flex: 3, align: 'end' },
      ],
    }] : []),
  ];

  return {
    type: 'flex',
    altText: `✅ รับออเดอร์ ${queueNumber} เรียบร้อยแล้วค่ะ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: '#16A34A',
        contents: [
          { type: 'text', text: '✅ รับออเดอร์เรียบร้อยแล้วค่ะ!', color: '#FFFFFF', size: 'lg', weight: 'bold' },
          { type: 'text', text: 'มะพร้าวเจ๊ประจวบ 🥥', color: '#BBF7D0', size: 'sm', margin: 'sm' },
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
        backgroundColor: '#FEF2F2',
        contents: [
          {
            type: 'text',
            text: `❌ หากต้องการยกเลิก พิมพ์:\nยกเลิก ${queueNumber}`,
            color: '#DC2626',
            size: 'sm',
            wrap: true,
            align: 'center',
          },
        ],
      },
    },
  };
}

// Build Flex Message for order done (ออเดอร์เสร็จ)
export function buildDoneFlexMessage(
  queueNumber: string,
  items: { name: string; quantity: number; unit: string }[],
  hasDrink: boolean,
  hasSolid: boolean,
  pickupTime: string | null
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

  const headerBg = hasDrink ? '#EA580C' : '#0D9488';
  const footerBg = hasDrink ? '#FFF7ED' : '#F0FDFA';
  const footerColor = hasDrink ? '#C2410C' : '#0F766E';
  const subtitleColor = hasDrink ? '#FED7AA' : '#99F6E4';

  let headerText = '';
  let footerText = '';

  if (hasDrink && hasSolid) {
    headerText = '🎉 ออเดอร์พร้อมแล้ว! มารับด่วนนะคะ';
    footerText = '🥤 กรุณามารับน้ำมะพร้าวภายใน 10 นาทีนะคะ\nส่วนมะพร้าวขูด/กะทิ มารับตามสะดวกได้เลยค่ะ 😊';
  } else if (hasDrink) {
    headerText = '🎉 ออเดอร์พร้อมแล้ว! มารับด่วนนะคะ';
    footerText = '⚡ กรุณามารับภายใน 10 นาทีนะคะ\nน้ำมะพร้าวปั่นจะละลายถ้าทิ้งไว้นานค่ะ 😊';
  } else {
    headerText = '🎉 ออเดอร์ของคุณพร้อมแล้วค่ะ!';
    footerText = pickupTime
      ? `มารับได้ตั้งแต่ตอนนี้ถึง ${pickupTime} ตามที่นัดไว้นะคะ 😊\nขอบคุณที่อุดหนุนมะพร้าวเจ๊ประจวบค่ะ! 🙏`
      : 'สามารถมารับได้เลยตอนนี้เลยนะคะ 😊\nขอบคุณที่อุดหนุนมะพร้าวเจ๊ประจวบค่ะ! 🙏';
  }

  return {
    type: 'flex',
    altText: `🎉 ออเดอร์ ${queueNumber} พร้อมให้มารับแล้วค่ะ`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        backgroundColor: headerBg,
        contents: [
          { type: 'text', text: headerText, color: '#FFFFFF', size: 'lg', weight: 'bold' },
          { type: 'text', text: 'มะพร้าวเจ๊ประจวบ 🥥', color: subtitleColor, size: 'sm', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'หมายเลขคิว', color: '#6B7280', size: 'sm', flex: 2 },
              { type: 'text', text: queueNumber, color: headerBg, size: 'xxl', weight: 'bold', flex: 3, align: 'end' },
            ],
          },
          { type: 'separator', margin: 'lg' },
          { type: 'text', text: 'รายการที่สั่ง', color: '#6B7280', size: 'sm', margin: 'lg' },
          ...itemRows,
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '15px',
        backgroundColor: footerBg,
        contents: [
          { type: 'text', text: footerText, color: footerColor, size: 'sm', wrap: true, align: 'center' },
        ],
      },
    },
  };
}
