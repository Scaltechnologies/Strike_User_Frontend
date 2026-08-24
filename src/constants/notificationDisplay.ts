// Centralized notification-type -> presentation mapping. One place to extend
// instead of scattering `if (type === ...)` across the notification screen,
// the push-tap handler, and anywhere else a notification needs to be shown
// or routed.
//
// Covers only the `type` values actually emitted for USER recipients today —
// discovered by reading notification-service's NotificationServiceImpl and
// every admin-service call site that dispatches to a USER (payments, coupons,
// banners). Do not add a type here speculatively; add it once a backend event
// actually sends it. Unknown/future types fall through to DEFAULT_DISPLAY
// below rather than crashing or rendering blank.
//
// `route` is a FALLBACK only — a notification's own server-supplied deepLink
// (push payload's `data.deepLink` / inbox row's `actionUrl`) always wins when
// present. It only matters for the types below that don't currently carry
// one (payments/coupons/banners have no dedicated details screen yet — see
// each entry's comment).

import {
  Bell,
  CheckCircle2,
  Clock,
  CreditCard,
  Gift,
  Megaphone,
  RefreshCw,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { ROUTES } from './routes';
import type { NotificationEventType } from '@/types/notification';

export type NotificationPriority = 'normal' | 'important';

export interface NotificationDisplayConfig {
  Icon: LucideIcon;
  color: string;
  soft: string;
  priority: NotificationPriority;
  /** Fallback in-app route when the notification carries no deepLink/actionUrl of its own. */
  route: string;
}

const successColor = '#1C7A3C', successSoft = '#EAF7EF';
const dangerColor  = '#C0261A', dangerSoft  = '#FEF0EE';
const warningColor = '#946200', warningSoft = '#FFF5E0';
const infoColor    = '#0369A1', infoSoft    = '#EFF6FF';

// Safe fallback for a type this app doesn't recognize yet (backend added a
// new one, or the field is null/malformed) — never crash, never blank.
export const DEFAULT_NOTIFICATION_DISPLAY: NotificationDisplayConfig = {
  Icon: Bell,
  color: infoColor,
  soft: infoSoft,
  priority: 'normal',
  route: ROUTES.NOTIFICATIONS,
};

const DISPLAY_MAP: Partial<Record<string, NotificationDisplayConfig>> = {
  // ── Cards / subscriptions ──
  SUBSCRIPTION_PURCHASED: {
    Icon: CreditCard, color: successColor, soft: successSoft, priority: 'normal',
    route: ROUTES.TABS.CARDS,
  },
  SUBSCRIPTION_EXPIRED: {
    Icon: Clock, color: warningColor, soft: warningSoft, priority: 'important',
    route: ROUTES.TABS.CARDS,
  },

  // ── Redemption ──
  REDEMPTION_PROCESSED: {
    Icon: CheckCircle2, color: successColor, soft: successSoft, priority: 'normal',
    route: ROUTES.TABS.CARDS,
  },
  REDEMPTION_EXPIRED: {
    Icon: Clock, color: warningColor, soft: warningSoft, priority: 'normal',
    route: ROUTES.TABS.CARDS,
  },
  REDEMPTION_REJECTED: {
    Icon: XCircle, color: dangerColor, soft: dangerSoft, priority: 'important',
    route: ROUTES.TABS.CARDS,
  },

  // ── Wallet ──
  LOW_BALANCE: {
    Icon: Wallet, color: warningColor, soft: warningSoft, priority: 'important',
    route: ROUTES.TABS.CARDS,
  },

  // ── Payments — no dedicated Payment Details screen exists in the app yet;
  // My Cards (subscriptions) is the closest real destination. ──
  PAYMENT_SUCCESS: {
    Icon: CheckCircle2, color: successColor, soft: successSoft, priority: 'normal',
    route: ROUTES.TABS.CARDS,
  },
  PAYMENT_FAILED: {
    Icon: XCircle, color: dangerColor, soft: dangerSoft, priority: 'important',
    route: ROUTES.TABS.CARDS,
  },
  REFUND_COMPLETED: {
    Icon: RefreshCw, color: infoColor, soft: infoSoft, priority: 'normal',
    route: ROUTES.TABS.CARDS,
  },

  // ── Offers — no dedicated Coupons/Offers screen exists in the app yet;
  // Home is where banners/offers actually surface today. ──
  COUPON_ISSUED: {
    Icon: Gift, color: infoColor, soft: infoSoft, priority: 'normal',
    route: ROUTES.TABS.HOME,
  },
  COUPON_REDEEMED: {
    Icon: Gift, color: successColor, soft: successSoft, priority: 'normal',
    route: ROUTES.TABS.HOME,
  },
  BANNER_PUBLISHED: {
    Icon: Megaphone, color: infoColor, soft: infoSoft, priority: 'normal',
    route: ROUTES.TABS.HOME,
  },
};

export function getNotificationDisplay(
  type: NotificationEventType | null | undefined,
): NotificationDisplayConfig {
  if (!type) return DEFAULT_NOTIFICATION_DISPLAY;
  return DISPLAY_MAP[type] ?? DEFAULT_NOTIFICATION_DISPLAY;
}
