// notification-service DTOs — mirrors InAppNotification (self-service inbox,
// GET/PATCH /api/notifications/me/*) and the paginated envelope every list
// endpoint there returns (PageMapper.toMap: content/page/size/totalElements/
// totalPages/last — same shape used elsewhere in this app, e.g. banner.api.ts).

// The backend's `type` column is a free string, not a Java enum — this lists
// what's actually wired to reach a USER recipient today (see
// notification-service's NotificationServiceImpl and admin-service's
// NotificationEventClient call sites for payments/coupons/banners). The
// `string & {}` branch keeps this a real union for known values while still
// accepting whatever new type the backend adds next without a frontend
// release breaking — see constants/notificationDisplay.ts for the fallback
// this enables.
export type NotificationEventType =
  | 'SUBSCRIPTION_PURCHASED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'REDEMPTION_PROCESSED'
  | 'REDEMPTION_EXPIRED'
  | 'REDEMPTION_REJECTED'
  | 'LOW_BALANCE'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'REFUND_COMPLETED'
  | 'COUPON_ISSUED'
  | 'COUPON_REDEEMED'
  | 'BANNER_PUBLISHED'
  | (string & Record<never, never>);

export interface NotificationDto {
  id: number;
  title: string;
  message: string;
  type: NotificationEventType | null;
  // Server-supplied in-app route (e.g. "/subscriptions/456") — same field the
  // push payload calls `deepLink`. Null on several currently-unlinked types
  // (payments/coupons/banners) — constants/notificationDisplay.ts supplies a
  // type-based fallback for those.
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  content: NotificationDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}
