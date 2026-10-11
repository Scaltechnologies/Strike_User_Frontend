import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { CheckCircle2, Clock, Receipt, ShoppingBag, Store, Wallet, XCircle } from 'lucide-react-native';
import { useAuthStore } from '@/store/authStore';
import { useUserRedemptions, redemptionKeys } from '@/hooks/useRedemptions';
import { useMySubscriptions } from '@/hooks/useSubscriptions';
import { useAllStores } from '@/hooks/useStores';
import { RedemptionDetailSheet } from '@/components/history/RedemptionDetailSheet';
import { usePayAtStoreSessionStore } from '@/store/payAtStoreSessionStore';
import { buildRoute } from '@/constants/routes';
import { formatCardPrice } from '@/components/cards/theme';
import { ManropeWeights } from '@/constants/theme';
import { PressableScale } from '@/components/ui/PressableScale';
import { FadeInView } from '@/components/ui/FadeInView';
import type { Redemption, RedemptionStatus } from '@/types/redemption';
// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  accent:      '#D63527',
  accentDeep:  '#8E1F15',
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
  heroMuted:   'rgba(255,255,255,0.55)',
  heroSub:     'rgba(255,255,255,0.72)',
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

function EmptyState({ onExplore }: { onExplore: () => void }) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  return (
    <Animated.View style={styles.emptyWrap} entering={FadeIn.duration(420)}>
      <Animated.View style={pulseStyle}>
        <LinearGradient
          colors={[C.accentSoft, '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyIconWrap}
        >
          <ShoppingBag size={28} color={C.accent} strokeWidth={1.4} />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.emptyHeading}>No redemptions yet</Text>
      <Text style={styles.emptySub}>
        Request redemption from an active membership to see your activity here.
      </Text>
      <PressableScale style={styles.emptyBtn} onPress={onExplore}>
        <Text style={styles.emptyBtnText}>Explore memberships</Text>
      </PressableScale>
    </Animated.View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBone({ style }: { style?: object }) {
  return <View style={[styles.skBone, style]} />;
}

function LoadingSkeleton() {
  const shimmer = useSharedValue(0.4);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmer.value }));

  return (
    <Animated.View style={[styles.skeletonWrap, shimmerStyle]}>
      <SkeletonBone style={{ width: 60, height: 11, marginBottom: 12 }} />
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skCard}>
          <View style={styles.skCardTop}>
            <SkeletonBone style={{ width: 36, height: 36, borderRadius: 18 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBone style={{ width: '80%', height: 14 }} />
              <SkeletonBone style={{ width: 110, height: 11 }} />
            </View>
            <SkeletonBone style={{ width: 54, height: 14 }} />
          </View>
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
            <SkeletonBone style={{ width: 36, height: 36, borderRadius: 18 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBone style={{ width: '65%', height: 14 }} />
              <SkeletonBone style={{ width: 90, height: 11 }} />
            </View>
            <SkeletonBone style={{ width: 54, height: 14 }} />
          </View>
          <View style={styles.skCardBottom}>
            <SkeletonBone style={{ width: 110, height: 11 }} />
            <SkeletonBone style={{ width: 70, height: 11 }} />
          </View>
        </View>
      ))}
    </Animated.View>
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
    <PressableScale style={styles.card} onPress={onPress}>
      {/* Top row: avatar + items + amount */}
      <View style={styles.cardTop}>
        <View style={[styles.cardAvatar, { backgroundColor: cfg.bg }]}>
          <Icon size={16} color={cfg.color} strokeWidth={2.2} />
        </View>
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
    </PressableScale>
  );
}

// ── Pay at Store — open sessions (local-only; no backend "list my payments" endpoint exists,
//    so this reflects whatever this device currently knows about, same source the persistent
//    tracker bar reads — see payAtStoreSessionStore) ─────────────────────────────────────────

function elapsedSince(atMs: number): string {
  const min = Math.floor((Date.now() - atMs) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

function PayAtStoreRow({
  cardName, amount, createdAtMs, onPress,
}: { cardName: string; amount: number; createdAtMs: number; onPress: () => void }) {
  return (
    <PressableScale style={styles.card} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.cardAvatar, { backgroundColor: '#FFF5E0' }]}>
          <Clock size={16} color="#7A4500" strokeWidth={2.2} />
        </View>
        <View style={styles.cardTopLeft}>
          <Text style={styles.cardItems} numberOfLines={1}>{cardName}</Text>
          <Text style={styles.cardMembership}>Pay at Store</Text>
        </View>
        <View style={styles.cardTopRight}>
          <Text style={styles.cardAmount}>{formatCardPrice(amount)}</Text>
          <View style={[styles.statusPill, { backgroundColor: '#FFF5E0' }]}>
            <Text style={[styles.statusPillText, { color: '#7A4500' }]}>Waiting</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.cardBottomLeft}>
          <Store size={11} color={C.muted} strokeWidth={1.5} />
          <Text style={styles.cardTime}>{elapsedSince(createdAtMs)} · Tap to view QR/code</Text>
        </View>
      </View>
    </PressableScale>
  );
}

// ── Activity hero — animated total-redeemed summary ─────────────────────────────

function ActivityHero({ total, count }: { total: number; count: number }) {
  const anim = useSharedValue(0);
  const [amountText, setAmountText] = useState(fmt(0));

  useEffect(() => {
    anim.value = withTiming(total, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [anim, total]);

  const updateAmountText = useCallback((val: number) => {
    setAmountText(fmt(val));
  }, []);

  useAnimatedReaction(
    () => Math.round(anim.value),
    (val, prevVal) => {
      if (val !== prevVal) runOnJS(updateAmountText)(val);
    },
  );

  return (
    <Animated.View entering={FadeIn.duration(420)} style={styles.heroWrap}>
      <LinearGradient
        colors={[C.accent, C.accentDeep, '#1C0805']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroBlob1} pointerEvents="none" />
        <View style={styles.heroBlob2} pointerEvents="none" />

        <View style={styles.heroTopRow}>
          <View style={styles.heroIconBadge}>
            <Wallet size={15} color="#FFFFFF" strokeWidth={2} />
          </View>
          <Text style={styles.heroLabel}>TOTAL REDEEMED</Text>
        </View>

        <Text style={styles.heroBalance}>{amountText}</Text>
        <Text style={styles.heroSub}>
          Across {count} redemption{count === 1 ? '' : 's'}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

function PayAtStoreSection() {
  const router = useRouter();
  const sessions = usePayAtStoreSessionStore((s) => s.sessions);
  const hydrated = usePayAtStoreSessionStore((s) => s.hydrated);
  const hydrate = usePayAtStoreSessionStore((s) => s.hydrate);

  useFocusEffect(useCallback(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]));

  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => b.createdAtMs - a.createdAtMs);

  return (
    <FadeInView style={styles.group}>
      <Text style={styles.groupLabel}>Pay at Store · Waiting</Text>
      {sorted.map((s) => (
        <PayAtStoreRow
          key={s.paymentId}
          cardName={s.cardName}
          amount={s.amount}
          createdAtMs={s.createdAtMs}
          onPress={() => router.push(buildRoute.payAtStore(s.paymentId) as never)}
        />
      ))}
    </FadeInView>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router      = useRouter();
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

  const redeemedOnly   = sorted.filter((r) => r.status === 'APPROVED' || r.status === 'COMPLETED');
  const totalRedeemed  = redeemedOnly.reduce((sum, r) => sum + r.totalAmount, 0);
  const redeemedCount  = redeemedOnly.length;

  let cardIndex = 0;

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
        <PayAtStoreSection />

        {isLoading ? (
          <LoadingSkeleton />
        ) : isError && sorted.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <ShoppingBag size={28} color={C.muted} strokeWidth={1.4} />
            </View>
            <Text style={styles.emptyHeading}>Couldn&apos;t load activity</Text>
            <Pressable onPress={() => void refetch()} hitSlop={12}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : sorted.length === 0 ? (
          <EmptyState onExplore={() => router.navigate('/(tabs)/cards' as never)} />
        ) : (
          <>
            {redeemedCount > 0 ? (
              <ActivityHero total={totalRedeemed} count={redeemedCount} />
            ) : null}

            {/* A background refetch (pull-to-refresh, focus-refetch) failed —
                keep the last-known-good list visible instead of replacing it. */}
            {isError && (
              <View style={styles.inlineErrorBanner}>
                <Text style={styles.inlineErrorText}>Couldn&apos;t refresh — showing saved activity</Text>
                <Pressable onPress={() => void refetch()} hitSlop={8}>
                  <Text style={styles.inlineErrorRetry}>Retry</Text>
                </Pressable>
              </View>
            )}
            {groups.map(({ label, items }) => (
            <View key={label} style={styles.group}>
              <View style={styles.groupLabelRow}>
                <View style={styles.groupLabelDot} />
                <Text style={styles.groupLabel}>{label}</Text>
                <Text style={styles.groupLabelCount}>{items.length}</Text>
              </View>
              {items.map((r) => {
                const sub       = subMap.get(r.subscriptionId);
                const cardName  = sub?.cardName ?? 'Membership';
                const storeName = sub ? (storeMap.get(sub.storeId) ?? '') : '';
                const delay     = Math.min(cardIndex++, 8) * 45;
                return (
                  <FadeInView key={r.id} delay={delay}>
                    <RedemptionCard
                      redemption={r}
                      cardName={cardName}
                      storeName={storeName}
                      onPress={() => setSelected({ redemption: r, cardName, storeName })}
                    />
                  </FadeInView>
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
  groupLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginBottom: 10,
  },
  groupLabelDot: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: C.accent,
  },
  groupLabel: {
    fontSize: 13, fontFamily: ManropeWeights.bold,
    color: C.muted, letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  groupLabelCount: {
    fontSize: 11, fontFamily: ManropeWeights.semiBold,
    color: C.muted,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  // Activity hero
  heroWrap: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: C.accentDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 18 },
      android: { elevation: 6 },
    }),
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  heroBlob1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -70, right: -50,
  },
  heroBlob2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.12)', bottom: -50, left: -24,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  heroIconBadge: {
    width: 26, height: 26, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroLabel: {
    fontSize: 11, fontFamily: ManropeWeights.bold,
    color: C.heroMuted, letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  heroBalance: {
    fontSize: 38, fontFamily: ManropeWeights.extraBold,
    color: '#FFFFFF', letterSpacing: -1.6,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13, fontFamily: ManropeWeights.medium,
    color: C.heroSub, letterSpacing: 0.1,
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
  cardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  cardAvatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
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
    justifyContent: 'center',
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
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 24,
    marginTop: 4,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  emptyBtnText: {
    fontSize: 15, fontFamily: ManropeWeights.bold, color: '#FFFFFF', letterSpacing: -0.1,
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
    flexDirection: 'row', gap: 12, alignItems: 'center',
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
