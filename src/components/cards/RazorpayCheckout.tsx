import { useMemo } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { CC } from './theme';
import { ManropeWeights } from '@/constants/theme';
import type { RazorpayCheckoutResult } from '@/types/payment';

const C = CC;

// Razorpay's Standard Checkout has no first-class Expo-Go-compatible native
// SDK, so it's driven entirely from checkout.js inside a WebView — the modal
// it renders opens as an overlay on this page, and posts its outcome back to
// RN via the injected `window.ReactNativeWebView.postMessage` bridge.
function buildCheckoutHtml(opts: {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
}): string {
  const options = {
    key: opts.keyId,
    amount: opts.amountPaise,
    currency: opts.currency,
    name: opts.name,
    description: opts.description,
    order_id: opts.orderId,
    theme: { color: CC.accent },
  };
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>html,body{margin:0;padding:0;height:100%;background:#fff;}</style>
</head>
<body>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    var options = ${JSON.stringify(options)};
    options.handler = function (response) {
      post({
        type: 'success',
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
    };
    options.modal = { ondismiss: function () { post({ type: 'dismiss' }); } };
    try {
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        post({ type: 'failed', reason: (resp.error && resp.error.description) || 'Payment failed' });
      });
      rzp.open();
    } catch (e) {
      post({ type: 'failed', reason: 'Could not start checkout' });
    }
  </script>
</body>
</html>`;
}

export interface RazorpayCheckoutProps {
  visible: boolean;
  keyId: string;
  orderId: string;
  amount: number; // rupees, as returned by the create-payment response
  currency: string;
  name: string;
  description?: string;
  onSuccess: (result: RazorpayCheckoutResult) => void;
  onFailed: (reason: string) => void;
  onDismiss: () => void;
}

export function RazorpayCheckout({
  visible,
  keyId,
  orderId,
  amount,
  currency,
  name,
  description,
  onSuccess,
  onFailed,
  onDismiss,
}: RazorpayCheckoutProps) {
  const html = useMemo(
    () =>
      buildCheckoutHtml({
        keyId,
        orderId,
        amountPaise: Math.round(amount * 100),
        currency,
        name,
        description: description ?? '',
      }),
    [keyId, orderId, amount, currency, name, description],
  );

  function handleMessage(event: WebViewMessageEvent) {
    let msg: { type?: string; reason?: string } & Partial<RazorpayCheckoutResult>;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      onFailed('Something went wrong during checkout');
      return;
    }
    if (msg.type === 'success' && msg.razorpay_order_id && msg.razorpay_payment_id && msg.razorpay_signature) {
      onSuccess({
        razorpay_order_id: msg.razorpay_order_id,
        razorpay_payment_id: msg.razorpay_payment_id,
        razorpay_signature: msg.razorpay_signature,
      });
    } else if (msg.type === 'failed') {
      onFailed(msg.reason ?? 'Payment failed');
    } else if (msg.type === 'dismiss') {
      onDismiss();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Complete Payment</Text>
          <Pressable style={styles.closeBtn} onPress={onDismiss} hitSlop={12}>
            <X size={18} color={C.secondary} strokeWidth={2.5} />
          </Pressable>
        </View>
        <WebView
          key={orderId}
          source={{ html }}
          onMessage={handleMessage}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={C.accent} size="large" />
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          style={styles.webview}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  title: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: { flex: 1, backgroundColor: '#FFF' },
  loading: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
});
