// Coupon validation — mirrors card-service's ValidateCouponResult (proxied from admin-service).
//
// POST /api/subscriptions/coupons/validate is a live pre-purchase check: the server resolves
// price/vendor from the cardDefinitionId itself, so nothing here is client-trusted.

export type DiscountType = 'PERCENTAGE' | 'FLAT';

export interface ValidateCouponResponse {
  couponId: number;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  discountApplied: number;
  originalAmount: number;
  finalAmount: number;
}
