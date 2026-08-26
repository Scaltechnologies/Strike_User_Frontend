// Payment DTOs — mirrors card-service's payment package.
//
// A Payment tracks a single checkout session for a card purchase, via one of two methods:
//
// ONLINE:        CREATED -> PENDING -> PROCESSING -> { SUCCESS | FAILED | CANCELLED | EXPIRED }
//   Only SUCCESS (reached via POST /api/payments/{id}/verify, confirmed against the gateway)
//   causes the backend to mint an ActiveSubscription.
//
// PAY_AT_STORE:  PENDING -> [AWAITING_VENDOR_CONFIRMATION] -> { SUCCESS | FAILED | CANCELLED | EXPIRED }
//   The customer pays the vendor directly at the store, using the QR/code the create response
//   returns. AWAITING_VENDOR_CONFIRMATION is optional — a vendor can verify-then-confirm in one
//   step, or confirm directly off a freshly-verified PENDING session. SUCCESS mints an
//   ActiveSubscription the same way ONLINE does.
//
// SUCCESS is terminal and immutable. A Pay-at-Store retry after a terminal status is a brand-new
// POST /api/payments call (a new Payment row), never POST /{id}/retry — that endpoint only makes
// sense for ONLINE, where the gateway order itself is retried.

export type PaymentMethod = 'ONLINE' | 'PAY_AT_STORE';

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PROCESSING'
  | 'AWAITING_VENDOR_CONFIRMATION'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

// POST /api/payments request body
export interface CreatePaymentRequest {
  cardDefinitionId: number;
  storeId: number;
  couponCode?: string;
  // Omitted = ONLINE (server-side default) — existing callers that never send this keep working.
  paymentMethod?: PaymentMethod;
}

export interface PaymentResponse {
  paymentId: number;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  cardName: string;
  vendorId: number | null;
  storeId: number;
  amount: number;
  currency: string;
  subscriptionId: number | null;
  failureReason: string | null;
  expiresAt: string; // ISO-8601 LocalDateTime
  confirmedAt: string | null;
  // Present only while the payment is open (CREATED/PENDING/PROCESSING) —
  // what the client needs to open Razorpay checkout.
  gatewayProvider: string | null;
  gatewayOrderId: string | null;
  gatewayKeyId: string | null;
  attemptNumber: number;
  // Pay at Store — present ONLY in the response to the CREATE call that generated them.
  // Every subsequent GET /api/payments/{id} returns these as null — the backend never stores
  // or re-serves the raw values. A caller that needs to redisplay the QR/code later (app
  // relaunch, retry) must have captured them at create time — see storageService's
  // getPayAtStoreSession/setPayAtStoreSession.
  qrPayload: string | null;
  verificationCode: string | null;
}

// POST /api/payments/{id}/verify request body — fields returned by the
// Razorpay Checkout success handler on the client side. Informational until
// the backend cryptographically verifies gatewaySignature. ONLINE only.
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
