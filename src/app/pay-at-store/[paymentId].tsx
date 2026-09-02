// Pay-at-Store waiting/status screen. Full-screen route (not a modal) so it survives
// independently of ActivationSheet's mount lifecycle — backgrounding, app kill, cold-launch
// resume (see src/app/index.tsx). Owns every Pay-at-Store status from PENDING through a
// terminal outcome; on SUCCESS it hands off to the existing /subscriptions/success screen,
// the same one ONLINE payments already use.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Clock3 } from 'lucide-react-native';
import { subscriptionApi } from '@/api/subscription.api';
import { useCancelPayment, useCreatePayment, usePayment } from '@/hooks/usePayments';
import { subscriptionKeys } from '@/hooks/useSubscriptions';
import type { StoredPayAtStoreSession } from '@/services/storageService';
import { usePayAtStoreSessionStore } from '@/store/payAtStoreSessionStore';
import { CC } from '@/components/cards/theme';
import { ManropeWeights } from '@/constants/theme';
import { ROUTES, buildRoute } from '@/constants/routes';
import { PayAtStoreQrCard } from '@/components/payment/PayAtStoreQrCard';
import { VerificationCodeDisplay } from '@/components/payment/VerificationCodeDisplay';
import { LockedCardPreview } from '@/components/payment/LockedCardPreview';
import { PulsingDot } from '@/components/ui/PulsingDot';
import { StatusRing } from '@/components/ui/StatusRing';
import { FadeInView } from '@/components/ui/FadeInView';
import type { PaymentStatus } from '@/types/payment';

const C = CC;

const OPEN_STATUSES: PaymentStatus[] = ['CREATED', 'PENDING', 'PROCESSING', 'AWAITING_VENDOR_CONFIRMATION'];

// ── Helpers ──────────────────────────────────────────────────────────────────────

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function useCountdown(expiresAtIso: string | undefined | null): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAtIso) {
      setRemainingMs(null);
      return;
    }
    const target = new Date(toUtc(expiresAtIso)).getTime();
    function tick() {
      setRemainingMs(Math.max(0, target - Date.now()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtIso]);
  return remainingMs;
}

function fmtCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m left`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
}

function extractGetError(err: unknown): { title: string; message: string; kind: 'notFound' | 'network' | 'other' } {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const code = (err as { code?: string })?.code;
  if (status === 404) {
    return {
      kind: 'notFound',
      title: "Payment session not found",
      message: "This payment may already be complete or is no longer available.",
    };
  }
  if (code === 'ERR_NETWORK') {
    return { kind: 'network', title: 'No internet connection', message: 'Check your connection and try again.' };
  }
  if (code === 'ECONNABORTED') {
    return { kind: 'network', title: 'Request timed out', message: 'Check your connection and try again.' };
  }
  return { kind: 'other', title: 'Something went wrong', message: 'Please try again.' };
}

function extractApiError(err: unknown): string {
  const resp = (err as { response?: { data?: { message?: string } } })?.response;
  if (resp?.data?.message) return resp.data.message;
  const code = (err as { code?: string })?.code;
  if (code === 'ERR_NETWORK') return 'Network error. Check your connection and try again.';
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  return 'Something went wrong. Please try again.';
}

// ── Top bar ──────────────────────────────────────────────────────────────────────

function TopBar({ onBack, disabled }: { onBack: () => void; disabled: boolean }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={[styles.backBtn, disabled && styles.backBtnDisabled]} onPress={onBack} disabled={disabled} hitSlop={12}>
        <ArrowLeft size={20} color={disabled ? C.muted : C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Pay at Store</Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────────

export default function PayAtStoreScreen() {
  const params = useLocalSearchParams<{
    paymentId: string;
    cardDefinitionId?: string;
    storeId?: string;
    couponCode?: string;
    cardName?: string;
    amount?: string;
    qrPayload?: string;
    verificationCode?: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const paymentIdNum = Number(params.paymentId);

  const [sessionMeta, setSessionMeta] = useState<StoredPayAtStoreSession | null>(null);
  const [metaResolved, setMetaResolved] = useState(false);
  const [successHandled, setSuccessHandled] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { data: payment, isError: getFailed, error: getError, refetch } = usePayment(paymentIdNum);
  const { mutateAsync: cancelPayment, isPending: cancelling } = useCancelPayment();
  const { mutateAsync: createPayment, isPending: creatingRetry } = useCreatePayment();

  const storeHydrated = usePayAtStoreSessionStore((s) => s.hydrated);
  const addStoreSession = usePayAtStoreSessionStore((s) => s.addSession);
  const removeStoreSession = usePayAtStoreSessionStore((s) => s.removeSession);
  const hydrateStore = usePayAtStoreSessionStore((s) => s.hydrate);
  // Only this payment's own entry — selected out of the list so this component doesn't
  // re-render (or re-run effects keyed on it) whenever an unrelated session changes.
  const storeSessionForThisPayment = usePayAtStoreSessionStore(
    (s) => s.sessions.find((sess) => sess.paymentId === paymentIdNum) ?? null,
  );

  // Fresh navigation from ActivationSheet — route params already carry the QR/code (the store
  // was already given this session there too, before navigating here). Runs once per paymentId;
  // deliberately does NOT depend on the store, since writing to it from here as well would
  // otherwise re-trigger this same effect (an infinite update loop — the earlier version of
  // this file hit exactly that).
  useEffect(() => {
    if (!(params.qrPayload && params.verificationCode && params.cardName && params.amount)) return;
    const fromParams: StoredPayAtStoreSession = {
      paymentId: paymentIdNum,
      cardDefinitionId: Number(params.cardDefinitionId ?? 0),
      storeId: Number(params.storeId ?? 0),
      couponCode: params.couponCode || undefined,
      cardName: params.cardName,
      amount: Number(params.amount),
      qrPayload: params.qrPayload,
      verificationCode: params.verificationCode,
      createdAtMs: Date.now(),
    };
    setSessionMeta(fromParams);
    addStoreSession(fromParams);
    setMetaResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentIdNum]);

  // Cold-launch / tracker-bar resume — no fresh params, so read from the persisted session
  // store instead. Only runs (and only needs to run) when the params branch above didn't fire.
  useEffect(() => {
    if (params.qrPayload && params.verificationCode && params.cardName && params.amount) return;
    if (!storeHydrated) {
      void hydrateStore();
      return;
    }
    setSessionMeta(storeSessionForThisPayment);
    setMetaResolved(true);
  }, [paymentIdNum, storeHydrated, storeSessionForThisPayment, params.qrPayload, params.verificationCode, params.cardName, params.amount, hydrateStore]);

  const remainingMs = useCountdown(payment?.expiresAt);
  const isOpen = !payment || OPEN_STATUSES.includes(payment.status);

  // ── SUCCESS handoff ────────────────────────────────────────────────────────────
  // Hands off to /subscriptions/success immediately — no separate "confirmed" reveal
  // screen in between. That screen already owns the one checkmark + card-flip moment
  // (see PurchaseCardReveal); showing a second, different-looking unlock animation
  // here first just doubled up the reveal and read as less polished than ONLINE,
  // which goes straight from Razorpay checkout into that same screen.
  useEffect(() => {
    if (!payment || successHandled) return;
    if (payment.status === 'SUCCESS' && payment.subscriptionId) {
      setSuccessHandled(true);
      removeStoreSession(paymentIdNum);
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      subscriptionApi
        .getById(payment.subscriptionId)
        .then((sub) => {
          router.replace({
            pathname: '/subscriptions/success',
            params: {
              subId: String(sub.id),
              cardName: sub.cardName,
              walletBalance: String(sub.walletBalance),
              expiresAt: sub.expiresAt,
            },
          } as never);
        })
        .catch(() => {
          router.replace(ROUTES.TABS.CARDS as never);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, successHandled]);

  // Clear the persisted session once the payment reaches a non-success terminal state —
  // nothing left to resume, and the QR/code are no longer valid.
  useEffect(() => {
    if (payment && (payment.status === 'FAILED' || payment.status === 'CANCELLED' || payment.status === 'EXPIRED')) {
      removeStoreSession(paymentIdNum);
    }
  }, [payment, paymentIdNum, removeStoreSession]);

  const busy = cancelling || creatingRetry || retrying;

  function handleBack() {
    if (busy) return;
    if (router.canGoBack()) router.back();
    else router.replace(ROUTES.TABS.HOME as never);
  }

  async function handleCancel() {
    setActionError(null);
    try {
      await cancelPayment(paymentIdNum);
    } catch {
      // Surfaced through the next poll if the cancel didn't actually land server-side.
    } finally {
      removeStoreSession(paymentIdNum);
      handleBack();
    }
  }

  function goToCardDetail() {
    if (sessionMeta?.cardDefinitionId) {
      router.replace(buildRoute.cardDetail(sessionMeta.cardDefinitionId) as never);
    } else {
      router.replace(ROUTES.TABS.CARDS as never);
    }
  }

  async function handleTryAgain() {
    if (!sessionMeta?.cardDefinitionId || !sessionMeta.storeId) {
      goToCardDetail();
      return;
    }
    setActionError(null);
    setRetrying(true);
    try {
      const result = await createPayment({
        body: {
          cardDefinitionId: sessionMeta.cardDefinitionId,
          storeId: sessionMeta.storeId,
          paymentMethod: 'PAY_AT_STORE',
          ...(sessionMeta.couponCode ? { couponCode: sessionMeta.couponCode } : {}),
        },
        idempotencyKey: `${sessionMeta.cardDefinitionId}-pas-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      if (!result.qrPayload || !result.verificationCode) {
        setActionError('Could not start in-store payment. Please try again.');
        return;
      }

      removeStoreSession(paymentIdNum); // the terminal payment being retried — defensive, in case
      // the terminal-clear effect above hasn't run yet.
      addStoreSession({
        paymentId: result.paymentId,
        cardDefinitionId: sessionMeta.cardDefinitionId,
        storeId: sessionMeta.storeId,
        couponCode: sessionMeta.couponCode,
        cardName: sessionMeta.cardName,
        amount: result.amount,
        qrPayload: result.qrPayload,
        verificationCode: result.verificationCode,
        createdAtMs: Date.now(),
      });
      router.replace(buildRoute.payAtStore(result.paymentId) as never);
    } catch (err) {
      setActionError(extractApiError(err));
    } finally {
      setRetrying(false);
    }
  }

  const status = payment?.status;
  const cardName = sessionMeta?.cardName ?? params.cardName ?? 'Membership';
  const amount = payment?.amount ?? sessionMeta?.amount ?? Number(params.amount ?? 0);

  const statusCopy = useMemo(() => {
    switch (status) {
      case 'AWAITING_VENDOR_CONFIRMATION':
        return 'Store is confirming your payment…';
      case 'PROCESSING':
        return 'Processing…';
      default:
        return 'Waiting for the store to scan';
    }
  }, [status]);

  // ── Loading (resolving session context) ───────────────────────────────────────
  if (!metaResolved) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── GET itself failed (not a payment-status problem — the request failed) ──────
  if (getFailed && !payment) {
    const { title, message, kind } = extractGetError(getError);
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled={false} />
        <View style={styles.centerState}>
          <AlertCircle size={40} color={C.muted} strokeWidth={1.5} />
          <Text style={styles.centerTitle}>{title}</Text>
          <Text style={styles.centerSub}>{message}</Text>
          {kind === 'notFound' ? (
            <Pressable style={styles.primaryBtn} onPress={goToCardDetail}>
              <Text style={styles.primaryBtnText}>Back to Cards</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={() => void refetch()}>
              <Text style={styles.primaryBtnText}>Retry</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Terminal, non-success states ────────────────────────────────────────────────
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
    const title = status === 'EXPIRED' ? 'Payment Session Expired' : status === 'CANCELLED' ? 'Payment Cancelled' : 'Something Went Wrong';
    const sub =
      status === 'EXPIRED'
        ? 'This payment code is no longer valid.'
        : status === 'CANCELLED'
          ? 'This payment was cancelled.'
          : (payment?.failureReason ?? 'Your payment could not be completed.');
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar onBack={handleBack} disabled={busy} />
        <View style={styles.centerState}>
          <View style={styles.failIcon}>
            <AlertCircle size={36} color={C.dangerDark} strokeWidth={1.8} />
          </View>
          <Text style={styles.centerTitle}>{title}</Text>
          <Text style={styles.centerSub}>{sub}</Text>
          {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}
          <Pressable style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]} onPress={() => void handleTryAgain()} disabled={busy}>
            {retrying || creatingRetry ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.primaryBtnText}>Try Again</Text>}
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={goToCardDetail} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Back to Card</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── SUCCESS — momentary bridge while the subscription loads, then straight to
  // /subscriptions/success for the actual reveal (same as ONLINE payments; see the
  // handoff effect above). Deliberately no checkmark/card flourish here — showing
  // one now and another, different-looking one a beat later read as two separate,
  // clashing "success" moments instead of one polished one. ─────────────────────
  if (status === 'SUCCESS') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.centerTitle}>Payment Confirmed</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Open — PENDING / AWAITING_VENDOR_CONFIRMATION — QR + code + live status ────
  const showQr = !!sessionMeta?.qrPayload && !!sessionMeta?.verificationCode;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={handleBack} disabled={busy} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <FadeInView>
          <LockedCardPreview cardName={cardName} amount={amount} unlocked={false} />
        </FadeInView>

        {showQr ? (
          <FadeInView delay={80}>
            <PayAtStoreQrCard qrPayload={sessionMeta!.qrPayload} />
          </FadeInView>
        ) : (
          <FadeInView delay={80}>
            <View style={styles.noMetaCard}>
              <Text style={styles.noMetaText}>
                The QR/code for this payment are not available on this device. You can still cancel or wait for
                the store to confirm using the code they were shown when the payment was created.
              </Text>
            </View>
          </FadeInView>
        )}

        {showQr && (
          <FadeInView delay={140}>
            <VerificationCodeDisplay code={sessionMeta!.verificationCode} />
          </FadeInView>
        )}

        <FadeInView delay={200}>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              {status === 'AWAITING_VENDOR_CONFIRMATION' ? (
                <StatusRing size={16} color={C.info} />
              ) : (
                <PulsingDot color={C.warningDark} size={9} />
              )}
              <Text style={styles.statusText}>{statusCopy}</Text>
            </View>

            {remainingMs != null && isOpen && (
              <View style={styles.expiryRow}>
                <Clock3 size={13} color={C.muted} strokeWidth={2} />
                <Text style={styles.expiryText}>{fmtCountdown(remainingMs)}</Text>
              </View>
            )}
          </View>
        </FadeInView>

        {actionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{actionError}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cancelBtn, busy && styles.primaryBtnDisabled]} onPress={() => void handleCancel()} disabled={busy}>
          {cancelling ? <ActivityIndicator color={C.dangerDark} size="small" /> : <Text style={styles.cancelBtnText}>Cancel Payment</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────────

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
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  backBtnDisabled: { opacity: 0.4 },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: ManropeWeights.semiBold, color: C.primary, letterSpacing: -0.2 },
  topBarSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16, gap: 14, paddingBottom: 32 },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  centerTitle: { fontSize: 18, fontFamily: ManropeWeights.bold, color: C.primary, marginTop: 8, textAlign: 'center' },
  centerSub: { fontSize: 14, fontFamily: ManropeWeights.regular, color: C.secondary, textAlign: 'center', lineHeight: 21, marginTop: 4 },
  actionErrorText: { fontSize: 13, fontFamily: ManropeWeights.medium, color: C.dangerDark, textAlign: 'center', marginTop: 4 },

  failIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.dangerSoft, justifyContent: 'center', alignItems: 'center' },

  primaryBtn: { marginTop: 14, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center', minWidth: 200 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontFamily: ManropeWeights.bold },
  secondaryBtn: { marginTop: 4, paddingVertical: 12, paddingHorizontal: 32 },
  secondaryBtnText: { color: C.secondary, fontSize: 14, fontFamily: ManropeWeights.semiBold },

  noMetaCard: { backgroundColor: C.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  noMetaText: { fontSize: 13, fontFamily: ManropeWeights.regular, color: C.secondary, lineHeight: 19 },

  statusCard: {
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusText: { fontSize: 13.5, fontFamily: ManropeWeights.semiBold, color: C.secondary },

  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 8,
    width: '100%',
  },
  expiryText: { fontSize: 12, fontFamily: ManropeWeights.medium, color: C.muted },

  errorBanner: { backgroundColor: C.dangerSoft, borderRadius: 12, padding: 14, borderLeftWidth: 3, borderLeftColor: C.accent },
  errorBannerText: { fontSize: 13, fontFamily: ManropeWeights.medium, color: C.dangerDark, lineHeight: 18 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  cancelBtn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', backgroundColor: C.dangerSoft },
  cancelBtnText: { color: C.dangerDark, fontSize: 15, fontFamily: ManropeWeights.bold },
});
