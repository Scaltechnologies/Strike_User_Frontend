// Native (iOS/Android) implementation: Razorpay's own checkout.js loaded inside a WebView,
// bridged back to React Native via window.ReactNativeWebView.postMessage. This is Razorpay's
// documented integration path for apps that don't ship the native react-native-razorpay SDK —
// no extra native module/config-plugin/dev-client rebuild required beyond react-native-webview
// itself, which is already a standard Expo-supported package.
import { useMemo } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { RazorpayCheckoutProps } from './RazorpayCheckout.types';

function buildHtml(props: RazorpayCheckoutProps): string {
  const options = {
    key: props.keyId,
    order_id: props.orderId,
    amount: Math.round(props.amount * 100), // paise
    currency: props.currency,
    name: props.name,
    description: props.description,
    prefill: {
      ...(props.prefillEmail ? { email: props.prefillEmail } : {}),
      ...(props.prefillContact ? { contact: props.prefillContact } : {}),
    },
    theme: { color: props.themeColor ?? '#D63527' },
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>html,body{margin:0;padding:0;height:100%;background:transparent;}</style>
</head>
<body>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  var options = ${JSON.stringify(options)};
  options.handler = function (response) {
    post({
      type: 'success',
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_signature: response.razorpay_signature,
    });
  };
  options.modal = {
    ondismiss: function () { post({ type: 'dismiss' }); },
  };
  try {
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      post({ type: 'failed', description: response && response.error && response.error.description });
    });
    rzp.open();
  } catch (e) {
    post({ type: 'error', message: String(e) });
  }
</script>
</body>
</html>`;
}

export function RazorpayCheckout(props: RazorpayCheckoutProps) {
  const { visible, onSuccess, onDismiss } = props;
  const html = useMemo(() => buildHtml(props), [props]);

  if (!visible) return null;

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data) as
        | { type: 'success'; razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
        | { type: 'dismiss' }
        | { type: 'failed'; description?: string }
        | { type: 'error'; message?: string };

      if (data.type === 'success') {
        onSuccess({
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_order_id: data.razorpay_order_id,
          razorpay_signature: data.razorpay_signature,
        });
      } else {
        // failed / error / dismiss all land on the same reconciliation path — the backend
        // asks the gateway directly rather than trusting any of these client-side signals.
        onDismiss();
      }
    } catch {
      onDismiss();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss} presentationStyle="pageSheet">
      <View style={styles.container}>
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          onMessage={handleMessage}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#D63527" />
            </View>
          )}
          javaScriptEnabled
          domStorageEnabled
          onError={onDismiss}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
