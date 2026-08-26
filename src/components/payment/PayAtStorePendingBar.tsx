// Persistent "track your payment" bar — shown above the tab bar on every main tab whenever the
// user has one or more in-flight Pay-at-Store payments (QR/code shown, waiting on the store),
// the same way PendingRedemptionBar keeps a pending redemption reachable from anywhere. Without
// this, backing out of the waiting screen (src/app/pay-at-store/[paymentId].tsx) without
// cancelling would leave a payment with no way back short of force-quitting the app (the
// cold-launch resume in src/app/index.tsx only fires on a fresh launch, not on in-app back
// navigation).
//
// More than one session can be open at once (different cards — the backend only dedupes
// PAY_AT_STORE creation per card), so this shows the oldest/primary one plus a "+N more" count,
// mirroring PendingRedemptionBar's own list-with-primary treatment. Each pending session is
// polled independently via SessionWatcher below (not just the one currently shown as primary),
// so an older payment can never get silently stuck/lost while a newer one is in front — the
// exact bug this replaced.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronRight, Store } from 'lucide-react-native';

import { usePayment } from '@/hooks/usePayments';
import { subscriptionKeys } from '@/hooks/useSubscriptions';
import { useQueryClient } from '@tanstack/react-query';
import { usePayAtStoreSessionStore } from '@/store/payAtStoreSessionStore';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { formatCardPrice, CC } from '@/components/cards/theme';
import { notify } from '@/services/notificationService';
import type { StoredPayAtStoreSession } from '@/services/storageService';

const C = {
  gold:     CC.gold,
  goldDeep: '#7A5A1F',
  onGold:   'rgba(255,255,255,0.82)',
} as const;

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED']);

function elapsed(atMs: number): string {
  const min = Math.floor((Date.now() - atMs) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.7, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,   duration: 0,   useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);

  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotPing, { transform: [{ scale }] }]} />
      <View style={styles.dotCore} />
    </View>
  );
}

// Polls one session's status independently of whichever session the bar is currently showing
// as "primary" — every open session needs this, not just the one in front, or an older payment
// could resolve/expire without ever being noticed and cleaned up. Renders nothing itself.
function SessionWatcher({ session }: { session: StoredPayAtStoreSession }) {
  const queryClient = useQueryClient();
  const removeSession = usePayAtStoreSessionStore((s) => s.removeSession);
  const { data: payment } = usePayment(session.paymentId);

  useEffect(() => {
    if (!payment || !TERMINAL_STATUSES.has(payment.status)) return;
    removeSession(session.paymentId);
    if (payment.status === 'SUCCESS') {
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      notify({
        type: 'success',
        title: 'Payment Confirmed',
        message: `${session.cardName} is now active.`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment]);

  return null;
}

export function PayAtStorePendingBar({ bottomOffset }: { bottomOffset: number }) {
  const router = useRouter();
  const sessions = usePayAtStoreSessionStore((s) => s.sessions);
  const hydrated = usePayAtStoreSessionStore((s) => s.hydrated);
  const hydrate = usePayAtStoreSessionStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Oldest first — the one that's been waiting longest gets front-of-line visibility.
  const sorted = [...sessions].sort((a, b) => a.createdAtMs - b.createdAtMs);
  const primarySession = sorted[0] ?? null;
  const extraCount = Math.max(sorted.length - 1, 0);

  const { data: primaryPayment } = usePayment(primarySession?.paymentId, { enabled: !!primarySession });

  const visible = sorted.length > 0;
  const translateY = useRef(new Animated.Value(visible ? 0 : 120)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: visible ? 0 : 120,
        useNativeDriver: true,
        speed: 16,
        bounciness: visible ? 6 : 0,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 220 : 160,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!visible) setMounted(false);
    });
  }, [visible, translateY, opacity]);

  // Same "freeze last known value through the exit animation" trick as PendingRedemptionBar —
  // avoids the bar's content disappearing a frame before the slide-out finishes.
  const lastPrimaryRef = useRef(primarySession);
  if (primarySession) lastPrimaryRef.current = primarySession;

  const watchers = (
    <>
      {sessions.map((s) => (
        <SessionWatcher key={s.paymentId} session={s} />
      ))}
    </>
  );

  if (!mounted) return watchers;
  const primary = primarySession ?? lastPrimaryRef.current;
  if (!primary) return watchers;

  const statusText =
    primaryPayment?.status === 'AWAITING_VENDOR_CONFIRMATION' ? 'Store is confirming…' : 'Waiting for the store to scan';

  return (
    <>
      {watchers}
      <Animated.View
        style={[styles.wrap, { bottom: bottomOffset + 10, opacity, transform: [{ translateY }] }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={({ pressed }) => [styles.barPressable, pressed && styles.barPressed]}
          onPress={() => router.push(buildRoute.payAtStore(primary.paymentId) as never)}
        >
          <LinearGradient colors={[C.gold, C.goldDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bar}>
            <View style={styles.iconWrap}>
              <Store size={16} color="#FFFFFF" strokeWidth={2.2} />
            </View>

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  Pay at Store · {formatCardPrice(primary.amount)}
                </Text>
                <PulseDot />
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {statusText} · {elapsed(primary.createdAtMs)}
                {extraCount > 0 ? ` · +${extraCount} more` : ''}
              </Text>
            </View>

            <View style={styles.trackBtn}>
              <Text style={styles.trackBtnText}>Track</Text>
              <ChevronRight size={15} color="#FFFFFF" strokeWidth={2.4} />
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  barPressable: {
    borderRadius: 18,
    ...Platform.select({
      ios: { shadowColor: C.goldDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  barPressed: { opacity: 0.9 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 12,
    overflow: 'hidden',
  },

  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  body: { flex: 1, gap: 2, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: {
    flexShrink: 1,
    fontSize: 13.5,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.medium,
    color: C.onGold,
  },

  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingLeft: 11,
    paddingRight: 7,
    flexShrink: 0,
  },
  trackBtnText: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  dotWrap: { width: 8, height: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  dotPing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFEFC7' },
  dotCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFEFC7' },
});
