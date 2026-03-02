// ─── Order Types ──────────────────────────────────────────────────────────────

export type OrderStatus = 'waiting' | 'making' | 'done' | 'cancelled';
export type OrderSource = 'line' | 'manual';
export type UrgencyLevel = 'overdue' | 'urgent' | 'normal' | 'none';

export interface OrderItem {
  name: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  totalPrice: number;
  details?: string;
}

export interface Order {
  id: string;
  queueNumber: string;
  customerName: string | null;
  customerLineId?: string | null;
  items: OrderItem[];
  totalPrice: number;
  pickupTime: string | null;   // HH:MM format (Thai local time)
  status: OrderStatus;
  priorityScore: number;
  note: string | null;
  source: OrderSource;
  rawMessage?: string | null;
  createdAt: string;           // ISO string
  updatedAt: string;           // ISO string
}

export interface DailyStats {
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  dailyRevenue: number;
  date: string;
}

// ─── UI Helper Functions ──────────────────────────────────────────────────────

export function getUrgencyLevel(pickupTime: string | null): UrgencyLevel {
  if (!pickupTime) return 'none';

  const now = new Date();
  const [hours, minutes] = pickupTime.split(':').map(Number);
  const pickup = new Date();
  pickup.setHours(hours, minutes, 0, 0);

  const diffMinutes = (pickup.getTime() - now.getTime()) / (1000 * 60);

  if (diffMinutes < 0) return 'overdue';
  if (diffMinutes <= 30) return 'urgent';
  return 'normal';
}

export function getMinutesUntilPickup(pickupTime: string | null): number | null {
  if (!pickupTime) return null;

  const now = new Date();
  const [hours, minutes] = pickupTime.split(':').map(Number);
  const pickup = new Date();
  pickup.setHours(hours, minutes, 0, 0);

  return Math.round((pickup.getTime() - now.getTime()) / (1000 * 60));
}

export function formatPickupCountdown(pickupTime: string | null): string {
  const mins = getMinutesUntilPickup(pickupTime);
  if (mins === null) return '';
  if (mins < 0) return `เกินเวลา ${Math.abs(mins)} นาที`;
  if (mins === 0) return 'ถึงเวลาแล้ว!';
  if (mins <= 60) return `อีก ${mins} นาที`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `อีก ${h}ชม ${m}นาที`;
}
