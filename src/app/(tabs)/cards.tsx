import { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CreditCard, Sparkles } from 'lucide-react-native';
import { useMyActiveSubscriptions, useMySubscriptions } from '@/hooks/useSubscriptions';
import type { Subscription, SubscriptionStatus } from '@/types/subscription';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  accent:      '#D63527',
  accentSoft:  '#FEF2EF',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  success:     '#34C759',
  successBg:   '#EDFAF2',
  successText: '#1A7A35',
  danger:      '#FF3B30',
  dangerBg:    '#FEF0EE',
  dangerText:  '#C0261A',
  warning:     '#FF9500',
  warningBg:   '#FFF5E0',
  warningText: '#92540A',
  skeleton:    '#E5E5EA',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Deterministic card background from cardName hash
const CARD_GRADIENTS = [
  ['#1C1C2E', '#2D2D44'],
  ['#0A2342', '#1A3A5C'],
  ['#1A1A2E', '#16213E'],
  ['#0D1B2A', '#1B2838'],
  ['#1B1B2F', '#2A2A4A'],
  ['#0F2027', '#203A43'],
  ['#16213E', '#0F3460'],
] as const;

function cardBg(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CARD_GRADIENTS.length;
  return CARD_GRADIENTS[idx][0];
}

function formatBalance(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysLeft(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const cfg: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
    ACTIVE:    { label: 'Active',    color: C.successText, bg: C.successBg  },
    EXPIRED:   { label: 'Expired',   color: C.muted,       bg: '#F2F2F7'    },
    EXHAUSTED: { label: 'Exhausted', color: C.dangerText,  bg: C.dangerBg   },
    CANCELLED: { label: 'Cancelled', color: C.muted,       bg: '#F2F2F7'    },
  };
  const { label, color, bg } = cfg[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Active card widget ────────────────────────────────────────────────────────

function ActiveCardWidget({ sub }: { sub: Subscription }) {
  const router = useRouter();
  const days = daysLeft(sub.expiresAt);
  const bg   = cardBg(sub.cardName);

  return (
    <Pressable
      style={[styles.cardWidget, { backgroundColor: bg }]}
      onPress={() => router.push(`/cards/${sub.id}` as never)}
    >
      {/* Top row: card name + logo placeholder */}
      <View style={styles.cardWidgetTop}>
        <View>
          <Text style={styles.cardWidgetLabel}>Cardz</Text>
          <Text style={styles.cardWidgetName} numberOfLines={1}>{sub.cardName}</Text>
        </View>
        <View style={styles.cardWidgetChip}>
          <CreditCard size={18} color="rgba(255,255,255,0.7)" strokeWidth={1.5} />
        </View>
      </View>

      {/* Balance */}
      <View style={styles.cardWidgetMid}>
        <Text style={styles.cardWidgetBalanceLabel}>Remaining Balance</Text>
        <Text style={styles.cardWidgetBalance}>{formatBalance(sub.walletBalance)}</Text>
      </View>

      {/* Bottom row: expiry + days left */}
      <View style={styles.cardWidgetBottom}>
        <View>
          <Text style={styles.cardWidgetExpLabel}>Expires</Text>
          <Text style={styles.cardWidgetExpDate}>{formatDate(sub.expiresAt)}</Text>
        </View>
        <View style={[
          styles.daysLeftPill,
          days <= 7 ? styles.daysLeftUrgent : styles.daysLeftNormal,
        ]}>
          <Text style={[
            styles.daysLeftText,
            days <= 7 ? styles.daysLeftTextUrgent : styles.daysLeftTextNormal,
          ]}>
            {days === 0 ? 'Expires today' : `${days}d left`}
          </Text>
        </View>
      </View>

      {/* Decorative circles */}
      <View style={styles.decCircle1} />
      <View style={styles.decCircle2} />
    </Pressable>
  );
}

// ── Past subscription row ─────────────────────────────────────────────────────

function PastSubRow({ sub, isLast }: { sub: Subscription; isLast: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.pastRow, !isLast && styles.pastRowDivider]}
      onPress={() => router.push(`/cards/${sub.id}` as never)}
    >
      <View style={[styles.pastIconWrap, { backgroundColor: cardBg(sub.cardName) }]}>
        <CreditCard size={16} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
      </View>
      <View style={styles.pastBody}>
        <Text style={styles.pastName} numberOfLines={1}>{sub.cardName}</Text>
        <Text style={styles.pastDate}>{formatDate(sub.expiresAt)}</Text>
      </View>
      <StatusBadge status={sub.status} />
    </Pressable>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <View style={styles.skeletonWidget}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: '40%', marginTop: 10 }]} />
      <View style={[styles.skeletonLine, { width: '60%', height: 28, marginTop: 16 }]} />
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Sparkles size={28} color={C.muted} strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyTitle}>No active cards</Text>
      <Text style={styles.emptySub}>
        Browse stores and purchase a meal card to get started.
      </Text>
      <Pressable style={styles.emptyBtn} onPress={onBrowse}>
        <Text style={styles.emptyBtnText}>Browse Stores</Text>
      </Pressable>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CardsScreen() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data: active,
    isLoading: activeLoading,
    refetch: refetchActive,
  } = useMyActiveSubscriptions();

  const {
    data: allPage,
    isLoading: allLoading,
    refetch: refetchAll,
  } = useMySubscriptions(0);

  const isLoading = activeLoading || allLoading;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchActive(), refetchAll()]);
    setIsRefreshing(false);
  }, [refetchActive, refetchAll]);

  // Past = all subscriptions that are not ACTIVE
  const past = (allPage?.content ?? []).filter((s) => s.status !== 'ACTIVE');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Cards</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {/* ── Active cards ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Active</Text>

          {isLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : !active || active.length === 0 ? (
            <EmptyState onBrowse={() => router.replace('/')} />
          ) : (
            active.map((sub) => (
              <ActiveCardWidget key={sub.id} sub={sub} />
            ))
          )}
        </View>

        {/* ── Past cards ───────────────────────────────────────────────── */}
        {!isLoading && past.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Past</Text>
            <View style={styles.pastCard}>
              {past.map((sub, idx) => (
                <PastSubRow key={sub.id} sub={sub} isLast={idx === past.length - 1} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: -0.5,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // Section
  section: {
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // Active card widget
  cardWidget: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
    overflow: 'hidden',
    minHeight: 180,
    justifyContent: 'space-between',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
      android: { elevation: 6 },
    }),
  },
  cardWidgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardWidgetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cardWidgetName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    maxWidth: 220,
  },
  cardWidgetChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWidgetMid: {
    marginTop: 16,
  },
  cardWidgetBalanceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  cardWidgetBalance: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  cardWidgetBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 16,
  },
  cardWidgetExpLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  cardWidgetExpDate: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  daysLeftPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  daysLeftNormal: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  daysLeftUrgent: {
    backgroundColor: 'rgba(255,59,48,0.3)',
  },
  daysLeftText: {
    fontSize: 12,
    fontWeight: '700',
  },
  daysLeftTextNormal: {
    color: 'rgba(255,255,255,0.85)',
  },
  daysLeftTextUrgent: {
    color: '#FF9B9B',
  },
  // Decorative background circles on card widget
  decCircle1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -30,
    right: -30,
  },
  decCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: 20,
    right: 80,
  },

  // Status badge
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Past card list
  pastCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  pastRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  pastIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pastBody: {
    flex: 1,
    gap: 3,
  },
  pastName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.primary,
  },
  pastDate: {
    fontSize: 12,
    color: C.muted,
  },

  // Skeleton
  skeletonWidget: {
    height: 180,
    borderRadius: 20,
    backgroundColor: C.skeleton,
    marginBottom: 14,
    padding: 22,
    justifyContent: 'flex-end',
  },
  skeletonLine: {
    height: 14,
    width: '55%',
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.primary,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  bottomPad: { height: 32 },
});
