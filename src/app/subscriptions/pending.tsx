import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Clock, Receipt } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRedemptionDetail, redemptionKeys } from '@/hooks/useRedemptions';
import { subscriptionKeys } from '@/hooks/useSubscriptions';
import { useAuthStore } from '@/store/authStore';
import type { RedemptionItem } from '@/types/redemption';

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  accent:      '#D63527',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  warning:     '#FF9500',
  warningSoft: '#FFF5E0',
  warningDark: '#7A4500',
  skeleton:    '#E5E5EA',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function fmtRequestId(id: number): string {
  return `#${String(id).padStart(6, '0')}`;
}

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function fmtTime(iso: string): string {
  const d       = new Date(toUtc(iso));
  const now     = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ds      = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const time    = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ds === todayMs) return `Today · ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` · ${time}`;
}

// ── Pulsing indicator ──────────────────────────────────────────────────────────

function PulseIndicator() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.18, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6,  duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseCore}>
        <Clock size={28} color={C.warning} strokeWidth={1.8} />
      </View>
    </View>
  );
}

// ── Item list ──────────────────────────────────────────────────────────────────

function ItemsList({ items }: { items: RedemptionItem[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Items Requested</Text>
      <View style={styles.sectionCard}>
        {items.map((item, idx) => (
          <View key={item.menuItemId} style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.menuItemName}
              {item.quantity > 1 ? ` ×${item.quantity}` : ''}
            </Text>
            <Text style={styles.itemTotal}>{fmt(item.totalPrice)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PendingRedemptionScreen() {
  const { redemptionId, subId } = useLocalSearchParams<{
    redemptionId: string;
    subId: string;
  }>();

  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const userId      = useAuthStore((s) => s.userId);

  const [navigated, setNavigated] = useState(false);

  const { data: redemption, refetch } = useRedemptionDetail(redemptionId);

  // Invalidate subscription + history caches after a terminal status.
  const invalidateAfterResolution = useCallback(() => {
    if (subId) {
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(subId) });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.my(0) });
    }
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.byUser(userId) });
    }
    if (subId) {
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.bySubscription(subId) });
    }
  }, [queryClient, subId, userId]);

  // Navigate when status resolves.
  useEffect(() => {
    if (!redemption || navigated) return;

    if (redemption.status === 'APPROVED' || redemption.status === 'COMPLETED') {
      setNavigated(true);
      invalidateAfterResolution();
      router.replace({
        pathname: '/subscriptions/redemption-approved' as never,
        params: {
          redemptionId: String(redemption.id),
          subId:        subId ?? '',
        },
      } as never);
    } else if (redemption.status === 'REJECTED') {
      setNavigated(true);
      router.replace({
        pathname: '/subscriptions/rejected' as never,
        params: {
          redemptionId:  String(redemption.id),
          subId:         subId ?? '',
          reason:        redemption.rejectionReason ?? '',
        },
      } as never);
    }
  }, [redemption?.status, navigated, invalidateAfterResolution, redemption, router, subId]);

  // Poll every 5 seconds while PENDING.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!navigated) void refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch, navigated]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={handleBack} hitSlop={12}>
          <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.topBarTitle}>Redemption Request</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status hero ──────────────────────────────────────────────────── */}
        <View style={styles.heroSection}>
          <PulseIndicator />
          <Text style={styles.heroTitle}>Request Submitted</Text>
          <Text style={styles.heroSub}>Waiting for store approval</Text>

          {/* Status pill */}
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Pending Approval</Text>
          </View>
        </View>

        {/* ── Request details ───────────────────────────────────────────────── */}
        {redemption ? (
          <>
            {/* Request ID */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Request ID</Text>
              <View style={styles.sectionCard}>
                <View style={styles.infoRow}>
                  <Receipt size={14} color={C.muted} strokeWidth={1.8} />
                  <Text style={styles.requestId}>{fmtRequestId(redemption.id)}</Text>
                </View>
              </View>
            </View>

            {/* Items */}
            <ItemsList items={redemption.items} />

            {/* Total + timestamp */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Summary</Text>
              <View style={styles.sectionCard}>
                <View style={[styles.summaryRow, styles.summaryRowBorder]}>
                  <Text style={styles.summaryLabel}>Total Requested</Text>
                  <Text style={styles.summaryValue}>{fmt(redemption.totalAmount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Submitted</Text>
                  <Text style={styles.summaryValue}>{fmtTime(redemption.createdAt)}</Text>
                </View>
              </View>
            </View>

            {/* Instruction */}
            <View style={styles.instructionCard}>
              <Text style={styles.instructionText}>
                Show this screen to the vendor. They'll approve your request and your items will be prepared.
              </Text>
            </View>
          </>
        ) : (
          // Skeleton while first load
          <View style={styles.section}>
            <View style={[styles.skBone, { width: 80, height: 11, marginBottom: 12 }]} />
            <View style={styles.sectionCard}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.summaryRow, i < 2 && styles.summaryRowBorder]}>
                  <View style={[styles.skBone, { width: 100, height: 12 }]} />
                  <View style={[styles.skBone, { width: 70, height: 12 }]} />
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 + insets.bottom }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
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
  topBarTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '600',
    color: C.primary, letterSpacing: -0.2,
  },
  topBarSpacer: { width: 36 },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Hero section ───────────────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 36,
    paddingHorizontal: 24,
    gap: 12,
  },

  // Pulse indicator
  pulseWrap: {
    width: 80, height: 80,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  pulseRing: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.warningSoft,
  },
  pulseCore: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.warningSoft,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.warning, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },

  heroTitle: {
    fontSize: 22, fontWeight: '800',
    color: C.primary, letterSpacing: -0.6,
  },
  heroSub: {
    fontSize: 14, color: C.secondary, fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.warningSoft,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20,
    marginTop: 4,
  },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.warning,
  },
  statusText: {
    fontSize: 12, fontWeight: '700',
    color: C.warningDark, letterSpacing: 0.2,
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700',
    color: C.muted, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },

  // Request ID
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  requestId: {
    fontSize: 18, fontWeight: '800', color: C.primary, letterSpacing: -0.3,
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 12,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  itemName: {
    flex: 1, fontSize: 14, fontWeight: '500', color: C.primary, lineHeight: 20,
  },
  itemTotal: {
    fontSize: 14, fontWeight: '700', color: C.primary, flexShrink: 0,
  },

  // Summary rows
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  summaryRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  summaryLabel: { fontSize: 14, color: C.secondary, fontWeight: '500' },
  summaryValue: { fontSize: 14, color: C.primary, fontWeight: '700' },

  // Instruction
  instructionCard: {
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  instructionText: {
    fontSize: 13, color: C.secondary, lineHeight: 20, fontWeight: '400', textAlign: 'center',
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skBone: {
    height: 13, width: '100%', borderRadius: 7, backgroundColor: C.skeleton,
  },
});
