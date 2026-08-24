import type { Subscription, SubscriptionStatus } from '@/types/subscription';

function toUtcMs(iso: string): number {
  const s = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  return new Date(s).getTime();
}

// The backend only auto-expires ACTIVE subscriptions when GET /subscriptions/my/active
// is called — other read paths (getById, menu) can keep returning a stale ACTIVE status
// past expiresAt. Recompute here so every screen enforces the same cutoff regardless of
// which endpoint served the data.
export function getEffectiveStatus(sub: Pick<Subscription, 'status' | 'expiresAt'>): SubscriptionStatus {
  if (sub.status === 'ACTIVE' && toUtcMs(sub.expiresAt) <= Date.now()) {
    return 'EXPIRED';
  }
  return sub.status;
}

export function isSubscriptionRedeemable(sub: Pick<Subscription, 'status' | 'expiresAt'>): boolean {
  return getEffectiveStatus(sub) === 'ACTIVE';
}

// Wallet-grid box count for a subscription: one box per day of the card's
// validity, derived from the subscription's own purchasedAt/expiresAt —
// never from the live CardDefinition.validityInDays, which may have since
// changed for new purchases. Matches the vendor app's box-count logic so a
// ₹3000/30-day card reads as 30 boxes on both sides of a redemption, while a
// 7-day card reads as 7. Falls back to 1 defensively so a bad/missing
// timestamp never divides a wallet amount by zero.
export function getSubscriptionValidityDays(sub: Pick<Subscription, 'purchasedAt' | 'expiresAt'>): number {
  const start = toUtcMs(sub.purchasedAt);
  const end = toUtcMs(sub.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}
