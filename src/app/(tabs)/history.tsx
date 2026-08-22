import { useCallback, useRef, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Receipt, ShoppingBag, XCircle } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useUserRedemptions, redemptionKeys } from '@/hooks/useRedemptions';
import { useMySubscriptions } from '@/hooks/useSubscriptions';
import { useAllStores } from '@/hooks/useStores';
import { RedemptionDetailSheet } from '@/components/history/RedemptionDetailSheet';
import { ManropeWeights } from '@/constants/theme';
import type { Redemption, RedemptionStatus } from '@/types/redemption';
// ── Design tokens ──────────────────────────────────────────────────────────────

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
  successSoft: '#EDFAF2',
  successDark: '#1A7A35',
  danger:      '#FF3B30',
  dangerSoft:  '#FEF0EE',
  dangerDark:  '#C0261A',
  warning:     '#FF9500',
  skeleton:    '#E5E5EA',
} as const;

// ── Status display config ──────────────────────────────────────────────────────

const STATUS_CFG: Record<RedemptionStatus, {
  label:  string;
  color:  string;
  bg:     string;
  amtPrefix: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}> = {
  APPROVED:  { label: 'Redeemed',  color: C.successDark, bg: C.successSoft, amtPrefix: '−', Icon: CheckCircle2 },
  COMPLETED: { label: 'Redeemed',  color: C.successDark, bg: C.successSoft, amtPrefix: '−', Icon: CheckCircle2 },
  REVERSED:  { label: 'Reversed',  color: C.muted,       bg: C.bg,          amtPrefix: '+', Icon: Clock       },
  FAILED:    { label: 'Failed',    color: C.dangerDark,  bg: C.dangerSoft,  amtPrefix: '−', Icon: XCircle     },
  REJECTED:  { label: 'Rejected',  color: C.dangerDark,  bg: C.dangerSoft,  amtPrefix: '−', Icon: XCircle     },
  CANCELLED: { label: 'Cancelled', color: C.muted,       bg: C.bg,          amtPrefix: '−', Icon: XCircle     },
  PENDING:   { label: 'Pending',   color: '#7A4500',     bg: '#FFF5E0',     amtPrefix: '−', Icon: Clock       },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

// Some redemption-service records (mainly older/legacy ones) have no
// remainingBalance recorded — omit the row rather than show "₹null".
function fmtBalance(n: number | null | undefined): string | null {
  return n == null ? null : fmt(n);
}

// redemption-service now returns createdAt with an explicit trailing 'Z'
// (the backend JVM runs in UTC), so `new Date(iso)` parses it as UTC and
// this renders it in the device's own local time via toLocaleTimeString —
// no manual offset math needed. (Older backend responses without the 'Z'
// were misparsed as local time, showing timestamps hours off — see
// getRedemptionCreatedAtMs in useRedemptions.ts for the same fix.)
function dayStart(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function fmtTime(iso: string): string {
  const d       = new Date(iso);
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yest    = today - 86_400_000;
  const ds      = dayStart(iso);
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ds === today) return timeStr;
  if (ds === yest)  return `Yesterday ${timeStr}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` ${timeStr}`;
}

function groupRedemptionsByDate(
  redemptions: Redemption[],
): { label: string; items: Redemption[] }[] {
  const now      = new Date();
  const todayMs  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterMs = todayMs - 86_400_000;
  const weekMs   = todayMs - 7 * 86_400_000;

  const bucket = (r: Redemption) => {
    const d = dayStart(r.createdAt);
    if (d === todayMs)  return 'Today';
    if (d === yesterMs) return 'Yesterday';
    if (d >= weekMs)    return 'This Week';
    return 'Older';
  };

  const ORDER = ['Today', 'Yesterday', 'This Week', 'Older'] as const;
  const map   = new Map<string, Redemption[]>();
  for (const r of redemptions) {
    const key = bucket(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return ORDER.filter((l) => map.has(l)).map((l) => ({ label: l, items: map.get(l)! }));
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <ShoppingBag size={28} color={C.muted} strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyHeading}>No redemptions yet</Text>
      <Text style={styles.emptySub}>
        Request redemption from an active membership to see your activity here.
      </Text>
    </View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBone({ style }: { style?: object }) {
  return <View style={[styles.skBone, style]} />;
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <SkeletonBone style={{ width: 60, height: 11, marginBottom: 12 }} />
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skCard}>
          <View style={styles.skCardTop}>
            <SkeletonBone style={{ flex: 1, height: 14 }} />
            <SkeletonBone style={{ width: 54, height: 14 }} />
          </View>
          <SkeletonBone style={{ width: 140, height: 11, marginTop: 6 }} />
          <View style={styles.skCardBottom}>
            <SkeletonBone style={{ width: 110, height: 11 }} />
            <SkeletonBone style={{ width: 70, height: 11 }} />
          </View>
        </View>
      ))}
      <SkeletonBone style={{ width: 80, height: 11, marginBottom: 12, marginTop: 28 }} />
      {[1, 2].map((i) => (
        <View key={i} style={styles.skCard}>
          <View style={styles.skCardTop}>
            <SkeletonBone style={{ flex: 1, height: 14 }} />
            <SkeletonBone style={{ width: 54, height: 14 }} />
          </View>
          <View style={styles.skCardBottom}>
            <SkeletonBone style={{ width: 110, height: 11 }} />
            <SkeletonBone style={{ width: 70, height: 11 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Redemption card ────────────────────────────────────────────────────────────

function RedemptionCard({
  redemption,
  cardName,
  storeName,
  onPress,
}: {
  redemption: Redemption;
  cardName:   string;
  storeName:  string;
  onPress:    () => void;
}) {
  const cfg = STATUS_CFG[redemption.status];
  const { Icon } = cfg;

  const itemLabel = redemption.items
    .map((i) => (i.quantity > 1 ? `${i.menuItemName} ×${i.quantity}` : i.menuItemName))
    .join(', ');

  const balanceText = fmtBalance(redemption.remainingBalance);
  const showBalance =
    (redemption.status === 'APPROVED' || redemption.status === 'COMPLETED') && balanceText != null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Top row: items + amount */}
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <Text style={styles.cardItems} numberOfLines={2}>{itemLabel}</Text>
          <Text style={styles.cardMembership} numberOfLines={1}>
            {cardName}
            {storeName ? ` · ${storeName}` : ''}
          </Text>
        </View>
        <View style={styles.cardTopRight}>
          <Text style={[
            styles.cardAmount,
            redemption.status === 'REVERSED' && styles.cardAmountCredit,
          ]}>
            {cfg.amtPrefix}{fmt(redemption.totalAmount)}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
            <Icon size={10} color={cfg.color} strokeWidth={2.2} />
            <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
      </View>

      {/* Bottom row: time + remaining balance */}
      <View style={styles.cardBottom}>
        <View style={styles.cardBottomLeft}>
          <Receipt size={11} color={C.muted} strokeWidth={1.5} />
          <Text style={styles.cardTime}>{fmtTime(redemption.createdAt)}</Text>
        </View>
        {showBalance ? (
          <Text style={styles.cardBalanceAfter}>
            {balanceText} remaining
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const userId      = useAuthStore((s) => s.userId);
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selected, setSelected] = useState<{
    redemption: Redemption;
    cardName:   string;
    storeName:  string;
  } | null>(null);

  const {
    data: redemptions = [],
    isLoading,
    isError,
    refetch,
  } = useUserRedemptions(userId);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  // Subscription lookup — subscriptionId → cardName + storeId
  const { data: mySubscriptions }    = useMySubscriptions(0);
  const { data: allStores = [] }     = useAllStores();

  const subMap = new Map(
    (mySubscriptions?.content ?? []).map((s) => [s.id, { cardName: s.cardName, storeId: s.storeId }]),
  );
  const storeMap = new Map(allStores.map((s) => [s.id, s.name]));

  // Auto-refresh on focus
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      if (!userId) return;
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.byUser(userId) });
    }, [queryClient, userId]),
  );

  // Sort newest-first, exclude PENDING from main history (they live in pending screen)
  const sorted = [...redemptions]
    .filter((r) => r.status !== 'PENDING')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const groups = groupRedemptionsByDate(sorted);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Activity</Text>
        {sorted.length > 0 ? (
          <Text style={styles.headerCount}>
            {sorted.length} redemption{sorted.length > 1 ? 's' : ''}
          </Text>
        ) : null}
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
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError && sorted.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <ShoppingBag size={28} color={C.muted} strokeWidth={1.4} />
            </View>
            <Text style={styles.emptyHeading}>Couldn't load activity</Text>
            <Pressable onPress={() => void refetch()} hitSlop={12}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* A background refetch (pull-to-refresh, focus-refetch) failed —
                keep the last-known-good list visible instead of replacing it. */}
            {isError && (
              <View style={styles.inlineErrorBanner}>
                <Text style={styles.inlineErrorText}>Couldn't refresh — showing saved activity</Text>
                <Pressable onPress={() => void refetch()} hitSlop={8}>
                  <Text style={styles.inlineErrorRetry}>Retry</Text>
                </Pressable>
              </View>
            )}
            {groups.map(({ label, items }) => (
            <View key={label} style={styles.group}>
              <Text style={styles.groupLabel}>{label}</Text>
              {items.map((r) => {
                const sub       = subMap.get(r.subscriptionId);
                const cardName  = sub?.cardName ?? 'Membership';
                const storeName = sub ? (storeMap.get(sub.storeId) ?? '') : '';
                return (
                  <RedemptionCard
                    key={r.id}
                    redemption={r}
                    cardName={cardName}
                    storeName={storeName}
                    onPress={() => setSelected({ redemption: r, cardName, storeName })}
                  />
                );
              })}
            </View>
            ))}
          </>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <RedemptionDetailSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        redemption={selected?.redemption ?? null}
        cardName={selected?.cardName ?? ''}
        storeName={selected?.storeName ?? ''}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  title: {
    fontSize: 24, fontFamily: ManropeWeights.extraBold,
    color: C.primary, letterSpacing: -0.6,
  },
  headerCount: {
    fontSize: 13, color: C.muted, fontFamily: ManropeWeights.medium,
  },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // Group
  group: {
    marginTop: 28,
    paddingHorizontal: 16,
  },
  groupLabel: {
    fontSize: 13, fontFamily: ManropeWeights.bold,
    color: C.muted, letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Redemption card
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  cardPressed: { opacity: 0.7 },
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  cardTopLeft:  { flex: 1, gap: 3 },
  cardTopRight: { alignItems: 'flex-end', gap: 5, flexShrink: 0 },
  cardItems: {
    fontSize: 15, fontFamily: ManropeWeights.semiBold, color: C.primary, lineHeight: 22,
  },
  cardMembership: {
    fontSize: 12, color: C.muted, fontFamily: ManropeWeights.medium,
  },
  cardAmount: {
    fontSize: 17, fontFamily: ManropeWeights.extraBold, color: C.primary, letterSpacing: -0.4,
  },
  cardAmountCredit: { color: C.success },

  // Status pill
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11, fontFamily: ManropeWeights.semiBold, letterSpacing: 0.1,
  },

  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  cardBottomLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  cardTime: {
    fontSize: 12, color: C.muted, fontFamily: ManropeWeights.medium,
  },
  cardBalanceAfter: {
    fontSize: 12, color: C.secondary, fontFamily: ManropeWeights.medium,
  },

  // Non-blocking background-refresh-failed banner (cached list stays visible)
  inlineErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 12.5,
    color: C.dangerDark,
    fontFamily: ManropeWeights.medium,
  },
  inlineErrorRetry: {
    fontSize: 12.5,
    color: C.dangerDark,
    fontFamily: ManropeWeights.bold,
  },

  // Empty / error
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 48, gap: 12,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: C.surface, justifyContent: 'center',
    alignItems: 'center', marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  emptyHeading: {
    fontSize: 17, fontFamily: ManropeWeights.bold, color: C.primary,
  },
  emptySub: {
    fontFamily: ManropeWeights.regular, fontSize: 14, color: C.secondary,
    textAlign: 'center', lineHeight: 22,
  },
  retryText: {
    fontSize: 14, fontFamily: ManropeWeights.semiBold, color: C.accent, marginTop: 4,
  },

  // Skeleton
  skeletonWrap: {
    marginTop: 28, paddingHorizontal: 16,
  },
  skCard: {
    backgroundColor: C.surface, borderRadius: 16,
    padding: 16, marginBottom: 10, gap: 8,
  },
  skCardTop: {
    flexDirection: 'row', gap: 12,
  },
  skCardBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    marginTop: 4,
  },
  skBone: {
    height: 13, borderRadius: 7, backgroundColor: C.skeleton,
  },

  bottomPad: { height: 40 },
});
