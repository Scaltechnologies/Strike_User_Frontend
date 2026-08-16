// Web implementation: Razorpay's standard Checkout.js, loaded directly in the page (we're
// already inside a real browser here, so no WebView bridge is needed — Razorpay manages its
// own overlay in the DOM). This component renders nothing itself.
import { useEffect, useRef } from 'react';
import type { RazorpayCheckoutProps } from './RazorpayCheckout.types';

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: string, handler: (arg: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (!scriptLoadPromise) {
    scriptLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        return;
      }
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the payment checkout script.'));
      document.body.appendChild(script);
    });
  }
  return scriptLoadPromise;
}

export function RazorpayCheckout(props: RazorpayCheckoutProps) {
  const { visible, onSuccess, onDismiss } = props;
  const openedForOrder = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // Guard against re-opening for the same order if this effect re-runs (e.g. a parent
    // re-render passing a new function identity for onSuccess/onDismiss).
    if (openedForOrder.current === props.orderId) return;
    openedForOrder.current = props.orderId;

    let cancelled = false;

    void loadScript()
      .then(() => {
        if (cancelled || !window.Razorpay) return;
        const rzp = new window.Razorpay({
          key: props.keyId,
          order_id: props.orderId,
          amount: Math.round(props.amount * 100),
          currency: props.currency,
          name: props.name,
          description: props.description,
          prefill: {
            ...(props.prefillEmail ? { email: props.prefillEmail } : {}),
            ...(props.prefillContact ? { contact: props.prefillContact } : {}),
          },
          theme: { color: props.themeColor ?? '#D63527' },
          handler: (response: unknown) => {
            const r = response as { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
            onSuccess({
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_order_id: r.razorpay_order_id,
              razorpay_signature: r.razorpay_signature,
            });
          },
          modal: { ondismiss: () => onDismiss() },
        });
        rzp.on('payment.failed', () => onDismiss());
        rzp.open();
      })
      .catch(() => onDismiss());

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, props.orderId]);

  // Reset the guard once this order is no longer being shown, so a genuinely new order
  // (a retry) is allowed to open.
  useEffect(() => {
    if (!visible) openedForOrder.current = null;
  }, [visible]);

  return null;
}
