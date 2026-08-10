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
