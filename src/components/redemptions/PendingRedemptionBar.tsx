// Persistent "track your request" bar — shown above the tab bar on every
// main tab whenever the user has a redemption request awaiting vendor
// approval, the same way a food-delivery app keeps an active order reachable
// from anywhere until it's resolved. Tapping it reopens the live-polling
// pending screen (src/app/subscriptions/pending.tsx).

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ChevronRight, Clock } from 'lucide-react-native';

import { getRedemptionCreatedAtMs, usePendingRedemptions } from '@/hooks/useRedemptions';
import { useAllStores } from '@/hooks/useStores';
import { useAuthStore } from '@/store/authStore';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import type { Redemption } from '@/types/redemption';

const C = {
  accent:     '#D63527',
  accentDeep: '#8E1F15',
  onAccent:   'rgba(255,255,255,0.78)',
} as const;

// ── Elapsed time ─────────────────────────────────────────────────────────────

function elapsed(atMs: number): string {
  const min = Math.floor((Date.now() - atMs) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

// ── Pulsing status dot ───────────────────────────────────────────────────────

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

// ── Bar content (re-rendered every 30s to keep "Xm ago" fresh) ───────────────

function BarContent({ redemption, extraCount }: { redemption: Redemption; extraCount: number }) {
  const { data: allStores = [] } = useAllStores();
  const store = allStores.find((s) => s.id === redemption.storeId);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const itemCount = redemption.items.reduce((n, it) => n + it.quantity, 0);

  return (
    <>
      <View style={styles.iconWrap}>
        <Clock size={16} color="#FFFFFF" strokeWidth={2.2} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {store?.name ?? 'Redemption'} request pending
          </Text>
          <PulseDot />
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {itemCount} item{itemCount === 1 ? '' : 's'} · {elapsed(getRedemptionCreatedAtMs(redemption))}
          {extraCount > 0 ? ` · +${extraCount} more` : ''}
        </Text>
      </View>

      <View style={styles.trackBtn}>
        <Text style={styles.trackBtnText}>Track</Text>
        <ChevronRight size={15} color="#FFFFFF" strokeWidth={2.4} />
      </View>
    </>
  );
}

// ── Bar ────────────────────────────────────────────────────────────────────

export function PendingRedemptionBar({ bottomOffset }: { bottomOffset: number }) {
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const { pending } = usePendingRedemptions(userId);

  const visible = pending.length > 0;
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

  // Once the last pending redemption resolves, `pending` goes empty in the
  // same render where `mounted` is still true (the exit animation hasn't
  // finished yet) — freeze the last known redemption so that frame renders
  // the fading-out bar instead of crashing on an undefined `primary`.
  const lastPrimaryRef = useRef<Redemption | null>(null);
  if (pending[0]) lastPrimaryRef.current = pending[0];

  if (!mounted) return null;

  const primary = pending[0] ?? lastPrimaryRef.current;
  if (!primary) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { bottom: bottomOffset + 10, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [styles.barPressable, pressed && styles.barPressed]}
        onPress={() =>
          router.push(
            buildRoute.subscriptionPending(String(primary.id), String(primary.subscriptionId)) as never,
          )
        }
      >
        <LinearGradient
          colors={[C.accent, C.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bar}
        >
          <BarContent redemption={primary} extraCount={Math.max(pending.length - 1, 0)} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  barPressable: {
    borderRadius: 18,
    ...Platform.select({
      ios: { shadowColor: C.accentDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 16 },
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
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    color: C.onAccent,
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
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  // Pulsing dot
  dotWrap: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  dotPing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD9CF',
  },
  dotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFD9CF',
  },
});
