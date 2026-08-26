// Real-money checkout for a card purchase. This is the ONLY path that results in a
// wallet-credited subscription for a USER — the backend enforces this the same way:
// POST /api/subscriptions is ADMIN-only now, and a subscription is created server-side
// exclusively once POST /api/payments/{id}/verify (or the webhook) confirms a genuine
// gateway SUCCESS. Nothing here ever creates the subscription directly.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft, ShieldCheck, XCircle } from 'lucide-react-native';
import { useCardDetail } from '@/hooks/useCards';
import { useProfile } from '@/hooks/useProfile';
import {
  useCancelPayment,
  useCreatePayment,
  usePayment,
  useVerifyPayment,
} from '@/hooks/usePayments';
import { subscriptionApi } from '@/api/subscription.api';
import { formatCardPrice, CC } from '@/components/cards/theme';
import { RazorpayCheckout } from '@/components/payment/RazorpayCheckout';
import type { RazorpayCheckoutResult } from '@/components/payment/RazorpayCheckout.types';
import { notify } from '@/services/notificationService';
import { ROUTES } from '@/constants/routes';
import type { PaymentStatus } from '@/types/payment';

const C = CC;

function extractCreateError(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  if (status === 503) return 'Payments are temporarily unavailable. Please try again shortly.';
  if (status === 400 && message) return message;
  if (status === 401) return 'Session expired. Please log in again.';
  const code = (err as { code?: string })?.code;
  if (code === 'ERR_NETWORK') return 'Network error. Check your connection and try again.';
  return message ?? 'Could not start the payment. Please try again.';
}

function extractActionError(err: unknown): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  const code = (err as { code?: string })?.code;
  if (code === 'ERR_NETWORK') return 'Network error. Check your connection and try again.';
  return message ?? 'Something went wrong. Please try again.';
}

function genIdempotencyKey(): string {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({ onBack, disabled }: { onBack: () => void; disabled: boolean }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={[styles.backBtn, disabled && styles.backBtnDisabled]} onPress={onBack} disabled={disabled} hitSlop={12}>
        <ArrowLeft size={20} color={disabled ? C.muted : C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Checkout</Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CheckoutScreen() {
  const { cardDefinitionId, storeId, couponCode } = useLocalSearchParams<{
    cardDefinitionId: string;
    storeId: string;
    couponCode?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const idempotencyKeyRef = useRef(genIdempotencyKey());
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [navigated, setNavigated] = useState(false);

  const { data: card, isLoading: cardLoading } = useCardDetail(cardDefinitionId);
  const { data: profile } = useProfile();

  const { mutate: createPayment, isPending: creating } = useCreatePayment();
  // Retry has no dedicated endpoint — it opens a brand-new gateway attempt via the
  // same create endpoint, in its own mutation instance so its pending state doesn't
  // drive the initial "Setting up your payment…" full-screen loader.
  const { mutateAsync: retryPayment, isPending: retrying } = useCreatePayment();
  const { data: payment } = usePayment(paymentId ?? undefined);
  const { mutateAsync: verifyPayment, isPending: verifying } = useVerifyPayment();
  const { mutateAsync: cancelPayment, isPending: reconciling } = useCancelPayment();

  const busy = creating || verifying || reconciling || retrying;
  const status: PaymentStatus | undefined = payment?.status;

  // Create the payment exactly once per screen visit — the idempotency key protects
  // against a double-fire (e.g. React Strict Mode double-invoke) opening two sessions.
  useEffect(() => {
    if (!cardDefinitionId || !storeId) {
      setCreateError('Missing card details.');
      return;
    }
    createPayment(
      {
        body: {
          cardDefinitionId: Number(cardDefinitionId),
          storeId: Number(storeId),
          ...(couponCode ? { couponCode } : {}),
        },
        idempotencyKey: idempotencyKeyRef.current,
      },
      {
        onSuccess: (data) => setPaymentId(data.paymentId),
        onError: (err) => setCreateError(extractCreateError(err)),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToSuccess = useCallback(
    async (subscriptionId: number) => {
      try {
        const sub = await subscriptionApi.getById(subscriptionId);
        notify({
          type: 'success',
          title: 'Payment Successful',
          message: `${sub.cardName} — wallet loaded with ${formatCardPrice(sub.walletBalance)}`,
        });
        router.replace({
          pathname: '/subscriptions/success',
          params: {
            subId: String(sub.id),
            cardName: sub.cardName,
            walletBalance: String(sub.walletBalance),
            expiresAt: sub.expiresAt,
          },
        } as never);
      } catch {
        notify({ type: 'success', title: 'Payment Successful', message: 'Your membership is being activated.' });
        router.replace(ROUTES.TABS.CARDS as never);
      }
    },
    [router],
  );

  // Fire exactly once, the moment the payment resolves to SUCCESS — from a webhook
  // landing between polls, a verify response, or a cancel-reconcile response.
  useEffect(() => {
    if (!payment || navigated) return;
    if (payment.status === 'SUCCESS' && payment.subscriptionId) {
      setNavigated(true);
      void goToSuccess(payment.subscriptionId);
    }
  }, [payment, navigated, goToSuccess]);

  function handleBack() {
    if (busy || checkoutOpen) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function handleOpenCheckout() {
    setActionError(null);
    setCheckoutOpen(true);
  }

  function handleRazorpaySuccess(result: RazorpayCheckoutResult) {
    setCheckoutOpen(false);
    verifyPayment({
      paymentId: paymentId!,
      body: {
        gatewayOrderId: result.razorpay_order_id,
        gatewayPaymentId: result.razorpay_payment_id,
        gatewaySignature: result.razorpay_signature,
      },
    }).catch((err) => setActionError(extractActionError(err)));
  }

  function handleRazorpayDismiss() {
    setCheckoutOpen(false);
    // Never assume "dismissed" means "failed" — the backend checks the gateway directly
    // before deciding; a charge that actually landed still resolves to SUCCESS.
    cancelPayment(paymentId!).catch(() => {
      /* reconciliation failure is surfaced via the polled payment status, not here */
    });
  }

  function handleRetry() {
    setActionError(null);
    idempotencyKeyRef.current = genIdempotencyKey();
    retryPayment({
      body: {
        cardDefinitionId: Number(cardDefinitionId),
        storeId: Number(storeId),
        ...(couponCode ? { couponCode } : {}),
      },
      idempotencyKey: idempotencyKeyRef.current,
    })
      .then((data) => {
        setPaymentId(data.paymentId);
        setCheckoutOpen(true);
      })
      .catch((err) => setActionError(extractActionError(err)));
  }

  // ── Create-time failure — nothing was ever charged, just go back ─────────────
  if (createError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled={false} />
        <View style={styles.centerState}>
          <AlertCircle size={40} color={C.muted} strokeWidth={1.5} />
          <Text style={styles.centerTitle}>Couldn't start payment</Text>
          <Text style={styles.centerSub}>{createError}</Text>
          <Pressable style={styles.primaryBtn} onPress={handleBack}>
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Preparing payment ─────────────────────────────────────────────────────────
  if (creating || !payment || cardLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.centerSub}>Setting up your payment…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Terminal failure — offer retry, which opens a brand-new gateway attempt ───
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
    const title = status === 'EXPIRED' ? 'Payment Session Expired' : status === 'CANCELLED' ? 'Payment Cancelled' : 'Payment Failed';
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled={busy} />
        <View style={styles.centerState}>
          <View style={styles.failIcon}>
            <XCircle size={36} color="#C0261A" strokeWidth={1.8} />
          </View>
          <Text style={styles.centerTitle}>{title}</Text>
          <Text style={styles.centerSub}>
            {payment.failureReason ?? 'Your payment could not be completed.'}
          </Text>
          {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}
          <Pressable
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
            onPress={handleRetry}
            disabled={busy}
          >
            {retrying ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.primaryBtnText}>Retry Payment</Text>}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={handleBack} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Confirming — verify/cancel returned an uncertain state, or a webhook hasn't
  //    landed yet; usePayment polls in the background until this resolves ──────
  if (status === 'PROCESSING' || verifying || reconciling) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.centerTitle}>Confirming your payment…</Text>
          <Text style={styles.centerSub}>This usually takes just a few seconds. Please don't close the app.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Ready — payment session open (CREATED/PENDING), waiting on the user to pay ─
  const cardName = card?.name ?? 'Membership';
  const ctaHeight = 56 + 24 + insets.bottom;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={handleBack} disabled={busy} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardName} numberOfLines={2}>{cardName}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount to pay</Text>
            <Text style={styles.summaryAmount}>{formatCardPrice(payment.amount)}</Text>
          </View>
          {card ? (
            <View style={[styles.summaryRow, styles.summaryRowBorder]}>
              <Text style={styles.summaryLabel}>Wallet credit</Text>
              <Text style={styles.summaryValue}>{formatCardPrice(card.walletAmount)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.secureNote}>
          <ShieldCheck size={14} color={C.muted} strokeWidth={2} />
          <Text style={styles.secureNoteText}>
            Payments are processed securely by Razorpay. Your card/UPI details never reach Strike's servers.
          </Text>
        </View>

        {actionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{actionError}</Text>
          </View>
        ) : null}

        <View style={{ height: ctaHeight + 16 }} />
      </ScrollView>

      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.payBtn, busy && styles.primaryBtnDisabled]}
          onPress={handleOpenCheckout}
          disabled={busy}
        >
          {creating ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.payBtnText}>Pay {formatCardPrice(payment.amount)}</Text>
          )}
        </Pressable>
      </View>

      <RazorpayCheckout
        visible={checkoutOpen}
        keyId={payment.gatewayKeyId ?? ''}
        orderId={payment.gatewayOrderId ?? ''}
        amount={payment.amount}
        currency={payment.currency}
        name="Strike"
        description={cardName}
        prefillEmail={profile?.email ?? undefined}
        prefillContact={profile?.phone ?? undefined}
        themeColor={C.accent}
        onSuccess={handleRazorpaySuccess}
        onDismiss={handleRazorpayDismiss}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    minHeight: 52,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center',
  },
  backBtnDisabled: { opacity: 0.4 },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: C.primary, letterSpacing: -0.2 },
  topBarSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16, gap: 14 },

  // Center states (loading / error / terminal)
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  centerTitle: { fontSize: 17, fontWeight: '700', color: C.primary, marginTop: 8, textAlign: 'center' },
  centerSub: { fontSize: 14, color: C.secondary, textAlign: 'center', lineHeight: 21, marginTop: 4 },
  actionErrorText: { fontSize: 13, color: '#C0261A', fontWeight: '500', textAlign: 'center', marginTop: 4 },

  failIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#FEF0EE', justifyContent: 'center', alignItems: 'center',
  },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 32,
    alignItems: 'center',
    minWidth: 200,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { marginTop: 4, paddingVertical: 12, paddingHorizontal: 32 },
  secondaryBtnText: { color: C.secondary, fontSize: 14, fontWeight: '600' },

  // Summary card
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  summaryCardName: { fontSize: 16, fontWeight: '700', color: C.primary, marginBottom: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  summaryRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  summaryLabel: { fontSize: 14, color: C.secondary, fontWeight: '500' },
  summaryValue: { fontSize: 14, color: C.primary, fontWeight: '700' },
  summaryAmount: { fontSize: 22, color: C.primary, fontWeight: '800', letterSpacing: -0.5 },

  secureNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: C.surface, borderRadius: 12, padding: 14,
  },
  secureNoteText: { flex: 1, fontSize: 12, color: C.secondary, lineHeight: 18 },

  errorBanner: {
    backgroundColor: '#FEF0EE', borderRadius: 12, padding: 14,
    borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  errorBannerText: { fontSize: 13, color: '#C0261A', fontWeight: '500', lineHeight: 18 },

  // Sticky pay bar
  stickyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 16,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  payBtn: {
    backgroundColor: C.accent, borderRadius: 16, paddingVertical: 17, alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.40, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  payBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
});
