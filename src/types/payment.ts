// Payment DTOs — mirrors card-service's payment package.
//
// A Payment tracks a single Razorpay checkout session for a card purchase.
// CREATED -> PENDING -> PROCESSING -> { SUCCESS | FAILED | CANCELLED | EXPIRED }
// Only SUCCESS (reached via POST /api/payments/{id}/verify, confirmed against
// the gateway) causes the backend to mint an ActiveSubscription.

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

// POST /api/payments request body
export interface CreatePaymentRequest {
  cardDefinitionId: number;
  storeId: number;
  couponCode?: string;
}

export interface PaymentResponse {
  paymentId: number;
  status: PaymentStatus;
  amount: number;
  currency: string;
  subscriptionId: number | null;
  failureReason: string | null;
  expiresAt: string; // ISO-8601 LocalDateTime
  // Present only while the payment is open (CREATED/PENDING/PROCESSING) —
  // what the client needs to open Razorpay checkout.
  gatewayProvider: string | null;
  gatewayOrderId: string | null;
  gatewayKeyId: string | null;
  attemptNumber: number;
}

// POST /api/payments/{id}/verify request body — fields returned by the
// Razorpay Checkout success handler on the client side. Informational until
// the backend cryptographically verifies gatewaySignature.
export interface VerifyPaymentRequest {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

// Raw response object Razorpay Checkout's `handler` callback receives on success.
export interface RazorpayCheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
