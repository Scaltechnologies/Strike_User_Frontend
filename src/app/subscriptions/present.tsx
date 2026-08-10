import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Info,
  Tag,
  Wallet,
  XCircle,
} from 'lucide-react-native';
import { useSubscriptionDetail, useEligibleMenu } from '@/hooks/useSubscriptions';
import { useCardDetail } from '@/hooks/useCards';
import { useStoreDetail } from '@/hooks/useStores';
import { getEffectiveStatus, isSubscriptionRedeemable } from '@/utils/subscription';
import type { EligibleCategory, EligibleMenuItem, SubscriptionStatus } from '@/types/subscription';

// ── Design tokens — match subscription detail exactly ─────────────────────────

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
} as const;

// ── Card backgrounds — same deterministic hash as rest of the app ──────────────

const CARD_DARKS = [
  '#1C1C2E', '#0A2342', '#1A1A2E',
  '#0D1B2A', '#1B1B2F', '#0F2027', '#16213E',
] as const;

function cardBg(name: string): string {
  return CARD_DARKS[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CARD_DARKS.length];
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

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(toUtc(iso)).getTime() - Date.now()) / 86_400_000));
}

function pct(remaining: number, original: number): number {
  if (original <= 0) return 0;
  return Math.min(Math.max(remaining / original, 0), 1);
}

function fmtMembershipId(id: number): string {
  return `#${String(id).padStart(6, '0')}`;
}

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<SubscriptionStatus, {
  label: string;
  color: string;
  bg: string;
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

// ── Hero card — the only dark element on this screen ──────────────────────────

interface HeroProps {
  cardName: string;
  storeName: string | undefined;
  walletBalance: number;
  originalBalance: number | undefined;
  status: SubscriptionStatus;
  expiresAt: string;
}

function HeroCard({
  cardName, storeName, walletBalance, originalBalance, status, expiresAt,
}: HeroProps) {
  const bg    = cardBg(cardName);
  const days  = daysLeft(expiresAt);
  const ratio = originalBalance != null ? pct(walletBalance, originalBalance) : null;
  const { label, color, bg: statusBg, Icon } = STATUS_CFG[status];

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

      {/* Balance */}
      <View style={styles.heroBalanceWrap}>
        <Text style={styles.heroBalanceLabel}>Remaining Balance</Text>
        <Text style={styles.heroBalance}>{fmt(walletBalance)}</Text>
        {originalBalance != null ? (
          <Text style={styles.heroOriginal}>of {fmt(originalBalance)} original</Text>
        ) : null}
      </View>

      {/* Progress bar */}
      {ratio != null ? (
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
            <Text style={styles.progressPct}>{Math.round(ratio * 100)}% available</Text>
            {originalBalance != null ? (
              <Text style={styles.progressUsed}>
                {fmt(originalBalance - walletBalance)} used
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

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

// ── Membership ID card ─────────────────────────────────────────────────────────
// Large, vendor-readable identifier. Centred on a white surface.

function MembershipIdCard({ subId }: { subId: number }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Membership ID</Text>
      <View style={styles.idCard}>
        <Text style={styles.idLabel}>Show this to the vendor</Text>
        <Text style={styles.idNumber}>{fmtMembershipId(subId)}</Text>
      </View>
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

// ── Eligible categories ────────────────────────────────────────────────────────

function CategoriesSection({ categories }: { categories: EligibleCategory[] }) {
  if (categories.length === 0) return null;
  return (
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
  );
}

// ── Items preview — max 4 rows, then "+N more" ─────────────────────────────────

function ItemPreviewRow({ item, hasBorder }: { item: EligibleMenuItem; hasBorder: boolean }) {
  const isVeg = item.itemType === 'VEG';
  return (
    <View style={[styles.itemRow, hasBorder && styles.itemRowBorder]}>
      <View style={[styles.itemDot, { backgroundColor: isVeg ? C.success : C.danger }]} />
      <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.itemPrice}>{fmt(item.price)}</Text>
    </View>
  );
}

function ItemsPreviewSection({ categories }: { categories: EligibleCategory[] }) {
  const allItems = categories.flatMap((c) => c.items);
  if (allItems.length === 0) return null;

  const PREVIEW_COUNT = 4;
  const preview  = allItems.slice(0, PREVIEW_COUNT);
  const overflow = allItems.length - preview.length;

  return (
    <Section title={`Eligible Items (${allItems.length})`}>
      {preview.map((item, idx) => (
        <ItemPreviewRow
          key={item.itemId}
          item={item}
          hasBorder={idx < preview.length - 1 || overflow > 0}
        />
      ))}
      {overflow > 0 ? (
        <View style={styles.overflowRow}>
          <Text style={styles.overflowText}>+{overflow} more item{overflow > 1 ? 's' : ''}</Text>
        </View>
      ) : null}
    </Section>
  );
}

// ── Instructions card ──────────────────────────────────────────────────────────

function InstructionsCard() {
  return (
    <View style={styles.section}>
      <View style={styles.instructionsCard}>
        <View style={styles.instructionsIcon}>
          <Info size={16} color={C.muted} strokeWidth={1.8} />
        </View>
        <Text style={styles.instructionsText}>
          Show this screen to the vendor at the counter. The vendor will process your
          order and your balance will update automatically.
        </Text>
      </View>
    </View>
  );
}

// ── Blocked notice — shown when a membership is no longer redeemable ──────────

function BlockedNotice({ status }: { status: SubscriptionStatus }) {
  const { label, color, bg, Icon } = STATUS_CFG[status];
  return (
    <View style={styles.section}>
      <View style={[styles.instructionsCard, { backgroundColor: bg }]}>
        <Icon size={16} color={color} strokeWidth={1.8} />
        <Text style={[styles.instructionsText, { color, fontWeight: '600' }]}>
          This membership is {label.toLowerCase()} and can no longer be redeemed at the
          counter.
        </Text>
      </View>
    </View>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSkeleton}>
          <View style={[styles.skBone, { width: 110, height: 12, opacity: 0.25, marginBottom: 8 }]} />
          <View style={[styles.skBone, { width: 200, height: 22, opacity: 0.3, marginBottom: 20 }]} />
          <View style={[styles.skBone, { width: 140, height: 38, opacity: 0.35, marginBottom: 14 }]} />
          <View style={[styles.skBone, { width: '100%', height: 5, borderRadius: 3, opacity: 0.2 }]} />
        </View>
        {/* ID card skeleton */}
        <View style={styles.section}>
          <View style={[styles.skBone, { width: 100, height: 12, marginBottom: 12 }]} />
          <View style={[styles.sectionCard, { paddingVertical: 32, alignItems: 'center' }]}>
            <View style={[styles.skBone, { width: 180, height: 44 }]} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PresentAtCounterScreen() {
  const { subId } = useLocalSearchParams<{ subId: string }>();
  const router    = useRouter();

  const { data: sub, isLoading } = useSubscriptionDetail(subId ?? '');
  const { data: cardDef }        = useCardDetail(sub?.cardDefinitionId);
  const { data: store }          = useStoreDetail(sub?.storeId ?? 0);
  const { data: eligibleMenu }   = useEligibleMenu(
    sub && isSubscriptionRedeemable(sub) ? sub.id : undefined,
  );

  // Entrance animation — subtle fade + lift, no bounce
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (isLoading || !sub) return <LoadingSkeleton onBack={handleBack} />;

  const originalBalance = cardDef?.walletAmount;
  const categories      = eligibleMenu?.categories ?? [];
  const effectiveStatus = getEffectiveStatus(sub);
  const redeemable      = effectiveStatus === 'ACTIVE';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.scrollContent,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* ── Hero — only dark element on screen ─── */}
          <HeroCard
            cardName={sub.cardName}
            storeName={store?.name}
            walletBalance={sub.walletBalance}
            originalBalance={originalBalance}
            status={effectiveStatus}
            expiresAt={sub.expiresAt}
          />

          {/* ── Membership ID — primary section ──────── */}
          <MembershipIdCard subId={sub.id} />

          {redeemable ? (
            <>
              {/* ── Eligible categories — chips ──────────── */}
              <CategoriesSection categories={categories} />

              {/* ── Items preview (max 4) ─────────────────── */}
              <ItemsPreviewSection categories={categories} />

              {/* ── Instructions ─────────────────────────── */}
              <InstructionsCard />
            </>
          ) : (
            <BlockedNotice status={effectiveStatus} />
          )}

          <View style={styles.bottomPad} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar — identical to subscription detail
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

  // ── Hero card — dark, floating ─────────────────────────────────────────────
  hero: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 24,
    padding: 24,
    minHeight: 255,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.26, shadowRadius: 24 },
      android: { elevation: 10 },
    }),
  },
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroNames: { flex: 1, gap: 4, paddingRight: 12 },
  heroStore: {
    fontSize: 11, fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  heroCard: {
    fontSize: 20, fontWeight: '700',
    color: '#FFFFFF', letterSpacing: -0.4,
  },
  heroChip: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  heroBalanceWrap: { marginTop: 16 },
  heroBalanceLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.48)',
    fontWeight: '500', letterSpacing: 0.4,
    marginBottom: 4, textTransform: 'uppercase',
  },
  heroBalance: {
    fontSize: 40, fontWeight: '700',
    color: '#FFFFFF', letterSpacing: -1.5,
  },
  heroOriginal: {
    fontSize: 12, color: 'rgba(255,255,255,0.45)',
    fontWeight: '500', marginTop: 4,
  },
  progressWrap: { marginTop: 18 },
  progressTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6,
  },
  progressPct: {
    fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600',
  },
  progressUsed: {
    fontSize: 11, color: 'rgba(255,255,255,0.40)', fontWeight: '500',
  },
  heroBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-end', marginTop: 18,
  },
  heroExpLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.40)',
    fontWeight: '500', letterSpacing: 0.4,
    marginBottom: 3, textTransform: 'uppercase',
  },
  heroExpDate: {
    fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusPillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
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

  // ── Membership ID card ─────────────────────────────────────────────────────
  idCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  idLabel: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  idNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -2,
    // fontVariant: ['tabular-nums'],  // uncomment if RN version supports it
  },

  // ── Section wrapper ────────────────────────────────────────────────────────
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: '600',
    color: C.muted, letterSpacing: 0.5,
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

  // ── Category chips ─────────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
  },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.accentSoft, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: C.accent },

  // ── Item preview rows ──────────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  itemDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  itemName: { flex: 1, fontSize: 14, color: C.primary, fontWeight: '500' },
  itemPrice: { fontSize: 13, fontWeight: '600', color: C.secondary },
  overflowRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  overflowText: {
    fontSize: 13, fontWeight: '600', color: C.muted,
  },

  // ── Instructions card ──────────────────────────────────────────────────────
  instructionsCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
      android: { elevation: 1 },
    }),
  },
  instructionsIcon: { marginTop: 1, flexShrink: 0, alignSelf: 'flex-start' as const },
  instructionsText: {
    flex: 1, fontSize: 13,
    color: C.secondary, lineHeight: 20, fontWeight: '400',
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  heroSkeleton: {
    margin: 16, borderRadius: 24,
    backgroundColor: '#1A1A2A', padding: 24, minHeight: 255,
    justifyContent: 'flex-end',
  },
  skBone: {
    height: 13, width: '100%',
    borderRadius: 7, backgroundColor: '#E5E5EA',
  },

  bottomPad: { height: 40 },
});
