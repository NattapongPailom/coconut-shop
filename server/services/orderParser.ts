// Order message parser for LINE orders
// Supports Thai and English, structured and casual formats

export interface ParsedItem {
  name: string;
  nameTh: string;
  nameEn: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPrice: number;
}

export interface ParsedOrder {
  customerName: string | null;
  items: ParsedItem[];
  pickupTime: string | null;  // HH:MM format
  note: string | null;
  totalPrice: number;
  rawText: string;
  isValid: boolean;
  parseErrors: string[];
}

interface ProductDefinition {
  nameTh: string;
  nameEn: string;
  patterns: RegExp[];
  unitTh: string;
  unitEn: string;
  pricePerUnit: number;
}

const PRODUCTS: ProductDefinition[] = [
  {
    nameTh: 'น้ำมะพร้าวสด',
    nameEn: 'Fresh Coconut Water',
    patterns: [
      /น้ำมะพร้าวสด/,
      /fresh\s*coconut\s*water/i,
      /coconut\s*water/i,
    ],
    unitTh: 'แก้ว',
    unitEn: 'cup',
    pricePerUnit: 20,
  },
  {
    nameTh: 'น้ำมะพร้าวปั่นนมสด',
    nameEn: 'Coconut Smoothie with Milk',
    patterns: [
      /น้ำมะพร้าวปั่นนมสด/,
      /มะพร้าวปั่นนมสด/,
      /coconut\s*smoothie\s*(?:with\s*)?milk/i,
    ],
    unitTh: 'แก้ว',
    unitEn: 'cup',
    pricePerUnit: 35,
  },
  {
    nameTh: 'น้ำมะพร้าวปั่น',
    nameEn: 'Coconut Smoothie',
    patterns: [
      /น้ำมะพร้าวปั่น(?!นมสด)/,
      /coconut\s*smoothie(?!\s*(?:with\s*)?milk)/i,
      /สมูทตี้\s*มะพร้าว/i,
      /สมูทตี้/i,
    ],
    unitTh: 'แก้ว',
    unitEn: 'cup',
    pricePerUnit: 25,
  },
  {
    nameTh: 'มะพร้าวขูด',
    nameEn: 'Grated Coconut',
    patterns: [
      /มะพร้าวขูด/,
      /grated\s*coconut/i,
      /ขูดมะพร้าว/,
    ],
    unitTh: 'กก.',
    unitEn: 'kg',
    pricePerUnit: 100,
  },
  {
    nameTh: 'กะทิสด',
    nameEn: 'Fresh Coconut Milk',
    patterns: [
      /กะทิสด/,
      /fresh\s*coconut\s*milk/i,
      /coconut\s*milk/i,
      /กะทิ/,
    ],
    unitTh: 'กก.',
    unitEn: 'kg',
    pricePerUnit: 100,
  },
];

function extractQuantity(text: string, matchEnd: number): number {
  // Look for a number immediately after the product match (within ~30 chars)
  const after = text.slice(matchEnd, matchEnd + 30);

  // Pattern: x2, ×2, *2, 2แก้ว, 2 แก้ว, 2kg, 2กก, จำนวน 2
  const patterns = [
    /^[xX×*\s]*(\d+(?:\.\d+)?)/,
    /จำนวน\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:แก้ว|ลูก|กก|kg|cup|piece)/i,
  ];

  for (const pattern of patterns) {
    const m = after.match(pattern);
    if (m) {
      return parseFloat(m[1]);
    }
  }

  // Also look before the match
  const before = text.slice(Math.max(0, matchEnd - 25), matchEnd);
  const beforeMatch = before.match(/(\d+(?:\.\d+)?)\s*$/);
  if (beforeMatch) {
    return parseFloat(beforeMatch[1]);
  }

  return 1;
}

// Specialized weight parser for kg products (มะพร้าวขูด, กะทิสด)
// Handles any Thai weight expression: โลครึ่ง, 1 โล 2 ขีด, 1 โลกับอีก 2 ขีด, ครึ่งโล, 3 ขีด, etc.
// Unit conversions: 1 ขีด = 100g = 0.1 กก., ครึ่ง = 0.5 กก.
function extractWeightKg(text: string, matchEnd: number): number {
  const s = text.slice(matchEnd, matchEnd + 60).replace(/^[\s:xX×*]+/, '');

  // Thai unit keyword: โล / กิโล / กิโลกรัม / กก (with optional dot)
  const UNIT = '(?:โล|กิโล|กิโลกรัม|กก)[.]*';

  // Flexible connector between unit and additional quantity:
  // กับ, อีก, กับอีก, กับ อีก, และ — or just whitespace
  const CONN = '(?:\\s*(?:กับ\\s*อีก|กับอีก|กับ|อีก|และ)\\s*|\\s*)';

  // 1. "ครึ่งโล" / "ครึ่งกิโล" = 0.5 kg
  if (new RegExp(`^ครึ่ง\\s*${UNIT}`).test(s)) return 0.5;

  // 2. "X โล[conn]ครึ่ง" = X + 0.5  e.g. 1 โลครึ่ง / 1 โลกับครึ่ง / 2 กิโล กับ ครึ่ง
  const withHalf = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${UNIT}${CONN}ครึ่ง`));
  if (withHalf) return parseFloat(withHalf[1]) + 0.5;

  // 3. "โล[conn]ครึ่ง" (no leading number) = 1.5 kg
  if (new RegExp(`^${UNIT}${CONN}ครึ่ง`).test(s)) return 1.5;

  // 4. "X โล[conn]Y ขีด" = X + Y*0.1  e.g. 1 โล 2 ขีด / 1 กิโลกับอีก 3 ขีด
  const kiloHecto = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${UNIT}${CONN}(\\d+(?:\\.\\d+)?)\\s*ขีด`));
  if (kiloHecto) return parseFloat(kiloHecto[1]) + parseFloat(kiloHecto[2]) * 0.1;

  // 5. "Y ขีด" only = Y * 0.1 kg  e.g. 5 ขีด = 0.5
  const hectoOnly = s.match(/^(\d+(?:\.\d+)?)\s*ขีด/);
  if (hectoOnly) return parseFloat(hectoOnly[1]) * 0.1;

  // 6. "ครึ่ง" alone = 0.5 kg
  if (/^ครึ่ง/.test(s)) return 0.5;

  // 7. Plain number (with optional unit): 1.5, 2, 1 กก., 2 กิโล
  const plain = s.match(/^(\d+(?:\.\d+)?)/);
  if (plain) return parseFloat(plain[1]);

  // 8. Look before the match as last resort
  const before = text.slice(Math.max(0, matchEnd - 25), matchEnd);
  const beforeMatch = before.match(/(\d+(?:\.\d+)?)\s*$/);
  if (beforeMatch) return parseFloat(beforeMatch[1]);

  return 1; // default 1 kg
}

function parsePickupTime(text: string): string | null {
  // Thai keywords: รับเวลา, รับที่, เวลารับ, รับ
  // English keywords: pickup, at, time
  const patterns = [
    /(?:รับเวลา|เวลารับ|รับที่|รับ|pickup\s+time|pickup|pick\s*up)[:\s]*(\d{1,2})[:.：](\d{2})/i,
    /(?:เวลา|time|at)[:\s]+(\d{1,2})[:.：](\d{2})/i,
    /(\d{1,2})[:.：](\d{2})\s*(?:น\.|น |นาฬิกา|hrs?|โมง)/,
    // Last resort: bare time
    /\b(\d{1,2})[:.：](\d{2})\b/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const hours = parseInt(m[1], 10);
      const minutes = parseInt(m[2], 10);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }
  }

  return null;
}

function parseCustomerName(text: string): string | null {
  // Pattern 1: มีคีย์เวิร์ด "ชื่อ:" หรือ "name:"
  const keywordPatterns = [
    /(?:ชื่อ|name)[:\s]+([^\n,\d]{2,30})/i,
    /(?:คุณ|นาย|นาง|นางสาว|mr\.|mrs\.|ms\.)\s*([ก-๙a-zA-Z\s]{2,20})/i,
  ];

  for (const pattern of keywordPatterns) {
    const m = text.match(pattern);
    if (m) {
      return m[1].trim().replace(/\s+/g, ' ');
    }
  }

  // Pattern 2: ชื่อนำหน้าข้อความก่อนถึงชื่อสินค้า (casual format)
  // เช่น "เบส น้ำมะพร้าวปั่น 1 แก้ว รับ 12:00"
  const productKeywords = /น้ำมะพร้าวสด|น้ำมะพร้าวปั่นนมสด|น้ำมะพร้าวปั่น|มะพร้าวขูด|กะทิสด|กะทิ|smoothie|coconut/i;
  const firstProductIdx = text.search(productKeywords);
  if (firstProductIdx > 0) {
    const beforeProduct = text.slice(0, firstProductIdx).trim();
    // ยอมรับถ้าเป็นข้อความภาษาไทย/อังกฤษ 2-15 ตัวอักษร ไม่มีตัวเลข
    if (/^[ก-๙a-zA-Z\s]{2,15}$/.test(beforeProduct)) {
      return beforeProduct.trim();
    }
  }

  return null;
}

function parseNote(text: string): string | null {
  const patterns = [
    /(?:หมายเหตุ|โน้ต|note|หมาย|เพิ่มเติม|special)[:\s]+([^\n]+)/i,
    /(?:หวานน้อย|หวานมาก|ไม่หวาน|ไม่ใส่น้ำตาล|less\s+sweet|more\s+sweet|no\s+sugar)[^\n]*/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      return m[0].trim();
    }
  }

  return null;
}

export function parseOrderMessage(rawText: string): ParsedOrder {
  const text = rawText.trim();
  const errors: string[] = [];
  const items: ParsedItem[] = [];

  // Find each product in the message
  for (const product of PRODUCTS) {
    let found = false;
    for (const pattern of product.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      const match = text.match(regex);
      if (match && !found) {
        const matchEnd = (match.index || 0) + match[0].length;
        const quantity = product.unitTh === 'กก.'
          ? extractWeightKg(text, matchEnd)
          : extractQuantity(text, matchEnd);

        items.push({
          name: `${product.nameTh} (${product.nameEn})`,
          nameTh: product.nameTh,
          nameEn: product.nameEn,
          quantity,
          unit: product.unitTh,
          pricePerUnit: product.pricePerUnit,
          totalPrice: quantity * product.pricePerUnit,
        });
        found = true;
      }
    }
  }

  const totalPrice = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const pickupTime = parsePickupTime(text);

  if (items.length === 0) {
    errors.push('ไม่พบรายการสินค้าในข้อความ (No products found in message)');
  }

  // Require pickup time — prevents accidental Rich Menu taps from creating orders
  if (items.length > 0 && !pickupTime) {
    errors.push('กรุณาระบุเวลารับสินค้า เช่น รับเวลา: 10:30 (Please specify pickup time)');
  }

  return {
    customerName: parseCustomerName(text),
    items,
    pickupTime,
    note: parseNote(text),
    totalPrice,
    rawText: text,
    isValid: items.length > 0 && pickupTime !== null,
    parseErrors: errors,
  };
}

export function isOrderMessage(text: string): boolean {
  const orderKeywords = /สั่ง|order|น้ำมะพร้าว|มะพร้าว|coconut|กะทิ|สมูทตี้|smoothie/i;
  return orderKeywords.test(text);
}

export function buildInvalidFormatReply(): string {
  return [
    '📝 กรุณาสั่งในรูปแบบนี้:',
    'ชื่อ: [ชื่อของคุณ]',
    'สั่ง: [ชื่อสินค้า] [จำนวน]',
    'รับเวลา: [HH:MM]',
    '',
    '🥥 สินค้าของเรา:',
    '• น้ำมะพร้าวสด - 20฿/แก้ว',
    '• น้ำมะพร้าวปั่นนมสด - 35฿/แก้ว',
    '• น้ำมะพร้าวปั่น - 25฿/แก้ว',
    '• มะพร้าวขูด - 100฿/กก.',
    '• กะทิสด - 100฿/กก.',
    '',
    '💬 ตัวอย่าง:',
    'ชื่อ: คุณสมศรี',
    'สั่ง: น้ำมะพร้าวปั่น 2 แก้ว',
    'รับเวลา: 10:30',
  ].join('\n');
}
