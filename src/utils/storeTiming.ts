import type { Store } from '@/types/store';

const JS_TO_API_DAY = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
];

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Recomputes open/closed from today's opening/closing time instead of trusting a
// static account-level status field, so a store actually closes once closeTime passes.
export function isStoreOpenNow(store: Pick<Store, 'status' | 'timings' | 'holidays'>): boolean {
  if (store.status !== 'ACTIVE') return false;

  const now = new Date();

  if (store.holidays?.some((h) => h.date === localDateKey(now))) return false;

  const todayKey = JS_TO_API_DAY[now.getDay()];
  const timing = store.timings?.find((t) => t.dayOfWeek === todayKey);
  if (!timing) return true; // no configured hours for today — fall back to account status
  if (timing.isClosed) return false;
  if (!timing.openTime || !timing.closeTime) return true;

  const nowMinutes   = now.getHours() * 60 + now.getMinutes();
  const openMinutes  = toMinutes(timing.openTime);
  const closeMinutes = toMinutes(timing.closeTime);

  if (closeMinutes <= openMinutes) {
    // Overnight window (e.g. 6pm–2am): open if past opening OR before closing.
    return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}
