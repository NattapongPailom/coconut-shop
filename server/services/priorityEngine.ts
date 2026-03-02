// Priority engine for order queue management
// Higher score = higher priority (shown first in queue)

export function calculatePriorityScore(pickupTime: string | null): number {
  if (!pickupTime) {
    // No pickup time specified — low priority, FIFO
    return 0;
  }

  const now = new Date();
  const [hours, minutes] = pickupTime.split(':').map(Number);

  const pickup = new Date();
  pickup.setHours(hours, minutes, 0, 0);

  // If pickup time is before current time today, check if it might be for tomorrow
  // For simplicity we treat it as today (could be an early morning order entered the night before)
  const diffMs = pickup.getTime() - now.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  if (diffMinutes < -5) {
    // Overdue — absolute highest priority
    return 10000 + Math.abs(diffMinutes) * 10;
  }

  if (diffMinutes <= 30) {
    // Urgent: within 30 minutes
    // Score: 1000 to 1300 (closer = higher)
    return 1000 + (30 - diffMinutes) * 10;
  }

  // Normal: > 30 minutes away
  // Score: 0 to 999 (sooner = higher)
  return Math.max(0, 999 - diffMinutes);
}

export function isUrgent(pickupTime: string | null): boolean {
  if (!pickupTime) return false;

  const now = new Date();
  const [hours, minutes] = pickupTime.split(':').map(Number);
  const pickup = new Date();
  pickup.setHours(hours, minutes, 0, 0);

  const diffMinutes = (pickup.getTime() - now.getTime()) / (1000 * 60);
  return diffMinutes <= 30;
}

export function getUrgencyLabel(pickupTime: string | null): 'overdue' | 'urgent' | 'normal' | 'none' {
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
