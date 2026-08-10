import { useCallback, useRef, useState } from 'react';
import {
  Animated,
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
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  Wallet,
} from 'lucide-react-native';
import { useMyActiveSubscriptions, useMySubscriptions } from '@/hooks/useSubscriptions';
import { useAllStores } from '@/hooks/useStores';
import { buildRoute } from '@/constants/routes';
import { getEffectiveStatus } from '@/utils/subscription';
import type { Subscription, SubscriptionStatus } from '@/types/subscription';

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
  warning:     '#FF9500',
  warningSoft: '#FFF5E0',
  warningDark: '#7A4500',
  danger:      '#FF3B30',
  dangerSoft:  '#FEF0EE',
  dangerDark:  '#C0261A',
  skeleton:    '#E5E5EA',
  heroSurface: '#111119',
  heroMuted:   'rgba(255,255,255,0.40)',
  heroSub:     'rgba(255,255,255,0.60)',
} as const;

// ── Card backgrounds ───────────────────────────────────────────────────────────

const CARD_DARKS = [
  '#1C1C2E', '#0A2342', '#1A1A2E',
  '#0D1B2A', '#1B1B2F', '#0F2027', '#16213E',
] as const;

function cardBg(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CARD_DARKS.length;
  return CARD_DARKS[idx];
}

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

// ── Premium card widget ────────────────────────────────────────────────────────

interface CardWidgetProps {
  sub: Subscription;
  storeName: string | undefined;
  onPress: () => void;
  urgency?: boolean;
}

function SubscriptionCard({ sub, storeName, onPress, urgency }: CardWidgetProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const days  = daysLeft(sub.expiresAt);
  const bg    = cardBg(sub.cardName);

  const onPressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0,
    }).start();
  }, [scale]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1, useNativeDriver: true, speed: 20, bounciness: 2,
    }).start();
  }, [scale]);

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      style={styles.cardPressable}
    >
      <Animated.View style={[styles.cardWidget, { backgroundColor: bg, transform: [{ scale }] }]}>
        {/* Urgency accent bar */}
        {urgency && <View style={styles.urgencyBar} />}

        {/* Top: store name + chip */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            {storeName ? (
              <Text style={styles.cardStoreName} numberOfLines={1}>{storeName}</Text>
            ) : null}
            <Text style={styles.cardName} numberOfLines={1}>{sub.cardName}</Text>
          </View>
          <View style={styles.cardChip}>
            <CreditCard size={17} color="rgba(255,255,255,0.55)" strokeWidth={1.5} />
          </View>
        </View>

        {/* Middle: remaining balance — the hero number */}
        <View style={styles.cardMid}>
          <Text style={styles.cardBalanceLabel}>Remaining Balance</Text>
          <Text style={styles.cardBalance}>{fmt(sub.walletBalance)}</Text>
        </View>

        {/* Bottom: expiry + days left */}
        <View style={styles.cardBottom}>
          <View>
            <Text style={styles.cardExpLabel}>Expires</Text>
            <Text style={styles.cardExpDate}>{fmtDate(sub.expiresAt)}</Text>
          </View>
          {urgency ? (
            <View style={styles.urgencyPill}>
              <Text style={styles.urgencyPillText}>
                {days === 0 ? 'Today' : `${days}d left`}
              </Text>
            </View>
          ) : (
            <View style={styles.daysPill}>
              <Text style={styles.daysPillText}>{days}d left</Text>
            </View>
          )}
        </View>

        {/* Decorative circles */}
        <View style={styles.decCircle1} pointerEvents="none" />
        <View style={styles.decCircle2} pointerEvents="none" />
      </Animated.View>
    </Pressable>
  );
}

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
      <View style={[styles.pastIconWrap, { backgroundColor: cardBg(sub.cardName) }]}>
        <CreditCard size={15} color="rgba(255,255,255,0.80)" strokeWidth={1.5} />
      </View>

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
  if (count === 0) return null;

  return (
    <View style={styles.collapsible}>
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
        {expanded
          ? <ChevronUp size={16} color={C.muted} strokeWidth={2} />
          : <ChevronDown size={16} color={C.muted} strokeWidth={2} />
        }
      </Pressable>

      {expanded && (
        <View style={styles.collapsibleBody}>
          {children}
        </View>
      )}
    </View>
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
  return (
    <View style={styles.hero}>
      {/* Label row */}
      <View style={styles.heroTopRow}>
        <View style={styles.heroLabelWrap}>
          <Wallet size={14} color={C.heroMuted} strokeWidth={2} />
          <Text style={styles.heroLabel}>MY WALLET</Text>
        </View>
        {expiringSoon > 0 && (
          <View style={styles.expiringSoonBadge}>
            <Text style={styles.expiringSoonText}>
              {expiringSoon} expiring soon
            </Text>
          </View>
        )}
      </View>

      {/* Big balance */}
      <Text style={styles.heroBalance}>{fmt(total)}</Text>
      <Text style={styles.heroSub}>
        {activeCount === 0
          ? 'No active memberships'
          : `Remaining across ${activeCount} active ${activeCount === 1 ? 'membership' : 'memberships'}`
        }
      </Text>

      {/* Bottom divider row */}
      <View style={styles.heroRule} />
    </View>
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
      <View style={styles.emptyIconWrap}>
        <CreditCard size={26} color={C.muted} strokeWidth={1.4} />
      </View>
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

  const { data: activeRaw = [], isLoading: loadingActive, refetch: refetchActive } =
    useMyActiveSubscriptions();
  // Guards against a stale cached ACTIVE status past expiresAt — the server only
  // recomputes status on this endpoint's next fetch, not on every read within staleTime.
  const active = activeRaw.filter((s) => getEffectiveStatus(s) === 'ACTIVE');

  const { data: allPage, isLoading: loadingAll, refetch: refetchAll } =
    useMySubscriptions(0);

  const { data: allStores = [] } = useAllStores();

  const isLoading = loadingActive || loadingAll;

  const storeMap = Object.fromEntries(allStores.map((s) => [s.id, s.name])) as Record<number, string>;

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
        {/* ── Loading skeleton ─────────────────────────────────── */}
        {isLoading ? (
          <WalletSkeleton />
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
              <View style={styles.sectionLabelRow}>
                <Text style={styles.sectionLabel}>Active Cards</Text>
                {notExpiring.length > 0 && (
                  <Text style={styles.sectionCount}>{notExpiring.length}</Text>
                )}
              </View>

              {active.length === 0 ? (
                <EmptyWallet onExplore={() => router.replace('/')} />
              ) : notExpiring.length === 0 && expiringSoon.length > 0 ? (
                <View style={styles.allExpiringNote}>
                  <Text style={styles.allExpiringText}>
                    All active cards are expiring soon — see below.
                  </Text>
                </View>
              ) : (
                notExpiring.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    sub={sub}
                    storeName={storeMap[sub.storeId]}
                    onPress={() => navToSub(sub.id)}
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
                  {expiringSoon.map((sub) => (
                    <SubscriptionCard
                      key={sub.id}
                      sub={sub}
                      storeName={storeMap[sub.storeId]}
                      onPress={() => navToSub(sub.id)}
                      urgency
                    />
                  ))}
                </CollapsibleSection>
              </View>
            )}

            {/* ── Past sections ─────────────────────────────────── */}
            {hasAnyPast && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Past Memberships</Text>
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
                        storeName={storeMap[sub.storeId]}
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
                        storeName={storeMap[sub.storeId]}
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
                        storeName={storeMap[sub.storeId]}
                        isLast={idx === cancelled.length - 1}
                        onPress={() => navToSub(sub.id)}
                      />
                    ))}
                  </CollapsibleSection>

                </View>
              </View>
            )}
          </>
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
    color: C.primary,
    letterSpacing: -0.5,
  },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Wallet hero ────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: C.heroSurface,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.heroMuted,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  expiringSoonBadge: {
    backgroundColor: 'rgba(255,59,48,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  expiringSoonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF9B9B',
    letterSpacing: 0.2,
  },
  heroBalance: {
    fontSize: 44,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -2,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 13,
    color: C.heroSub,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  heroRule: {
    marginTop: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.10)',
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
  sectionLabelArea: {
    marginTop: 24,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
  },
  allExpiringNote: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  allExpiringText: {
    fontSize: 13,
    color: C.secondary,
    lineHeight: 19,
  },

  // ── Card widget ────────────────────────────────────────────────────────────
  cardPressable: {
    marginBottom: 14,
  },
  cardWidget: {
    borderRadius: 20,
    padding: 22,
    minHeight: 190,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16 },
      android: { elevation: 6 },
    }),
  },
  urgencyBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    backgroundColor: C.danger,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTopLeft: { flex: 1, gap: 3, paddingRight: 12 },
  cardStoreName: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  cardChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardMid: { marginTop: 14 },
  cardBalanceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '500',
    letterSpacing: 0.3,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  cardBalance: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1.2,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 14,
  },
  cardExpLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  cardExpDate: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  daysPill: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  daysPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.82)',
  },
  urgencyPill: {
    backgroundColor: 'rgba(255,59,48,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  urgencyPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9B9B',
  },
  decCircle1: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.035)', top: -36, right: -36,
  },
  decCircle2: {
    position: 'absolute', width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.03)', bottom: 18, right: 88,
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
    color: C.muted,
  },
  collapsibleBody: { marginTop: 2 },

  // ── Past card container ────────────────────────────────────────────────────
  pastCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
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
  pastName: { fontSize: 14, fontWeight: '600', color: C.primary },
  pastMeta: { fontSize: 12, color: C.muted },
  pastRight: { alignItems: 'flex-end', gap: 5 },
  pastBalance: { fontSize: 14, fontWeight: '700', color: C.primary },

  // ── Status pill ────────────────────────────────────────────────────────────
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
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
    minHeight: 190,
    justifyContent: 'flex-end',
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 52,
    paddingHorizontal: 36,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
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
    letterSpacing: -0.3,
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
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 24,
  },
  emptyBtnPressed: { opacity: 0.88 },
  emptyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },

  bottomPad: { height: 40 },
});
