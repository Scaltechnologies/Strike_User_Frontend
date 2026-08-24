import { useCallback, useEffect, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  AlertCircle,
  Clock,
  ChevronDown,
  CreditCard,
  Wallet,
} from 'lucide-react-native';
import { useMyActiveSubscriptions, useMySubscriptions } from '@/hooks/useSubscriptions';
import { useAllStores } from '@/hooks/useStores';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { getEffectiveStatus } from '@/utils/subscription';
import { getCardColorTheme } from '@/utils/cardColorTheme';
import { EmptyState } from '@/components/common/EmptyState';
import { PremiumSubscriptionCard } from '@/components/cards/PremiumSubscriptionCard';
import type { Store } from '@/types/store';
import type { Subscription, SubscriptionStatus } from '@/types/subscription';

// ── Design tokens (shared brand palette with Home) ──────────────────────────────

const C = {
  accent:      '#D63527',
  accentDeep:  '#8E1F15',
  accentLight: '#FF8A75',
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
  warning:     '#FF9500',
  warningSoft: '#FFF5E0',
  warningDark: '#7A4500',
  danger:      '#FF3B30',
  dangerSoft:  '#FEF0EE',
  dangerDark:  '#C0261A',
  skeleton:    '#E5E5EA',
  heroSurface: '#160604',
  heroMuted:   'rgba(255,255,255,0.55)',
  heroSub:     'rgba(255,255,255,0.72)',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(toUtc(expiresAt)).getTime() - Date.now()) / 86_400_000));
}

function totalBalance(subs: Subscription[]): number {
  return subs.reduce((sum, s) => sum + s.walletBalance, 0);
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<SubscriptionStatus, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: 'Active',    color: C.successDark, bg: C.successSoft },
  EXPIRED:   { label: 'Expired',   color: C.muted,       bg: C.bg          },
  EXHAUSTED: { label: 'Exhausted', color: C.warningDark, bg: C.warningSoft },
  CANCELLED: { label: 'Cancelled', color: C.dangerDark,  bg: C.dangerSoft  },
};

// ── Compact past-subscription row ──────────────────────────────────────────────

function SubscriptionRow({
  sub,
  storeName,
  isLast,
  onPress,
}: {
  sub: Subscription;
  storeName: string | undefined;
  isLast: boolean;
  onPress: () => void;
}) {
  const { label, color, bg } = STATUS_CFG[sub.status];
  // Same canonical per-card color as My Cards' active-card widgets, Card
  // Details, Membership and Vendor Available Cards.
  const cardTheme = getCardColorTheme(sub.cardName);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.pastRow,
        !isLast && styles.pastRowBorder,
        pressed && styles.pastRowPressed,
      ]}
      onPress={onPress}
    >
      {/* Colored icon */}
      <LinearGradient
        colors={cardTheme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pastIconWrap}
      >
        <CreditCard size={15} color={cardTheme.textSecondary} strokeWidth={1.5} />
      </LinearGradient>

      {/* Name + meta */}
      <View style={styles.pastBody}>
        <Text style={styles.pastName} numberOfLines={1}>{sub.cardName}</Text>
        <Text style={styles.pastMeta} numberOfLines={1}>
          {storeName ?? `Store #${sub.storeId}`}
          {'  ·  '}
          {fmtDate(sub.expiresAt)}
        </Text>
      </View>

      {/* Balance + status */}
      <View style={styles.pastRight}>
        <Text style={styles.pastBalance}>{fmt(sub.walletBalance)}</Text>
        <View style={[styles.statusPill, { backgroundColor: bg }]}>
          <Text style={[styles.statusPillText, { color }]}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  accent?: string;
}

function CollapsibleSection({
  title, count, expanded, onToggle, children, accent,
}: CollapsibleSectionProps) {
  const rotate = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    rotate.value = withTiming(expanded ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [expanded, rotate]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(rotate.value, [0, 1], [0, 180])}deg` }],
  }));

  if (count === 0) return null;

  return (
    <Animated.View style={styles.collapsible} layout={LinearTransition.springify().damping(20).stiffness(200)}>
      <Pressable
        style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.collapsibleHeaderPressed]}
        onPress={onToggle}
      >
        <View style={styles.collapsibleLeft}>
          <Text style={styles.collapsibleTitle}>{title}</Text>
          <View style={[styles.countBadge, accent ? { backgroundColor: accent + '22' } : null]}>
            <Text style={[styles.countBadgeText, accent ? { color: accent } : null]}>{count}</Text>
          </View>
        </View>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={16} color={C.muted} strokeWidth={2} />
        </Animated.View>
      </Pressable>

      {expanded && (
        <Animated.View
          style={styles.collapsibleBody}
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          layout={LinearTransition.springify().damping(20).stiffness(200)}
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ── Section label with accent bar ────────────────────────────────────────────────

function SectionLabel({ title, count }: { title: string; count?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(320)} style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelBar} />
      <Text style={styles.sectionLabel}>{title}</Text>
      {!!count && <Text style={styles.sectionCount}>{count}</Text>}
    </Animated.View>
  );
}

// ── Wallet hero ────────────────────────────────────────────────────────────────

function WalletHero({
  total,
  activeCount,
  expiringSoon,
}: {
  total: number;
  activeCount: number;
  expiringSoon: number;
}) {
  const balanceAnim = useSharedValue(0);
  const [balanceText, setBalanceText] = useState(fmt(0));

  useEffect(() => {
    balanceAnim.value = withTiming(total, { duration: 900, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const updateBalanceText = useCallback((val: number) => {
    setBalanceText(fmt(val));
  }, []);

  useAnimatedReaction(
    () => Math.round(balanceAnim.value),
    (val, prevVal) => {
      if (val !== prevVal) runOnJS(updateBalanceText)(val);
    }
  );

  return (
    <Animated.View entering={FadeIn.duration(420)}>
      <LinearGradient
        colors={[C.accent, C.accentDeep, '#1C0805']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Decorative blobs */}
        <View style={styles.heroBlob1} pointerEvents="none" />
        <View style={styles.heroBlob2} pointerEvents="none" />

        {/* Label row */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroLabelWrap}>
            <View style={styles.heroIconBadge}>
              <Wallet size={15} color="#FFFFFF" strokeWidth={2} />
            </View>
            <Text style={styles.heroLabel}>TOTAL AVAILABLE CREDIT</Text>
          </View>
          {expiringSoon > 0 && (
            <View style={styles.expiringSoonBadge}>
              <Clock size={11} color="#FFE1D9" strokeWidth={2.2} />
              <Text style={styles.expiringSoonText}>
                {expiringSoon} expiring soon
              </Text>
            </View>
          )}
        </View>

        {/* Big balance */}
        <Text style={styles.heroBalance}>{balanceText}</Text>
        <Text style={styles.heroSub}>
          {activeCount === 0
            ? 'No active memberships'
            : `Remaining across ${activeCount} active ${activeCount === 1 ? 'membership' : 'memberships'}`
          }
        </Text>

        {/* Bottom divider row */}
        <View style={styles.heroRule} />
      </LinearGradient>
    </Animated.View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBone({ style }: { style?: object }) {
  return <View style={[styles.skBone, style]} />;
}

function WalletSkeleton() {
  return (
    <>
      {/* Hero skeleton */}
      <View style={styles.heroSkeletonWrap}>
        <SkeletonBone style={{ width: 80, height: 12, opacity: 0.3, marginBottom: 16 }} />
        <SkeletonBone style={{ width: 160, height: 36, opacity: 0.3, marginBottom: 8 }} />
        <SkeletonBone style={{ width: 220, height: 14, opacity: 0.2 }} />
      </View>

      {/* Section label skeleton */}
      <View style={styles.sectionLabelArea}>
        <SkeletonBone style={{ width: 90, height: 12 }} />
      </View>

      {/* Card skeletons */}
      {[0, 1].map((i) => (
        <View key={i} style={styles.cardSkeletonWrap}>
          <SkeletonBone style={{ width: '55%', height: 13, marginBottom: 16, opacity: 0.6 }} />
          <SkeletonBone style={{ width: '40%', height: 32, marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <SkeletonBone style={{ width: 100, height: 13, opacity: 0.6 }} />
            <SkeletonBone style={{ width: 56, height: 26, borderRadius: 13 }} />
          </View>
        </View>
      ))}
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyWallet({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <LinearGradient
        colors={[C.accentSoft, '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.emptyIconWrap}
      >
        <CreditCard size={26} color={C.accent} strokeWidth={1.6} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>No Active Memberships</Text>
      <Text style={styles.emptySub}>
        Purchase a membership from a participating store to start redeeming benefits.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
        onPress={onExplore}
      >
        <Text style={styles.emptyBtnText}>Explore Stores</Text>
      </Pressable>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function CardsScreen() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['active', 'expiring'])
  );

  const {
    data: activeRaw = [], isLoading: loadingActive, isError: activeIsError,
    refetch: refetchActive,
  } = useMyActiveSubscriptions();
  // Guards against a stale cached ACTIVE status past expiresAt — the server only
  // recomputes status on this endpoint's next fetch, not on every read within staleTime.
  const active = activeRaw.filter((s) => getEffectiveStatus(s) === 'ACTIVE');

  const {
    data: allPage, isLoading: loadingAll, isError: allIsError, refetch: refetchAll,
  } = useMySubscriptions(0);

  const { data: allStores = [] } = useAllStores();

  const storesById = Object.fromEntries(allStores.map((s) => [s.id, s])) as Record<number, Store>;

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchActive(), refetchAll()]);
    setIsRefreshing(false);
  }, [refetchActive, refetchAll]);

  const navToSub = useCallback(
    (id: number) => router.push(buildRoute.subscriptionDetail(String(id)) as never),
    [router],
  );

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Derive groups
  const expiringSoon   = active.filter((s) => daysLeft(s.expiresAt) <= 7);
  const notExpiring    = active.filter((s) => daysLeft(s.expiresAt) > 7);
  // Same staleness guard as `active` — the paginated /my endpoint never auto-expires either.
  const allContent     = (allPage?.content ?? []).map((s) => ({ ...s, status: getEffectiveStatus(s) }));
  const exhausted      = allContent.filter((s) => s.status === 'EXHAUSTED');
  const expired        = allContent.filter((s) => s.status === 'EXPIRED');
  const cancelled      = allContent.filter((s) => s.status === 'CANCELLED');

  const hasAnyPast     = exhausted.length + expired.length + cancelled.length > 0;
  const heroTotal      = totalBalance(active);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>My Cards</Text>
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
        {/* ── Active cards (own loading/error, independent of Past) ── */}
        {loadingActive ? (
          <WalletSkeleton />
        ) : activeIsError && active.length === 0 ? (
          <EmptyState
            icon={<AlertCircle size={24} color={C.muted} strokeWidth={1.5} />}
            title="Couldn't load your cards"
            subtitle="Check your connection and try again"
            actionLabel="Try again"
            onAction={() => void refetchActive()}
          />
        ) : (
          <>
            {/* ── Wallet hero ───────────────────────────────────── */}
            <WalletHero
              total={heroTotal}
              activeCount={active.length}
              expiringSoon={expiringSoon.length}
            />

            {/* ── Active cards ──────────────────────────────────── */}
            <View style={styles.section}>
              <SectionLabel title="Active Cards" count={notExpiring.length || undefined} />

              {active.length === 0 ? (
                <EmptyWallet onExplore={() => router.replace('/')} />
              ) : notExpiring.length === 0 && expiringSoon.length > 0 ? (
                <View style={styles.allExpiringNote}>
                  <Text style={styles.allExpiringText}>
                    All active cards are expiring soon — see below.
                  </Text>
                </View>
              ) : (
                notExpiring.map((sub, i) => (
                  <PremiumSubscriptionCard
                    key={sub.id}
                    sub={sub}
                    store={storesById[sub.storeId]}
                    onPress={() => navToSub(sub.id)}
                    index={i}
                    showExpiry
                  />
                ))
              )}
            </View>

            {/* ── Expiring soon ─────────────────────────────────── */}
            {expiringSoon.length > 0 && (
              <View style={styles.section}>
                <CollapsibleSection
                  title="Expiring Soon"
                  count={expiringSoon.length}
                  expanded={expandedSections.has('expiring')}
                  onToggle={() => toggleSection('expiring')}
                  accent={C.danger}
                >
                  {expiringSoon.map((sub, i) => (
                    <PremiumSubscriptionCard
                      key={sub.id}
                      sub={sub}
                      store={storesById[sub.storeId]}
                      onPress={() => navToSub(sub.id)}
                      urgency
                      index={i}
                      showExpiry
                    />
                  ))}
                </CollapsibleSection>
              </View>
            )}

          </>
        )}

        {/* ── Past sections — own loading state, independent of Active ── */}
        {/* Collapsed by default and secondary to Active Cards, so no
            skeleton/error UI here — just don't show it until it's ready,
            rather than blocking the section above on this slower fetch. */}
        {!loadingAll && !allIsError && hasAnyPast && (
          <View style={styles.section}>
            <SectionLabel title="Past Memberships" />
            <View style={styles.pastCard}>

              <CollapsibleSection
                title="Exhausted"
                count={exhausted.length}
                expanded={expandedSections.has('exhausted')}
                onToggle={() => toggleSection('exhausted')}
                accent={C.warning}
              >
                {exhausted.map((sub, idx) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    storeName={storesById[sub.storeId]?.name}
                    isLast={idx === exhausted.length - 1 && expired.length === 0 && cancelled.length === 0}
                    onPress={() => navToSub(sub.id)}
                  />
                ))}
              </CollapsibleSection>

              <CollapsibleSection
                title="Expired"
                count={expired.length}
                expanded={expandedSections.has('expired')}
                onToggle={() => toggleSection('expired')}
              >
                {expired.map((sub, idx) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    storeName={storesById[sub.storeId]?.name}
                    isLast={idx === expired.length - 1 && cancelled.length === 0}
                    onPress={() => navToSub(sub.id)}
                  />
                ))}
              </CollapsibleSection>

              <CollapsibleSection
                title="Cancelled"
                count={cancelled.length}
                expanded={expandedSections.has('cancelled')}
                onToggle={() => toggleSection('cancelled')}
              >
                {cancelled.map((sub, idx) => (
                  <SubscriptionRow
                    key={sub.id}
                    sub={sub}
                    storeName={storesById[sub.storeId]?.name}
                    isLast={idx === cancelled.length - 1}
                    onPress={() => navToSub(sub.id)}
                  />
                ))}
              </CollapsibleSection>

            </View>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
  topBar: {
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
  topBarTitle: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.5,
  },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Wallet hero ────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: C.accentDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  heroBlob1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -90, right: -60,
  },
  heroBlob2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(0,0,0,0.12)', bottom: -60, left: -30,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  heroLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  heroIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.heroMuted,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  expiringSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  expiringSoonText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: '#FFE1D9',
    letterSpacing: 0.2,
  },
  heroBalance: {
    fontSize: 44,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -2,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    color: C.heroSub,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.1,
  },
  heroRule: {
    marginTop: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionLabelBar: {
    width: 3,
    height: 13,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  sectionLabelArea: {
    marginTop: 24,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: 0.3,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
  },
  allExpiringNote: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  allExpiringText: {
    fontSize: 13,
    color: C.secondary,
    lineHeight: 19,
    fontFamily: ManropeWeights.regular,
  },

  // ── Collapsible section ────────────────────────────────────────────────────
  collapsible: { marginBottom: 4 },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  collapsibleHeaderPressed: { backgroundColor: C.bg },
  collapsibleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  collapsibleTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  countBadge: {
    backgroundColor: C.skeleton,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
  },
  collapsibleBody: { marginTop: 2 },

  // ── Past card container ────────────────────────────────────────────────────
  pastCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },

  // ── Past subscription row ──────────────────────────────────────────────────
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  pastRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  pastRowPressed: { backgroundColor: C.bg },
  pastIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pastBody: { flex: 1, gap: 3 },
  pastName: { fontSize: 14, fontWeight: '600', fontFamily: ManropeWeights.semiBold, color: C.primary },
  pastMeta: { fontSize: 12, color: C.muted, fontFamily: ManropeWeights.regular },
  pastRight: { alignItems: 'flex-end', gap: 5 },
  pastBalance: { fontSize: 14, fontWeight: '700', fontFamily: ManropeWeights.bold, color: C.primary },

  // ── Status pill ────────────────────────────────────────────────────────────
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.1,
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skBone: {
    height: 14,
    width: '100%',
    borderRadius: 7,
    backgroundColor: C.skeleton,
  },
  heroSkeletonWrap: {
    backgroundColor: C.heroSurface,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 32,
  },
  cardSkeletonWrap: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    backgroundColor: '#1A1A2A',
    padding: 22,
    minHeight: 192,
    justifyContent: 'flex-end',
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    fontFamily: ManropeWeights.regular,
  },
  emptyBtn: {
    backgroundColor: C.accent,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 24,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  emptyBtnPressed: { opacity: 0.88 },
  emptyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },

  bottomPad: { height: 40 },
});
