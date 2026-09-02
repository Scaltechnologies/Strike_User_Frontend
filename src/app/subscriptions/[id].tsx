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
import axios from 'axios';
import { Image } from 'expo-image';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  MapPin,
  QrCode,
  Receipt,
  SearchX,
  Settings,
  Store,
  Tag,
  Ticket,
  Timer,
  Wallet,
  XCircle,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useSubscriptionDetail, useEligibleMenu, subscriptionKeys } from '@/hooks/useSubscriptions';
import { useCardDetail } from '@/hooks/useCards';
import { useStoreDetail } from '@/hooks/useStores';
import { redemptionKeys, useSubscriptionRedemptions } from '@/hooks/useRedemptions';
import { getEffectiveStatus, getSubscriptionValidityDays, isSubscriptionRedeemable } from '@/utils/subscription';
import { CARD_HEIGHT, CARD_RADIUS, CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import { tapLight, tapMedium, tapSelect } from '@/utils/haptics';
import { useMediaSource } from '@/utils/media';
import { ROUTES } from '@/constants/routes';
import { RedemptionDetailSheet } from '@/components/history/RedemptionDetailSheet';
import { WalletConsumptionGrid } from '@/components/wallet/WalletConsumptionGrid';
import { CellRedemptionChooser } from '@/components/wallet/CellRedemptionChooser';
import { EmptyState } from '@/components/common/EmptyState';
import type { EligibleCategory, EligibleMenuItem, Subscription, SubscriptionStatus } from '@/types/subscription';
import type { Redemption } from '@/types/redemption';
import { ManropeWeights } from '@/constants/theme';

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
  info:        '#2563EB',
  infoSoft:    '#EEF3FF',
  plum:        '#7C3AED',
  plumSoft:    '#F5F0FF',
  teal:        '#0D9488',
  tealSoft:    '#EBFAF8',
  skeleton:    '#E5E5EA',
  heroSurface: '#111119',
  heroMuted:   'rgba(255,255,255,0.40)',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

// Some redemption-service records (mainly older/legacy ones) have no
// remainingBalance recorded — show nothing rather than the literal "₹null".
function fmtBalance(n: number | null | undefined): string | null {
  return n == null ? null : fmt(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// Null for subscriptions predating this field, or granted directly by an admin (no real
// payment) — those show no row at all rather than guessing "Online".
function paymentMethodLabel(method: Subscription['paymentMethod']): string | null {
  if (method === 'ONLINE') return 'Online';
  if (method === 'PAY_AT_STORE') return 'Pay at Store';
  return null;
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(toUtc(expiresAt)).getTime() - Date.now()) / 86_400_000));
}

function pct(remaining: number, original: number): number {
  if (original <= 0) return 0;
  return Math.min(Math.max(remaining / original, 0), 1);
}

// Same existing "Membership ID" concept/format already used on the
// present-at-counter screen (fmtMembershipId there) — reused here so the
// same subscription always shows the same Card ID everywhere.
function fmtCardId(id: number): string {
  return `#${String(id).padStart(6, '0')}`;
}

// Deterministic pastel fallback for the vendor avatar circle when the store
// has no logo image — same hash-into-a-fixed-palette approach already used
// for store/category fallback art on the Home screen.
const AVATAR_PALETTE = ['#818CF8', '#34D399', '#FB923C', '#C084FC', '#38BDF8', '#FACC15', '#FB7185'];
function avatarColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

// redemption-service returns createdAt as a naive local (IST) timestamp —
// unlike subscription-service's UTC expiresAt above — so these are parsed
// as-is, never with a 'Z' appended (that would shift them by the IST offset).
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
  if (ds === today) return `Today · ${timeStr}`;
  if (ds === yest)  return `Yesterday · ${timeStr}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` · ${timeStr}`;
}

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function isRecent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

// Ties the "no longer redeemable" note to what actually happened to any
// unused balance, so it never reads as if the credit just disappeared.
function inactiveMessage(status: SubscriptionStatus, balance: number, expiresAt: string): string {
  if (status === 'EXPIRED') {
    return balance > 0
      ? `${fmt(balance)} unused credit expired on ${fmtDate(expiresAt)}. Redemption is no longer available.`
      : `This membership expired on ${fmtDate(expiresAt)}. Redemption is no longer available.`;
  }
  if (status === 'CANCELLED') {
    return balance > 0
      ? `${fmt(balance)} remaining credit was cancelled. Redemption is no longer available.`
      : 'This membership has been cancelled. Redemption is no longer available.';
  }
  return 'This membership is exhausted. Redemption is no longer available.';
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

function TopBar({ onBack, onSettings }: { onBack: () => void; onSettings?: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <View style={styles.topBarTitleWrap}>
        <Text style={styles.topBarTitle} numberOfLines={1}>Membership</Text>
        <Text style={styles.topBarSubtitle} numberOfLines={1}>All your Strike cards in one place</Text>
      </View>
      <Pressable
        style={styles.settingsBtn}
        onPress={onSettings ?? (() => {})}
        hitSlop={12}
        disabled={!onSettings}
      >
        <Settings size={19} color={C.secondary} strokeWidth={1.9} />
      </Pressable>
    </View>
  );
}

// ── Membership hero ────────────────────────────────────────────────────────────

interface HeroProps {
  cardId: number;
  cardName: string;
  storeName: string | undefined;
  storeAddress: string | undefined;
  storeLogoUrl: string | null | undefined;
  walletBalance: number;
  originalBalance: number | undefined;
  consumedAmount: number | null | undefined;
  consumptionPercentage: number | null | undefined;
  status: SubscriptionStatus;
  expiresAt: string;
}

function VendorAvatar({ name, logoUrl }: { name: string; logoUrl: string | null | undefined }) {
  const source = useMediaSource(logoUrl);
  if (source) {
    return (
      <Image source={source} style={styles.heroAvatarImg} contentFit="cover" transition={150} />
    );
  }
  const fg = avatarColor(name);
  return (
    <View style={[styles.heroAvatarImg, styles.heroAvatarFallback]}>
      <Text style={[styles.heroAvatarInitial, { color: fg }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function MembershipHero({
  cardId, cardName, storeName, storeAddress, storeLogoUrl, walletBalance, originalBalance,
  consumedAmount, consumptionPercentage, status, expiresAt,
}: HeroProps) {
  // Same canonical per-card color as Card Details, My Cards and Vendor
  // Available Cards (see @/utils/cardColorTheme), so the same card always
  // renders the same color everywhere.
  const theme  = getCardColorTheme(cardName);
  const days   = daysLeft(expiresAt);
  const ratio  = originalBalance != null ? pct(walletBalance, originalBalance) : null;
  // consumptionPercentage/consumedAmount are the same backend-authoritative
  // fields the Wallet Consumption grid below uses, so the "% used" and
  // "used" figures shown here never disagree with that section — the
  // (originalBalance - walletBalance) derivation is only a fallback for the
  // rare historical subscription where the backend fields are null.
  const usedPct = consumptionPercentage != null
    ? Math.round(consumptionPercentage)
    : ratio != null ? Math.round((1 - ratio) * 100) : null;
  const usedAmount = consumedAmount != null
    ? consumedAmount
    : originalBalance != null ? Math.max(originalBalance - walletBalance, 0) : null;
  const { label, color, bg: statusBg } = STATUS_CFG[status];

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
    ? theme.glow
    : status === 'EXHAUSTED'
    ? C.warning
    : C.muted;

  return (
    <LinearGradient
      colors={theme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      {/* Subtle warm shine — same treatment on every card representation */}
      <LinearGradient
        colors={CARD_SHINE}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.7 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Vendor identity + status */}
      <View style={styles.heroHead}>
        <View style={styles.heroVendorRow}>
          {storeName ? <VendorAvatar name={storeName} logoUrl={storeLogoUrl} /> : null}
          <View style={styles.heroVendorInfo}>
            {storeName ? (
              <Text style={[styles.heroStore, { color: theme.textPrimary }]} numberOfLines={1}>{storeName}</Text>
            ) : null}
            {storeAddress ? (
              <View style={styles.heroLocationRow}>
                <MapPin size={10} color={theme.textMuted} strokeWidth={2} />
                <Text style={[styles.heroLocation, { color: theme.textMuted }]} numberOfLines={1}>{storeAddress}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusBg }]}>
          <View style={[styles.statusDot, { backgroundColor: color }]} />
          <Text style={[styles.statusPillText, { color }]}>{label}</Text>
        </View>
      </View>

      {/* Membership name */}
      <View style={styles.heroNameBlock}>
        <Text style={[styles.heroCard, { color: theme.textPrimary }]} numberOfLines={1}>{cardName}</Text>
        <Text style={[styles.heroCardCaption, { color: theme.textMuted }]}>Membership Name</Text>
      </View>

      {/* Balance + usage — pulses gently when balance changes after a redemption */}
      <View style={styles.heroBalanceWrap}>
        <View style={styles.heroBalanceRow}>
          <Animated.Text
            style={[styles.heroBalance, { color: theme.textPrimary, transform: [{ scale: pulseScale }] }]}
          >
            {fmt(walletBalance)}
          </Animated.Text>
          {originalBalance != null && (
            <Text style={[styles.heroOriginal, { color: theme.textMuted }]}>of {fmt(originalBalance)}</Text>
          )}
        </View>
        {usedPct != null && (
          <View style={styles.heroUsageCol}>
            <Text style={[styles.heroUsagePct, { color: theme.textPrimary }]}>{usedPct}% used</Text>
            {usedAmount != null && (
              <Text style={[styles.heroUsageAmt, { color: theme.textMuted }]}>{fmt(usedAmount)} used</Text>
            )}
          </View>
        )}
      </View>

      {/* Progress bar */}
      {ratio != null && (
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: theme.trackBg }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${ratio * 100}%`, backgroundColor: progressColor },
              ]}
            />
          </View>
        </View>
      )}

      <View style={[styles.heroDivider, { backgroundColor: theme.trackBg }]} />

      {/* Bottom: expiry + card ID */}
      <View style={styles.heroBottom}>
        <View style={styles.heroBottomBlock}>
          <View style={[styles.heroBottomIconWrap, { backgroundColor: theme.chipBg }]}>
            <Clock size={14} color={theme.textSecondary} strokeWidth={2} />
          </View>
          <View style={styles.heroBottomTextCol}>
            <Text style={[styles.heroExpLabel, { color: theme.textMuted }]}>
              {status === 'EXPIRED' ? 'Expired on' : 'Expires on'}
            </Text>
            <Text style={[styles.heroExpDate, { color: theme.textPrimary }]} numberOfLines={1}>
              {fmtDate(expiresAt)}
              {status === 'ACTIVE' && days <= 7 && days > 0
                ? ` · ${days}d`
                : status === 'ACTIVE' && days === 0
                ? ' · Today'
                : ''}
            </Text>
          </View>
        </View>

        <View style={[styles.heroBottomDivider, { backgroundColor: theme.trackBg }]} />

        <View style={styles.heroBottomBlock}>
          <View style={[styles.heroBottomIconWrap, { backgroundColor: theme.chipBg }]}>
            <QrCode size={14} color={theme.textSecondary} strokeWidth={2} />
          </View>
          <View style={styles.heroBottomTextCol}>
            <Text style={[styles.heroExpLabel, { color: theme.textMuted }]}>Card ID</Text>
            <Text style={[styles.heroExpDate, { color: theme.textPrimary }]} numberOfLines={1}>{fmtCardId(cardId)}</Text>
          </View>
        </View>
      </View>

      {/* Decorative circles */}
      <View style={[styles.decCircle1, { backgroundColor: theme.decor1 }]} pointerEvents="none" />
      <View style={[styles.decCircle2, { backgroundColor: theme.decor2 }]} pointerEvents="none" />
    </LinearGradient>
  );
}

// ── Info section ───────────────────────────────────────────────────────────────

// ── Detail tile (icon-led grid cell) ───────────────────────────────────────────
// Replaces the old stacked "label · value" list rows — several of those in a
// row (Validity, then Membership Details) read as one long repeating list.
// A grid of icon-topped tiles gives each fact its own visual anchor instead.

function DetailTile({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailTile}>
      <View style={[styles.detailTileIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={styles.detailTileLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.detailTileValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Wallet balance row (icon + label + value) ──────────────────────────────────

function WalletBalanceRow({
  icon,
  iconBg,
  label,
  value,
  valueColor,
  isLast,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.walletBalanceRow, !isLast && styles.infoRowBorder]}>
      <View style={[styles.walletBalanceIconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={styles.walletBalanceLabel}>{label}</Text>
      <Text style={[styles.walletBalanceValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
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
        <EmptyState
          icon={<Tag size={20} color={C.muted} strokeWidth={1.5} />}
          title="No eligible items configured for this membership"
        />
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
            {fmtBalance(redemption.remainingBalance) ? (
              <>
                <View style={styles.redemptionWidgetAmountDivider} />
                <View style={styles.redemptionWidgetAmountCol}>
                  <Text style={styles.redemptionAmountLabel}>Balance After</Text>
                  <Text style={[styles.redemptionAmountValue, styles.redemptionAmountBalance]}>
                    {fmtBalance(redemption.remainingBalance)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Redemption history timeline ────────────────────────────────────────────────

// Collapsed by default to a short, glanceable list — tap a row for the full
// breakdown (via the shared RedemptionDetailSheet) instead of every row
// showing its own item list + time + amount + balance stacked up, which is
// what made this section so tall to scroll through.
const HISTORY_COLLAPSED_COUNT = 4;

function RedemptionHistorySection({
  redemptions,
  cardName,
  storeName,
}: {
  redemptions: Redemption[];
  cardName: string;
  storeName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Redemption | null>(null);

  if (redemptions.length === 0) {
    return (
      <Section title="Redemption History">
        <EmptyState
          icon={<Clock size={20} color={C.muted} strokeWidth={1.5} />}
          title="No redemptions yet"
          subtitle='Tap "Redeem Benefits" to start'
        />
      </Section>
    );
  }

  const sorted = [...redemptions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const visible = expanded ? sorted : sorted.slice(0, HISTORY_COLLAPSED_COUNT);
  const hiddenCount = sorted.length - visible.length;
  const groups = groupRedemptionsByDate(visible);

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
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [
                    styles.historyRow,
                    !isLast && styles.infoRowBorder,
                    pressed && styles.historyRowPressed,
                  ]}
                  onPress={() => { tapLight(); setSelected(r); }}
                >
                  <View style={styles.historyRowLeft}>
                    <Text style={styles.historyRowItems} numberOfLines={1}>{names}</Text>
                    <Text style={styles.historyRowTime}>{fmtTime(r.createdAt)}</Text>
                  </View>
                  <Text style={styles.historyRowAmount}>−{fmt(r.totalAmount)}</Text>
                  <ChevronRight size={16} color={C.muted} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        ))}

        {hiddenCount > 0 || expanded ? (
          <Pressable
            style={({ pressed }) => [styles.historyToggle, pressed && styles.historyRowPressed]}
            onPress={() => setExpanded((v) => !v)}
          >
            <Text style={styles.historyToggleText}>
              {expanded ? 'Show less' : `Show ${hiddenCount} more`}
            </Text>
            {expanded
              ? <ChevronUp size={14} color={C.accent} strokeWidth={2.4} />
              : <ChevronDown size={14} color={C.accent} strokeWidth={2.4} />
            }
          </Pressable>
        ) : null}
      </View>

      <RedemptionDetailSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        redemption={selected}
        cardName={cardName}
        storeName={storeName}
      />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <SkeletonBone style={{ width: 40, height: 40, borderRadius: 20, opacity: 0.25 }} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBone style={{ width: 120, height: 13, opacity: 0.28 }} />
              <SkeletonBone style={{ width: 90, height: 10, opacity: 0.2 }} />
            </View>
          </View>
          <SkeletonBone style={{ width: 100, height: 11, opacity: 0.2, marginBottom: 5 }} />
          <SkeletonBone style={{ width: 140, height: 30, opacity: 0.3, marginBottom: 14 }} />
          <SkeletonBone style={{ width: '100%', height: 5, borderRadius: 3, opacity: 0.2, marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <SkeletonBone style={{ width: 100, height: 12, opacity: 0.25 }} />
            <SkeletonBone style={{ width: 90, height: 12, opacity: 0.25 }} />
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

        {/* Details grid skeleton */}
        <View style={styles.section}>
          <SkeletonBone style={{ width: 60, height: 12, marginBottom: 12 }} />
          <View style={styles.detailsGrid}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.detailTile}>
                <View style={[styles.skBone, { width: 34, height: 34, borderRadius: 10, marginBottom: 10 }]} />
                <SkeletonBone style={{ width: '60%', height: 9, marginBottom: 6 }} />
                <SkeletonBone style={{ width: '80%', height: 12 }} />
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

function ErrorState({ notFound, message, onBack, onRetry, onGoToCards }: {
  notFound: boolean;
  message: string;
  onBack: () => void;
  onRetry: () => void;
  onGoToCards: () => void;
}) {
  // A 404 means the membership genuinely doesn't exist server-side (removed,
  // or the list this was opened from was stale) — retrying the same request
  // will 404 again, so route the user somewhere useful instead.
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={onBack} />
      <View style={styles.errorCenter}>
        {notFound
          ? <SearchX size={40} color={C.muted} strokeWidth={1.5} />
          : <AlertCircle size={40} color={C.muted} strokeWidth={1.5} />
        }
        <Text style={styles.errorTitle}>
          {notFound ? 'Membership not found' : "Couldn't load membership"}
        </Text>
        <Text style={styles.errorSub}>
          {notFound
            ? "This membership couldn't be found. It may have already expired or been removed."
            : message
          }
        </Text>
        <Pressable
          style={styles.retryBtn}
          onPress={notFound ? onGoToCards : onRetry}
        >
          <Text style={styles.retryBtnText}>
            {notFound ? 'Back to My Cards' : 'Try again'}
          </Text>
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
  const [gridSelectedRedemption, setGridSelectedRedemption] = useState<Redemption | null>(null);
  const [gridCellChoices, setGridCellChoices] = useState<Redemption[] | null>(null);
  const [walletExpanded, setWalletExpanded] = useState(false);

  // A tapped box maps to 1+ redemptions (see WalletConsumptionGrid's
  // mapRedemptionsToCells) — a single one opens its detail directly; a box
  // split between two or more opens a short chooser first.
  const handleGridCellPress = useCallback((redemptions: Redemption[]) => {
    if (redemptions.length === 1) {
      setGridSelectedRedemption(redemptions[0]);
    } else {
      setGridCellChoices(redemptions);
    }
  }, []);

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

  const is404 = axios.isAxiosError(subErr) && subErr.response?.status === 404;

  // The membership was opened from a list (My Cards / History) that's now
  // stale — drop the cached lists so this entry doesn't 404 again next visit.
  useEffect(() => {
    if (!is404) return;
    void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
  }, [is404, queryClient]);

  const handleGoToCards = useCallback(() => {
    router.replace(ROUTES.TABS.CARDS as never);
  }, [router]);

  if (subLoading) return <DetailSkeleton onBack={handleBack} />;

  if (isError || !sub) {
    return (
      <ErrorState
        notFound={is404}
        message={(subErr as Error)?.message ?? 'Membership not found.'}
        onBack={handleBack}
        onRetry={() => void refetchSub()}
        onGoToCards={handleGoToCards}
      />
    );
  }

  // originalWalletAmount is the purchase-time snapshot — the correct source for
  // this specific subscription's entitlement. CardDefinition.walletAmount is only
  // a fallback for subscriptions purchased before that snapshot column existed
  // (it's a live, mutable template value and can drift from what was actually
  // granted at purchase time).
  const originalBalance = sub.originalWalletAmount ?? cardDef?.walletAmount;
  const days = daysLeft(sub.expiresAt);
  const effectiveStatus = getEffectiveStatus(sub);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar
        onBack={handleBack}
        onSettings={() => router.push(ROUTES.SETTINGS.NOTIFICATIONS as never)}
      />

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
          cardId={sub.id}
          cardName={sub.cardName}
          storeName={store?.name}
          storeAddress={store?.address}
          storeLogoUrl={store?.logoUrl}
          walletBalance={sub.walletBalance}
          originalBalance={originalBalance}
          consumedAmount={sub.consumedAmount}
          consumptionPercentage={sub.consumptionPercentage}
          status={effectiveStatus}
          expiresAt={sub.expiresAt}
        />

        {/* ── Wallet balance — collapsed summary, tap to reveal the
             Original/Remaining breakdown ──────────────────────────── */}
        <Section title="Wallet Balance">
          <Pressable
            style={[styles.walletSummaryRow, walletExpanded && styles.infoRowBorder]}
            onPress={() => { tapSelect(); setWalletExpanded((v) => !v); }}
          >
            <View style={[styles.walletBalanceIconWrap, { backgroundColor: C.accentSoft }]}>
              <Wallet size={16} color={C.accent} strokeWidth={2} />
            </View>
            <View style={styles.walletSummaryTextCol}>
              <Text style={styles.walletSummaryLabel}>Wallet Balance</Text>
              <Text style={styles.walletSummarySub}>{fmt(sub.walletBalance)} remaining</Text>
            </View>
            {walletExpanded ? (
              <ChevronUp size={18} color={C.muted} strokeWidth={2} />
            ) : (
              <ChevronDown size={18} color={C.muted} strokeWidth={2} />
            )}
          </Pressable>
          {walletExpanded && (
            <>
              {originalBalance != null && (
                <WalletBalanceRow
                  icon={<Wallet size={15} color={C.successDark} strokeWidth={2} />}
                  iconBg={C.successSoft}
                  label="Original Balance"
                  value={fmt(originalBalance)}
                />
              )}
              <WalletBalanceRow
                icon={<Wallet size={15} color={C.accent} strokeWidth={2} />}
                iconBg={C.accentSoft}
                label="Remaining Balance"
                value={fmt(sub.walletBalance)}
                valueColor={C.accent}
                isLast
              />
            </>
          )}
        </Section>

        {/* ── Wallet consumption grid — hidden for historical subscriptions
             predating the originalWalletAmount snapshot (component no-ops).
             Tapping a filled box opens the redemption that consumed it. ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wallet Consumption</Text>
          <WalletConsumptionGrid
            originalWalletAmount={sub.originalWalletAmount}
            walletBalance={sub.walletBalance}
            consumedAmount={sub.consumedAmount}
            consumptionPercentage={sub.consumptionPercentage}
            totalCells={getSubscriptionValidityDays(sub)}
            redemptions={redemptions}
            onCellPress={handleGridCellPress}
            showStatIcons
          />
        </View>

        <CellRedemptionChooser
          visible={!!gridCellChoices}
          onClose={() => setGridCellChoices(null)}
          redemptions={gridCellChoices ?? []}
          onSelect={(r) => {
            setGridCellChoices(null);
            setGridSelectedRedemption(r);
          }}
        />

        <RedemptionDetailSheet
          visible={!!gridSelectedRedemption}
          onClose={() => setGridSelectedRedemption(null)}
          redemption={gridSelectedRedemption}
          cardName={sub.cardName}
          storeName={store?.name ?? ''}
        />

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
                const { Icon, color } = STATUS_CFG[effectiveStatus];
                return (
                  <>
                    <Icon size={18} color={color} strokeWidth={2} />
                    <Text style={[styles.inactiveNoteText, { color }]}>
                      {inactiveMessage(effectiveStatus, sub.walletBalance, sub.expiresAt)}
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
          cardName={sub.cardName}
          storeName={store?.name ?? ''}
        />

        {/* ── Details — validity + membership facts as an icon-tile grid ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailsGrid}>
            <DetailTile
              icon={<Calendar size={16} color={C.accent} strokeWidth={2} />}
              iconBg={C.accentSoft}
              label={effectiveStatus === 'EXPIRED' ? 'Expired On' : 'Valid Until'}
              value={fmtDate(sub.expiresAt)}
            />
            {effectiveStatus === 'ACTIVE' && (
              <DetailTile
                icon={<Timer size={16} color={C.successDark} strokeWidth={2} />}
                iconBg={C.successSoft}
                label="Days Remaining"
                value={days === 0 ? 'Expires today' : `${days} days`}
              />
            )}
            <DetailTile
              icon={<Receipt size={16} color={C.plum} strokeWidth={2} />}
              iconBg={C.plumSoft}
              label="Purchased"
              value={fmtDate(sub.purchasedAt)}
            />
            <DetailTile
              icon={<Store size={16} color={C.info} strokeWidth={2} />}
              iconBg={C.infoSoft}
              label="Store"
              value={store?.name ?? `Store #${sub.storeId}`}
            />
            {paymentMethodLabel(sub.paymentMethod) && (
              <DetailTile
                icon={<CreditCard size={16} color={C.teal} strokeWidth={2} />}
                iconBg={C.tealSoft}
                label="Payment Method"
                value={paymentMethodLabel(sub.paymentMethod)!}
              />
            )}
          </View>
        </View>

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
              onPress={() => {
                tapLight();
                router.push({
                  pathname: '/subscriptions/pending',
                  params: {
                    redemptionId: String(pendingRedemption.id),
                    subId: String(sub.id),
                  },
                } as never);
              }}
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
              onPress={() => {
                tapMedium();
                router.push({
                  pathname: '/subscriptions/select',
                  params: { subId: String(sub.id) },
                } as never);
              }}
            >
              <Ticket size={17} color="#FFF" strokeWidth={2.2} />
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    minHeight: 60,
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
  topBarTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  topBarTitle: {
    fontSize: 19, fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary, letterSpacing: -0.4,
  },
  topBarSubtitle: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.regular,
    color: C.muted,
    marginTop: 1,
  },
  settingsBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center', alignItems: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Membership hero ────────────────────────────────────────────────────────
  hero: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: CARD_RADIUS,
    padding: 16,
    minHeight: CARD_HEIGHT,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroVendorRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 10,
  },
  heroAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  heroAvatarFallback: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
  },
  heroVendorInfo: { flex: 1, gap: 2 },
  heroStore: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  heroLocation: {
    fontSize: 11,
    fontFamily: ManropeWeights.medium,
    flexShrink: 1,
  },

  heroNameBlock: { marginTop: 14 },
  heroCard: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.4,
  },
  heroCardCaption: {
    fontSize: 11,
    fontFamily: ManropeWeights.regular,
    marginTop: 1,
  },

  heroBalanceWrap: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroBalanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  heroBalance: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -1,
  },
  heroOriginal: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  heroUsageCol: { alignItems: 'flex-end' },
  heroUsagePct: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.1,
  },
  heroUsageAmt: {
    fontSize: 11,
    fontFamily: ManropeWeights.medium,
    marginTop: 1,
  },

  // Progress bar
  progressWrap: { marginTop: 10 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  heroDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
  },

  // Hero bottom
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  heroBottomBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  heroBottomIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  heroBottomTextCol: { flex: 1 },
  heroBottomDivider: {
    width: StyleSheet.hairlineWidth,
    height: 30,
    marginHorizontal: 12,
  },
  heroExpLabel: {
    fontSize: 9,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 1,
    textTransform: 'uppercase',
  },
  heroExpDate: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 9.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // Decorative circles — color set inline from the card's own theme.
  decCircle1: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    top: -28, right: -28,
  },
  decCircle2: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32,
    bottom: -12, right: 46,
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
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
  // ── Details grid (icon-topped tiles) ──────────────────────────────────────
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailTile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  detailTileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailTileLabel: {
    fontSize: 10.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  detailTileValue: {
    fontSize: 14.5,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.1,
  },

  // ── Wallet balance row (icon + label + value) ─────────────────────────────
  walletBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  walletBalanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  walletBalanceLabel: {
    flex: 1,
    fontSize: 14,
    color: C.primary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  walletBalanceValue: {
    fontSize: 15,
    color: C.primary,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  walletSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  walletSummaryTextCol: { flex: 1, gap: 2 },
  walletSummaryLabel: {
    fontSize: 14.5,
    color: C.primary,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
  },
  walletSummarySub: {
    fontSize: 12.5,
    color: C.muted,
    fontFamily: ManropeWeights.medium,
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
    fontFamily: ManropeWeights.semiBold,
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
    fontFamily: ManropeWeights.medium,
  },
  menuItemPrice: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
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
    fontFamily: ManropeWeights.medium,
  },

  // ── Error state ────────────────────────────────────────────────────────────
  errorCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 40,
  },
  errorTitle: {
    fontSize: 17, fontWeight: '700', fontFamily: ManropeWeights.bold, color: C.primary, marginTop: 8,
  },
  errorSub: {
    fontSize: 14, color: C.secondary, textAlign: 'center', lineHeight: 21, fontFamily: ManropeWeights.regular,
  },
  retryBtn: {
    marginTop: 10, backgroundColor: C.accent,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22,
  },
  retryBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700', fontFamily: ManropeWeights.bold },

  // ── Hero skeleton ──────────────────────────────────────────────────────────
  heroSkeleton: {
    margin: 16,
    borderRadius: 20,
    backgroundColor: '#1A1A2A',
    padding: 18,
    minHeight: 230,
    justifyContent: 'center',
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
    fontFamily: ManropeWeights.bold,
    color: C.secondary,
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  redemptionWidgetStatusSuccess: {
    color: C.successDark,
  },
  redemptionWidgetTime: {
    fontSize: 11, color: C.muted, fontWeight: '500', fontFamily: ManropeWeights.medium,
  },
  redemptionWidgetBody: {
    padding: 16, gap: 12,
  },
  redemptionWidgetItems: {
    fontSize: 15, fontWeight: '600', fontFamily: ManropeWeights.semiBold, color: C.primary, lineHeight: 22,
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
    fontSize: 11, color: C.muted, fontWeight: '500', fontFamily: ManropeWeights.medium, letterSpacing: 0.2,
  },
  redemptionAmountValue: {
    fontSize: 16, fontWeight: '700', fontFamily: ManropeWeights.bold, color: C.primary, letterSpacing: -0.3,
  },
  redemptionAmountBalance: {
    color: C.accent,
  },

  // ── Redemption history timeline ────────────────────────────────────────────
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
    fontFamily: ManropeWeights.bold,
    color: C.muted, letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
  },
  historyRowPressed: {
    backgroundColor: C.bg,
  },
  historyRowLeft: {
    flex: 1, gap: 2,
  },
  historyRowItems: {
    fontSize: 14, fontWeight: '500', fontFamily: ManropeWeights.medium, color: C.primary,
  },
  historyRowTime: {
    fontSize: 11.5, color: C.muted, fontWeight: '400', fontFamily: ManropeWeights.regular,
  },
  historyRowAmount: {
    fontSize: 14, fontWeight: '700', fontFamily: ManropeWeights.bold, color: C.primary,
    flexShrink: 0,
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  historyToggleText: {
    fontSize: 13, fontFamily: ManropeWeights.semiBold, color: C.accent,
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
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
});
