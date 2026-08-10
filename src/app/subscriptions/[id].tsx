import { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Tag,
  Wallet,
  XCircle,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscriptionDetail, useEligibleMenu, subscriptionKeys } from '@/hooks/useSubscriptions';
import { useCardDetail } from '@/hooks/useCards';
import { useStoreDetail } from '@/hooks/useStores';
import { redemptionKeys, useSubscriptionRedemptions } from '@/hooks/useRedemptions';
import { getEffectiveStatus, isSubscriptionRedeemable } from '@/utils/subscription';
import type { EligibleCategory, EligibleMenuItem, SubscriptionStatus } from '@/types/subscription';
import type { Redemption } from '@/types/redemption';

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

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(toUtc(expiresAt)).getTime() - Date.now()) / 86_400_000));
}

function pct(remaining: number, original: number): number {
  if (original <= 0) return 0;
  return Math.min(Math.max(remaining / original, 0), 1);
}

function dayStart(iso: string): number {
  const d = new Date(toUtc(iso));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function fmtTime(iso: string): string {
  const d       = new Date(toUtc(iso));
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yest    = today - 86_400_000;
  const ds      = dayStart(iso);
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ds === today) return `Today · ${timeStr}`;
  if (ds === yest)  return `Yesterday · ${timeStr}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` · ${timeStr}`;
}

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function isRecent(iso: string): boolean {
  return Date.now() - new Date(toUtc(iso)).getTime() < 5 * 60 * 1000;
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
    return 'Earlier';
  };

  const ORDER = ['Today', 'Yesterday', 'This Week', 'Earlier'] as const;
  const map   = new Map<string, Redemption[]>();
  for (const r of redemptions) {
    const key = bucket(r);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return ORDER.filter((l) => map.has(l)).map((l) => ({ label: l, items: map.get(l)! }));
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<SubscriptionStatus, {
  label: string; color: string; bg: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
}> = {
  ACTIVE:    { label: 'Active',    color: C.successDark, bg: C.successSoft, Icon: CheckCircle2 },
  EXPIRED:   { label: 'Expired',   color: C.muted,       bg: C.bg,          Icon: Clock        },
  EXHAUSTED: { label: 'Exhausted', color: C.warningDark, bg: C.warningSoft, Icon: Wallet       },
  CANCELLED: { label: 'Cancelled', color: C.dangerDark,  bg: C.dangerSoft,  Icon: XCircle      },
};

// ── Top bar ────────────────────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Membership</Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

// ── Membership hero ────────────────────────────────────────────────────────────

interface HeroProps {
  cardName: string;
  storeName: string | undefined;
  walletBalance: number;
  originalBalance: number | undefined;
  status: SubscriptionStatus;
  expiresAt: string;
}

function MembershipHero({
  cardName, storeName, walletBalance, originalBalance, status, expiresAt,
}: HeroProps) {
  const bg     = cardBg(cardName);
  const days   = daysLeft(expiresAt);
  const ratio  = originalBalance != null ? pct(walletBalance, originalBalance) : null;
  const { label, color, bg: statusBg } = STATUS_CFG[status];
  const { Icon } = STATUS_CFG[status];

  // Pulse when balance changes (e.g. after vendor redemption + pull-to-refresh)
  const pulseScale  = useRef(new Animated.Value(1)).current;
  const prevBalance = useRef(walletBalance);
  useEffect(() => {
    if (prevBalance.current !== walletBalance) {
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.04, duration: 150, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1,    duration: 380, useNativeDriver: true }),
      ]).start();
    }
    prevBalance.current = walletBalance;
  }, [walletBalance, pulseScale]);

  const progressColor = status === 'ACTIVE'
    ? C.success
    : status === 'EXHAUSTED'
    ? C.warning
    : C.muted;

  return (
    <View style={[styles.hero, { backgroundColor: bg }]}>
      {/* Store + card name */}
      <View style={styles.heroHead}>
        <View style={styles.heroNames}>
          {storeName ? (
            <Text style={styles.heroStore} numberOfLines={1}>{storeName}</Text>
          ) : null}
          <Text style={styles.heroCard} numberOfLines={2}>{cardName}</Text>
        </View>
        <View style={styles.heroChip}>
          <CreditCard size={20} color="rgba(255,255,255,0.55)" strokeWidth={1.5} />
        </View>
      </View>

      {/* Big balance — pulses gently when balance changes after a redemption */}
      <View style={styles.heroBalanceWrap}>
        <Text style={styles.heroBalanceLabel}>Remaining Balance</Text>
        <Animated.Text
          style={[styles.heroBalance, { transform: [{ scale: pulseScale }] }]}
        >
          {fmt(walletBalance)}
        </Animated.Text>
        {originalBalance != null && (
          <Text style={styles.heroOriginal}>
            of {fmt(originalBalance)} original
          </Text>
        )}
      </View>

      {/* Progress bar */}
      {ratio != null && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${ratio * 100}%`, backgroundColor: progressColor },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressPct}>
              {Math.round(ratio * 100)}% Available
            </Text>
            {originalBalance != null && (
              <Text style={styles.progressUsed}>
                {fmt(originalBalance - walletBalance)} used
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Bottom: expiry + status */}
      <View style={styles.heroBottom}>
        <View>
          <Text style={styles.heroExpLabel}>
            {status === 'EXPIRED' ? 'Expired' : 'Expires'}
          </Text>
          <Text style={styles.heroExpDate}>
            {fmtDate(expiresAt)}
            {status === 'ACTIVE' && days <= 7 && days > 0
              ? ` · ${days}d left`
              : status === 'ACTIVE' && days === 0
              ? ' · Today'
              : ''}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusBg + 'DD' }]}>
          <Icon size={12} color={color} strokeWidth={2.2} />
          <Text style={[styles.statusPillText, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Decorative circles */}
      <View style={styles.decCircle1} pointerEvents="none" />
      <View style={styles.decCircle2} pointerEvents="none" />
      <View style={styles.decCircle3} pointerEvents="none" />
    </View>
  );
}

// ── Info section ───────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  isLast,
  highlight,
}: {
  label: string;
  value: string;
  isLast?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, highlight && styles.infoValueHighlight]}>{value}</Text>
    </View>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ── Eligible menu section ──────────────────────────────────────────────────────

function MenuItemRow({ item, isLast }: { item: EligibleMenuItem; isLast: boolean }) {
  const isVeg = item.itemType === 'VEG';
  return (
    <View style={[styles.menuItemRow, !isLast && styles.infoRowBorder]}>
      <View style={[styles.menuTypeDot, { backgroundColor: isVeg ? '#34C759' : '#FF3B30' }]} />
      <Text style={styles.menuItemName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.menuItemPrice}>{fmt(item.price)}</Text>
    </View>
  );
}

function EligibleMenuSection({ categories }: { categories: EligibleCategory[] }) {
  if (categories.length === 0) {
    return (
      <Section title="Eligible Items">
        <View style={styles.menuEmpty}>
          <Text style={styles.menuEmptyText}>No eligible items configured for this membership.</Text>
        </View>
      </Section>
    );
  }

  return (
    <>
      {/* Category chips */}
      <Section title="Eligible Categories">
        <View style={styles.chipRow}>
          {categories.map((cat) => (
            <View key={cat.categoryId} style={styles.catChip}>
              <Tag size={11} color={C.accent} strokeWidth={2.2} />
              <Text style={styles.catChipText}>{cat.categoryName}</Text>
            </View>
          ))}
        </View>
      </Section>

      {/* Items per category */}
      {categories.map((cat) => {
        if (cat.items.length === 0) return null;
        const totalItems = categories.reduce((n, c) => n + c.items.length, 0);
        const isOnlyCategory = categories.length === 1;
        return (
          <Section
            key={cat.categoryId}
            title={isOnlyCategory
              ? `Eligible Items (${totalItems})`
              : cat.categoryName
            }
          >
            {cat.items.map((item, idx) => (
              <MenuItemRow
                key={item.itemId}
                item={item}
                isLast={idx === cat.items.length - 1}
              />
            ))}
          </Section>
        );
      })}
    </>
  );
}

// ── Redemption status widget (Latest / Success card) ──────────────────────────
// Shows after the first redemption. If < 5 min old, renders green "Redeemed" style.

function RedemptionStatusWidget({ redemption }: { redemption: Redemption }) {
  const recent    = isRecent(redemption.createdAt);
  const itemLabel = redemption.items
    .map((i) => (i.quantity > 1 ? `${i.menuItemName} ×${i.quantity}` : i.menuItemName))
    .join(', ');

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {recent ? 'Just Redeemed' : 'Last Redemption'}
      </Text>
      <View style={[styles.sectionCard, styles.redemptionWidget, recent && styles.redemptionWidgetSuccess]}>
        {/* Header */}
        <View style={[styles.redemptionWidgetHead, recent && styles.redemptionWidgetHeadSuccess]}>
          <View style={[styles.redemptionDot, recent && styles.redemptionDotSuccess]} />
          <Text style={[styles.redemptionWidgetStatus, recent && styles.redemptionWidgetStatusSuccess]}>
            {recent ? 'Successfully Redeemed' : 'Redeemed'}
          </Text>
          <Text style={styles.redemptionWidgetTime}>{fmtTime(redemption.createdAt)}</Text>
        </View>
        {/* Item names */}
        <View style={styles.redemptionWidgetBody}>
          <Text style={styles.redemptionWidgetItems} numberOfLines={2}>{itemLabel}</Text>
          <View style={styles.redemptionWidgetAmounts}>
            <View style={styles.redemptionWidgetAmountCol}>
              <Text style={styles.redemptionAmountLabel}>Deducted</Text>
              <Text style={styles.redemptionAmountValue}>−{fmt(redemption.totalAmount)}</Text>
            </View>
            <View style={styles.redemptionWidgetAmountDivider} />
            <View style={styles.redemptionWidgetAmountCol}>
              <Text style={styles.redemptionAmountLabel}>Balance After</Text>
              <Text style={[styles.redemptionAmountValue, styles.redemptionAmountBalance]}>
                {fmt(redemption.remainingBalance)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Redemption history timeline ────────────────────────────────────────────────

function RedemptionHistorySection({ redemptions }: { redemptions: Redemption[] }) {
  if (redemptions.length === 0) {
    return (
      <Section title="Redemption History">
        <View style={styles.emptyHistory}>
          <Text style={styles.emptyHistoryText}>
            No redemptions yet. Tap "Redeem Benefits" to start.
          </Text>
        </View>
      </Section>
    );
  }

  const sorted = [...redemptions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const groups = groupRedemptionsByDate(sorted);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Redemption History</Text>
      <View style={styles.sectionCard}>
        {groups.map(({ label, items }, gIdx) => (
          <View key={label}>
            {gIdx > 0 ? <View style={styles.historyGroupDivider} /> : null}
            <View style={styles.historyGroupHeader}>
              <Text style={styles.historyGroupLabel}>{label}</Text>
            </View>
            {items.map((r, idx) => {
              const isLast = idx === items.length - 1;
              const names  = r.items
                .map((i) => (i.quantity > 1 ? `${i.menuItemName} ×${i.quantity}` : i.menuItemName))
                .join(', ');
              return (
                <View key={r.id} style={[styles.historyRow, !isLast && styles.infoRowBorder]}>
                  <View style={styles.historyRowLeft}>
                    <Text style={styles.historyRowItems} numberOfLines={1}>{names}</Text>
                    <Text style={styles.historyRowTime}>{fmtTime(r.createdAt)}</Text>
                  </View>
                  <View style={styles.historyRowRight}>
                    <Text style={styles.historyRowAmount}>−{fmt(r.totalAmount)}</Text>
                    <Text style={styles.historyRowBalance}>{fmt(r.remainingBalance)} left</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBone({ style }: { style?: object }) {
  return <View style={[styles.skBone, style]} />;
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Hero skeleton */}
        <View style={styles.heroSkeleton}>
          <SkeletonBone style={{ width: 110, height: 12, opacity: 0.25, marginBottom: 8 }} />
          <SkeletonBone style={{ width: 200, height: 22, opacity: 0.3, marginBottom: 20 }} />
          <SkeletonBone style={{ width: 130, height: 13, opacity: 0.2, marginBottom: 6 }} />
          <SkeletonBone style={{ width: 180, height: 40, opacity: 0.3, marginBottom: 18 }} />
          <SkeletonBone style={{ width: '100%', height: 6, borderRadius: 3, opacity: 0.2, marginBottom: 20 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SkeletonBone style={{ width: 110, height: 13, opacity: 0.25 }} />
            <SkeletonBone style={{ width: 70, height: 26, borderRadius: 13, opacity: 0.25 }} />
          </View>
        </View>

        {/* Wallet balance skeleton */}
        <View style={styles.section}>
          <SkeletonBone style={{ width: 100, height: 12, marginBottom: 12 }} />
          <View style={styles.sectionCard}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.infoRow, i < 1 && styles.infoRowBorder]}>
                <SkeletonBone style={{ width: 100, height: 12 }} />
                <SkeletonBone style={{ width: 70, height: 12 }} />
              </View>
            ))}
          </View>
        </View>

        {/* Eligible menu skeleton */}
        <View style={styles.section}>
          <SkeletonBone style={{ width: 140, height: 12, marginBottom: 12 }} />
          <View style={styles.sectionCard}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.menuItemRow, i < 2 && styles.infoRowBorder]}>
                <View style={[styles.skBone, { width: 8, height: 8, borderRadius: 4, flexShrink: 0 }]} />
                <SkeletonBone style={{ flex: 1 }} />
                <SkeletonBone style={{ width: 44 }} />
              </View>
            ))}
          </View>
        </View>

        {/* Validity skeleton */}
        <View style={styles.section}>
          <SkeletonBone style={{ width: 60, height: 12, marginBottom: 12 }} />
          <View style={styles.sectionCard}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.infoRow, i < 1 && styles.infoRowBorder]}>
                <SkeletonBone style={{ width: 80, height: 12 }} />
                <SkeletonBone style={{ width: 110, height: 12 }} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────

function ErrorState({ message, onBack, onRetry }: {
  message: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={onBack} />
      <View style={styles.errorCenter}>
        <AlertCircle size={40} color={C.muted} strokeWidth={1.5} />
        <Text style={styles.errorTitle}>Couldn't load membership</Text>
        <Text style={styles.errorSub}>{message}</Text>
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SubscriptionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const {
    data: sub,
    isLoading: subLoading,
    isError,
    error: subErr,
    refetch: refetchSub,
  } = useSubscriptionDetail(id ?? '');

  const { data: cardDef } = useCardDetail(sub?.cardDefinitionId);
  const { data: store }   = useStoreDetail(sub?.storeId ?? 0);

  const {
    data: eligibleMenu,
    isLoading: menuLoading,
    refetch: refetchMenu,
  } = useEligibleMenu(sub && isSubscriptionRedeemable(sub) ? sub.id : undefined);

  // Per-subscription redemption history — used for the status widget + timeline.
  const {
    data: redemptions = [],
    refetch: refetchRedemptions,
  } = useSubscriptionRedemptions(sub?.id);

  const pendingRedemption = redemptions.find((r) => r.status === 'PENDING');

  // Auto-refresh on focus so users never need to manually pull after a vendor redemption.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) { isFirstFocus.current = false; return; }
      if (!id) return;
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.bySubscription(id) });
    }, [queryClient, id]),
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchSub(), refetchMenu(), refetchRedemptions()]);
    setIsRefreshing(false);
  }, [refetchSub, refetchMenu, refetchRedemptions]);

  if (subLoading) return <DetailSkeleton onBack={handleBack} />;

  if (isError || !sub) {
    return (
      <ErrorState
        message={(subErr as Error)?.message ?? 'Membership not found.'}
        onBack={handleBack}
        onRetry={() => void refetchSub()}
      />
    );
  }

  const originalBalance = cardDef?.walletAmount;
  const days = daysLeft(sub.expiresAt);
  const effectiveStatus = getEffectiveStatus(sub);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={handleBack} />

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
        {/* ── Hero ──────────────────────────────────────────────── */}
        <MembershipHero
          cardName={sub.cardName}
          storeName={store?.name}
          walletBalance={sub.walletBalance}
          originalBalance={originalBalance}
          status={effectiveStatus}
          expiresAt={sub.expiresAt}
        />

        {/* ── Wallet balance ─────────────────────────────────────── */}
        <Section title="Wallet Balance">
          {originalBalance != null && (
            <InfoRow
              label="Original Balance"
              value={fmt(originalBalance)}
            />
          )}
          <InfoRow
            label="Remaining Balance"
            value={fmt(sub.walletBalance)}
            highlight
            isLast
          />
        </Section>

        {/* ── Latest redemption (APPROVED/COMPLETED only) ─────────── */}
        {(() => {
          const terminal = redemptions.filter(
            (r) => r.status === 'APPROVED' || r.status === 'COMPLETED' || r.status === 'REVERSED',
          );
          if (terminal.length === 0) return null;
          const latest = [...terminal].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )[0];
          return <RedemptionStatusWidget redemption={latest} />;
        })()}

        {/* ── Eligible menu (ACTIVE) — primary value proposition ─── */}
        {effectiveStatus === 'ACTIVE' && (
          menuLoading ? (
            <View style={styles.section}>
              <View style={[styles.skBone, { width: 140, height: 12, marginBottom: 12 }]} />
              <View style={styles.sectionCard}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.menuItemRow, i < 2 && styles.infoRowBorder]}>
                    <View style={[styles.skBone, { width: 8, height: 8, borderRadius: 4, flexShrink: 0 }]} />
                    <View style={[styles.skBone, { flex: 1 }]} />
                    <View style={[styles.skBone, { width: 44 }]} />
                  </View>
                ))}
              </View>
            </View>
          ) : eligibleMenu ? (
            <EligibleMenuSection categories={eligibleMenu.categories} />
          ) : null
        )}

        {/* ── Inactive note (non-ACTIVE) ─────────────────────────── */}
        {effectiveStatus !== 'ACTIVE' && (
          <Section title="Membership Status">
            <View style={styles.inactiveNote}>
              {(() => {
                const { Icon, label, color } = STATUS_CFG[effectiveStatus];
                return (
                  <>
                    <Icon size={18} color={color} strokeWidth={2} />
                    <Text style={[styles.inactiveNoteText, { color }]}>
                      This membership is {label.toLowerCase()}
                      {effectiveStatus === 'EXPIRED' ? ` on ${fmtDate(sub.expiresAt)}` : ''}.
                      Redemption is no longer available.
                    </Text>
                  </>
                );
              })()}
            </View>
          </Section>
        )}

        {/* ── Redemption history timeline (completed only) ──────── */}
        <RedemptionHistorySection
          redemptions={redemptions.filter((r) => r.status !== 'PENDING')}
        />

        {/* ── Validity ───────────────────────────────────────────── */}
        <Section title="Validity">
          <InfoRow
            label="Valid Until"
            value={fmtDate(sub.expiresAt)}
            isLast={effectiveStatus !== 'ACTIVE'}
          />
          {effectiveStatus === 'ACTIVE' && (
            <InfoRow
              label="Days Remaining"
              value={days === 0 ? 'Expires today' : `${days} days`}
              isLast
            />
          )}
        </Section>

        {/* ── Membership details ─────────────────────────────────── */}
        <Section title="Membership Details">
          <InfoRow
            label="Purchased"
            value={fmtDate(sub.purchasedAt)}
          />
          <InfoRow
            label="Store"
            value={store?.name ?? `Store #${sub.storeId}`}
            isLast
          />
        </Section>

        <View style={{ height: effectiveStatus === 'ACTIVE' ? 56 + 24 + insets.bottom + 16 : 48 }} />
      </ScrollView>

      {effectiveStatus === 'ACTIVE' ? (
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 16 }]}>
          {pendingRedemption ? (
            <Pressable
              style={({ pressed }) => [
                styles.presentBtn,
                styles.presentBtnPending,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/subscriptions/pending',
                  params: {
                    redemptionId: String(pendingRedemption.id),
                    subId: String(sub.id),
                  },
                } as never)
              }
            >
              <Clock size={16} color="#FFF" strokeWidth={2.2} />
              <Text style={styles.presentBtnText}>View Pending Request</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.presentBtn,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/subscriptions/select',
                  params: { subId: String(sub.id) },
                } as never)
              }
            >
              <Text style={styles.presentBtnText}>Redeem Benefits</Text>
            </Pressable>
          )}
        </View>
      ) : null}
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
    backgroundColor: C.bg,
    justifyContent: 'center', alignItems: 'center',
  },
  topBarTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '600',
    color: C.primary, letterSpacing: -0.2,
  },
  topBarSpacer: { width: 36 },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Membership hero ────────────────────────────────────────────────────────
  hero: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 22,
    padding: 24,
    minHeight: 260,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20 },
      android: { elevation: 8 },
    }),
  },
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroNames: { flex: 1, gap: 4, paddingRight: 12 },
  heroStore: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroCard: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  heroChip: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroBalanceWrap: { marginTop: 16 },
  heroBalanceLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.48)',
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  heroBalance: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1.5,
  },
  heroOriginal: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    marginTop: 4,
  },

  // Progress bar
  progressWrap: { marginTop: 18 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressPct: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  progressUsed: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '500',
  },

  // Hero bottom
  heroBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 18,
  },
  heroExpLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  heroExpDate: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // Decorative circles
  decCircle1: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)', top: -40, right: -40,
  },
  decCircle2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)', bottom: 20, right: 90,
  },
  decCircle3: {
    position: 'absolute', width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.03)', bottom: -10, left: 40,
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: C.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
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

  // ── Info rows ──────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  infoLabel: {
    fontSize: 14,
    color: C.secondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: C.primary,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  infoValueHighlight: {
    color: C.accent,
    fontSize: 15,
  },

  // ── Eligible menu ──────────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  menuTypeDot: {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
  },
  menuItemName: {
    flex: 1,
    fontSize: 14,
    color: C.primary,
    fontWeight: '500',
  },
  menuItemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: C.secondary,
  },
  menuEmpty: {
    padding: 16,
  },
  menuEmptyText: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 20,
  },

  // ── Inactive note ──────────────────────────────────────────────────────────
  inactiveNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
  },
  inactiveNoteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },

  // ── Error state ────────────────────────────────────────────────────────────
  errorCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 40,
  },
  errorTitle: {
    fontSize: 17, fontWeight: '700', color: C.primary, marginTop: 8,
  },
  errorSub: {
    fontSize: 14, color: C.secondary, textAlign: 'center', lineHeight: 21,
  },
  retryBtn: {
    marginTop: 10, backgroundColor: C.accent,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22,
  },
  retryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // ── Hero skeleton ──────────────────────────────────────────────────────────
  heroSkeleton: {
    margin: 16,
    borderRadius: 22,
    backgroundColor: '#1A1A2A',
    padding: 24,
    minHeight: 260,
    justifyContent: 'flex-end',
  },

  // ── Skeleton bone ──────────────────────────────────────────────────────────
  skBone: {
    height: 13,
    width: '100%',
    borderRadius: 7,
    backgroundColor: C.skeleton,
  },

  bottomPad: { height: 48 },

  // ── Redemption status widget ───────────────────────────────────────────────
  redemptionWidget: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  redemptionWidgetSuccess: {
    borderLeftWidth: 3,
    borderLeftColor: C.success,
  },
  redemptionWidgetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  redemptionWidgetHeadSuccess: {
    backgroundColor: C.successSoft,
    borderBottomColor: 'rgba(52,199,89,0.15)',
  },
  redemptionDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.muted,
  },
  redemptionDotSuccess: {
    backgroundColor: C.success,
  },
  redemptionWidgetStatus: {
    flex: 1,
    fontSize: 11, fontWeight: '700',
    color: C.secondary,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  redemptionWidgetStatusSuccess: {
    color: C.successDark,
  },
  redemptionWidgetTime: {
    fontSize: 11, color: C.muted, fontWeight: '500',
  },
  redemptionWidgetBody: {
    padding: 16, gap: 12,
  },
  redemptionWidgetItems: {
    fontSize: 15, fontWeight: '600', color: C.primary, lineHeight: 22,
  },
  redemptionWidgetAmounts: {
    flexDirection: 'row', alignItems: 'center',
  },
  redemptionWidgetAmountCol: {
    flex: 1, gap: 3,
  },
  redemptionWidgetAmountDivider: {
    width: StyleSheet.hairlineWidth, height: 32,
    backgroundColor: C.border, marginHorizontal: 16,
  },
  redemptionAmountLabel: {
    fontSize: 11, color: C.muted, fontWeight: '500', letterSpacing: 0.2,
  },
  redemptionAmountValue: {
    fontSize: 16, fontWeight: '700', color: C.primary, letterSpacing: -0.3,
  },
  redemptionAmountBalance: {
    color: C.accent,
  },

  // ── Redemption history timeline ────────────────────────────────────────────
  emptyHistory: {
    padding: 16,
  },
  emptyHistoryText: {
    fontSize: 13, color: C.muted, lineHeight: 20,
  },
  historyGroupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: 0,
  },
  historyGroupHeader: {
    paddingHorizontal: 16,
    paddingTop: 10, paddingBottom: 4,
  },
  historyGroupLabel: {
    fontSize: 11, fontWeight: '700',
    color: C.muted, letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  historyRowLeft: {
    flex: 1, gap: 3,
  },
  historyRowRight: {
    alignItems: 'flex-end', gap: 3, flexShrink: 0,
  },
  historyRowItems: {
    fontSize: 14, fontWeight: '500', color: C.primary,
  },
  historyRowTime: {
    fontSize: 12, color: C.muted, fontWeight: '400',
  },
  historyRowAmount: {
    fontSize: 14, fontWeight: '700', color: C.primary,
  },
  historyRowBalance: {
    fontSize: 11, color: C.muted, fontWeight: '500',
  },

  // ── Sticky CTA — Present at Counter ───────────────────────────────────────
  stickyBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  presentBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.40, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  presentBtnPending: {
    backgroundColor: C.warning,
  },
  presentBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
});
