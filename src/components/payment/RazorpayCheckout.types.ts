// Shared prop contract for the native (WebView-based) and web (checkout.js-based)
// RazorpayCheckout implementations — see RazorpayCheckout.tsx / .web.tsx.

export interface RazorpayCheckoutResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutProps {
  visible: boolean;
  keyId: string;
  orderId: string;
  /** Rupees, not paise — converted internally per platform. */
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefillEmail?: string;
  prefillContact?: string;
  themeColor?: string;
  /** Called once, on Razorpay's own success handler. Informational — the caller must still verify. */
  onSuccess: (result: RazorpayCheckoutResult) => void;
  /** Checkout closed without a handler success — could be a genuine cancel, or the handler
   *  callback racing with dismissal; the caller reconciles via POST /payments/{id}/cancel rather
   *  than assuming failure. */
  onDismiss: () => void;
}
