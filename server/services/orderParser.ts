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
    pricePerUnit: 90,
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

// ─── Thai informal time helpers ───────────────────────────────────────────────
// Longest words first to avoid partial matches (สิบเอ็ด before สิบ)
const THAI_NUM_WORDS = 'สิบเอ็ด|สิบสอง|สิบ|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า';
const THAI_N = `(\\d+|${THAI_NUM_WORDS})`;

function parseThaiNumStr(s: string): number | null {
  const n = parseInt(s, 10);
  if (!isNaN(n)) return n;
  const map: Record<string, number> = {
    'หนึ่ง': 1, 'สอง': 2, 'สาม': 3, 'สี่': 4, 'ห้า': 5,
    'หก': 6, 'เจ็ด': 7, 'แปด': 8, 'เก้า': 9,
    'สิบ': 10, 'สิบเอ็ด': 11, 'สิบสอง': 12,
  };
  return map[s] ?? null;
}

function hhmm(h: number, half: boolean): string {
  return `${String(h).padStart(2, '0')}:${String(half ? 30 : 0).padStart(2, '0')}`;
}

// Parse Thai informal time from text. Returns HH:MM or null.
// Supports full Thai time system: ตีX, X โมง(เช้า/เย็น), บ่าย X, X ทุ่ม, เที่ยง, เที่ยงคืน
// Plus half-hour variants: "ครึ่ง" appended to any expression
function parseThaiTime(text: string): string | null {
  const N = THAI_N;

  // เที่ยงคืน = 00:00  (must check before เที่ยง)
  if (/เที่ยงคืน/.test(text)) return '00:00';

  // ตี X [ครึ่ง] = 01:00–05:30
  {
    const m = text.match(new RegExp(`ตี\\s*${N}(\\s*ครึ่ง)?`));
    if (m) {
      const h = parseThaiNumStr(m[1]);
      if (h && h >= 1 && h <= 5) return hhmm(h, !!m[2]?.trim());
    }
  }

  // เที่ยง [ครึ่ง] = 12:00 or 12:30
  {
    const m = text.match(/เที่ยง(\s*ครึ่ง)?/);
    if (m) return m[1]?.trim() ? '12:30' : '12:00';
  }

  // X ทุ่ม [ครึ่ง] = 19:00–23:30  (1 ทุ่ม = 19:00, 5 ทุ่ม = 23:00)
  {
    const m = text.match(new RegExp(`${N}\\s*ทุ่ม(\\s*ครึ่ง)?`));
    if (m) {
      const n = parseThaiNumStr(m[1]);
      if (n && n >= 1 && n <= 5) return hhmm(18 + n, !!m[2]?.trim());
    }
  }

  // บ่ายโมง [ครึ่ง] = 13:00 or 13:30  (no number = implicit 1)
  {
    const m = text.match(/บ่าย\s*โมง(\s*ครึ่ง)?/);
    if (m) return m[1]?.trim() ? '13:30' : '13:00';
  }

  // บ่าย X [โมง] [ครึ่ง] = 13:00–17:30
  {
    const m = text.match(new RegExp(`บ่าย\\s*${N}(?:\\s*โมง)?(\\s*ครึ่ง)?`));
    if (m) {
      const n = parseThaiNumStr(m[1]);
      if (n && n >= 1 && n <= 5) return hhmm(12 + n, !!m[2]?.trim());
    }
  }

  // X โมงเย็น [ครึ่ง] = 13:00–18:30  (1 โมงเย็น = 13:00, 6 โมงเย็น = 18:00)
  {
    const m = text.match(new RegExp(`${N}\\s*โมงเย็น(\\s*ครึ่ง)?`));
    if (m) {
      const n = parseThaiNumStr(m[1]);
      if (n && n >= 1 && n <= 6) return hhmm(12 + n, !!m[2]?.trim());
    }
  }

  // X โมงเช้า [ครึ่ง] = 06:00–11:30
  {
    const m = text.match(new RegExp(`${N}\\s*โมงเช้า(\\s*ครึ่ง)?`));
    if (m) {
      const n = parseThaiNumStr(m[1]);
      if (n && n >= 6 && n <= 11) return hhmm(n, !!m[2]?.trim());
    }
  }

  // X โมง [ครึ่ง] — no qualifier (ambiguous)
  // 7–11 → morning  07:00–11:00
  // 1–6  → afternoon/evening  13:00–18:00
  // 12   → noon  12:00
  {
    const m = text.match(new RegExp(`${N}\\s*โมง(\\s*ครึ่ง)?`));
    if (m) {
      const n = parseThaiNumStr(m[1]);
      if (n) {
        const half = !!m[2]?.trim();
        if (n === 12) return hhmm(12, half);
        if (n >= 7 && n <= 11) return hhmm(n, half);
        if (n >= 1 && n <= 6) return hhmm(12 + n, half);
      }
    }
  }

  return null;
}

function parsePickupTime(text: string): string | null {
  // 1. Numeric HH:MM patterns
  const numericPatterns = [
    /(?:รับเวลา|เวลารับ|รับที่|รับ|pickup\s+time|pickup|pick\s*up)[:\s]*(\d{1,2})[:.：](\d{2})/i,
    /(?:เวลา|time|at)[:\s]+(\d{1,2})[:.：](\d{2})/i,
    /(\d{1,2})[:.：](\d{2})\s*(?:น\.|น |นาฬิกา|hrs?)/,
    // Bare time
    /\b(\d{1,2})[:.：](\d{2})\b/,
  ];

  for (const pattern of numericPatterns) {
    const m = text.match(pattern);
    if (m) {
      const hours = parseInt(m[1], 10);
      const minutes = parseInt(m[2], 10);
      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }
  }

  // 2. Thai informal time (ตี X, X โมง, บ่าย X, X ทุ่ม, เที่ยง, ฯลฯ)
  return parseThaiTime(text);
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
    errors.push('กรุณาระบุเวลารับสินค้า เช่น รับ 10:30 / บ่าย 3 / 5 โมง / 1 ทุ่ม (Please specify pickup time)');
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
    'รับเวลา: [เวลา]',
    '',
    '⏰ บอกเวลาได้หลายแบบ:',
    '• 10:30 หรือ 10.30',
    '• 9 โมงเช้า / 9 โมงครึ่ง',
    '• บ่าย 3 / บ่าย 3 ครึ่ง',
    '• 5 โมง / 5 โมงครึ่ง',
    '• 6 โมงเย็น',
    '• 1 ทุ่ม / 1 ทุ่มครึ่ง',
    '• เที่ยง / เที่ยงครึ่ง',
    '',
    '🥥 สินค้าของเรา:',
    '• น้ำมะพร้าวสด - 20฿/แก้ว',
    '• น้ำมะพร้าวปั่นนมสด - 35฿/แก้ว',
    '• น้ำมะพร้าวปั่น - 25฿/แก้ว',
    '• มะพร้าวขูด - 90฿/กก. (ครึ่งโล 45฿)',
    '• กะทิสด - 100฿/กก. (ครึ่งโล 50฿)',
    '',
    '💬 ตัวอย่าง:',
    'ชื่อ: คุณสมศรี',
    'สั่ง: น้ำมะพร้าวปั่น 2 แก้ว',
    'รับเวลา: บ่าย 3 ครึ่ง',
  ].join('\n');
}
