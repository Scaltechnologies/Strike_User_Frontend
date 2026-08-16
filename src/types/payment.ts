// Payment DTOs — mirrors card-service's payment domain (Payment/PaymentAttempt).
//
// A Payment is the real-money charge that, once genuinely confirmed by the
// gateway, causes exactly one Subscription to be created (see subscription.ts).
// Status lifecycle: CREATED -> PENDING -> PROCESSING -> SUCCESS | FAILED | CANCELLED | EXPIRED.
// SUCCESS is terminal; FAILED/CANCELLED/EXPIRED can only move forward via retry,
// which opens a brand-new gateway attempt rather than mutating this one.

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export function isPaymentTerminal(status: PaymentStatus): boolean {
  return status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED';
}

// POST /api/payments request body
export interface CreatePaymentRequest {
  cardDefinitionId: number;
  storeId: number;
  couponCode?: string;
}

// POST /api/payments/{id}/verify request body — the fields Razorpay Checkout's
// success handler returns, forwarded as-is so the backend can cryptographically
// verify them; this is informational to us, never trusted on its own.
export interface VerifyPaymentRequest {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export interface PaymentResponse {
  paymentId: number;
  status: PaymentStatus;
  amount: number;
  currency: string;
  subscriptionId: number | null;
  failureReason: string | null;
  expiresAt: string; // ISO-8601 — checkout session TTL
  // Present only while the payment is open (not terminal) — what Checkout needs.
  gatewayProvider: string | null;
  gatewayOrderId: string | null;
  gatewayKeyId: string | null;
  attemptNumber: number;
}
