import { ActivationSheet } from '@/components/cards/ActivationSheet';
import { CardDetailHeroSkeleton } from '@/components/cards/CardSkeleton';
import { CC, formatCardPrice } from '@/components/cards/theme';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { useCardDetail } from '@/hooks/useCards';
import { useStoreDetail, useStoreMenu } from '@/hooks/useStores';
import { useMyActiveSubscriptions } from '@/hooks/useSubscriptions';
import { notify } from '@/services/notificationService';
import { CARD_HEIGHT, CARD_RADIUS, CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import { tapLight, tapMedium } from '@/utils/haptics';
import type { CardDefinition } from '@/types/card';
import type { MenuCategory, MenuItem } from '@/types/store';
import type { Subscription } from '@/types/subscription';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Gift,
  Info,
  Lock,
  ShieldCheck,
  Sparkles,
  Tag,
  Wallet,
} from 'lucide-react-native';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// Local color math for the hero footer band — a light/dark tint derived
// from the card's own gradient hue, not a generic overlay. Deliberately not
// added to the shared cardColorTheme.ts (that palette also drives My Cards /
// Membership / Vendor Available Cards); mirrors the same helper used in
// CardListItem.tsx for the Available Cards widget.
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function blendRgb(hex: string, target: number, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const mix = (v: number) => Math.round(v + (target - v) * factor);
  return [mix(r), mix(g), mix(b)];
}
function towardWhite(hex: string, factor: number, alpha = 1): string {
  const [r, g, b] = blendRgb(hex, 255, factor);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function towardBlack(hex: string, factor: number, alpha = 1): string {
  const [r, g, b] = blendRgb(hex, 0, factor);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = CC;

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Card Details</Text>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

// ── Premium hero card ─────────────────────────────────────────────────────────

function CardHero({ card }: { card: CardDefinition }) {
  const theme = getCardColorTheme(card.name);
  const hasBonus = card.bonusAmount > 0;

  const baseHue = theme.gradient[0];
  const footerBg = towardWhite(baseHue, 0.86);
  const footerFg = towardBlack(baseHue, 0.4);

  return (
    <View style={styles.heroOuter}>
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

        {/* Top row: brand + name + icon mark */}
        <View style={styles.heroTopRow}>
          <View style={styles.heroTopText}>
            <Text style={[styles.heroBrand, { color: theme.textSecondary }]}>Strike</Text>
            <Text style={[styles.heroName, { color: theme.textPrimary }]} numberOfLines={2}>
              {card.name}
            </Text>
            <Text style={[styles.heroValueProp, { color: theme.textPrimary }]} numberOfLines={1}>
              Get {formatCardPrice(card.walletAmount)} to spend
            </Text>
          </View>
          <View style={[styles.heroChip, { backgroundColor: theme.chipBg }]}>
            <Sparkles size={20} color={theme.textPrimary} strokeWidth={2} />
          </View>
        </View>

        <View style={[styles.heroDivider, { backgroundColor: theme.chipBg }]} />

        {/* Valid for / You Pay — balanced two-column layout, "You Pay"
            landing at the divider rather than pinned to the far edge. Both
            labels start at the same top position; the calendar icon sits
            beside its VALUE ("30 days"), not beside the "Valid for" label,
            so both columns read label-then-value in the same rhythm. */}
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatBlock}>
            <Text style={[styles.heroStatLabel, { color: theme.textSecondary }]}>Valid for</Text>
            <View style={styles.heroStatValueRow}>
              <CalendarDays size={13} color={theme.textPrimary} strokeWidth={2.2} />
              <Text style={[styles.heroStatValue, { color: theme.textPrimary }]}>
                {card.validityInDays} days
              </Text>
            </View>
          </View>
          <View style={[styles.heroStatDivider, { backgroundColor: theme.chipBg }]} />
          <View style={styles.heroStatBlockRight}>
            <Text style={[styles.heroStatLabel, { color: theme.textSecondary }]}>You Pay</Text>
            <Text style={[styles.heroPayValue, { color: theme.textPrimary }]}>
              {formatCardPrice(card.cardPrice)}
            </Text>
          </View>
        </View>

        {/* Decorative depth circles */}
        <View style={[styles.heroCircle1, { backgroundColor: theme.decor1 }]} />
        <View style={[styles.heroCircle2, { backgroundColor: theme.decor2 }]} />
      </LinearGradient>

      {/* Footer — the real bonus (server-computed max(wallet - price, 0)),
          reframed as the saving it represents. A light tint derived from
          the card's own hue, with correspondingly dark same-hue text —
          never white text on a light footer. Informational only — no
          arrow/chevron, since this footer has no navigation behavior. */}
      {hasBonus ? (
        <View style={[styles.heroFooter, { backgroundColor: footerBg }]}>
          <Tag size={13} color={footerFg} strokeWidth={2.2} />
          <Text style={[styles.heroFooterText, { color: footerFg }]}>
            Save {formatCardPrice(card.bonusAmount)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

// ── Benefit row ───────────────────────────────────────────────────────────────

interface BenefitRowProps {
  icon: React.ReactNode;
  label: string;
  // Small supporting line under the label — real, factual context (e.g.
  // "Use across eligible items"), never a promotional claim.
  caption?: string;
  value: string;
  highlight?: boolean;
  isLast?: boolean;
  // Renders `value` as a compact pill badge instead of plain right-aligned
  // text — for the one number in a row (e.g. validity) that reads as a
  // status/badge rather than a plain figure.
  valuePill?: boolean;
}

function BenefitRow({ icon, label, caption, value, highlight, isLast, valuePill }: BenefitRowProps) {
  return (
    <View style={[styles.benefitRow, !isLast && styles.benefitRowBorder]}>
      <View style={[styles.benefitIcon, highlight && styles.benefitIconHighlight]}>
        {icon}
      </View>
      <View style={styles.benefitTextWrap}>
        <Text style={styles.benefitLabel}>{label}</Text>
        {caption ? <Text style={styles.benefitCaption}>{caption}</Text> : null}
      </View>
      {valuePill ? (
        <View style={styles.benefitValuePill}>
          <Text style={styles.benefitValuePillText}>{value}</Text>
        </View>
      ) : (
        <Text style={[styles.benefitValue, highlight && styles.benefitValueHighlight]}>
          {value}
        </Text>
      )}
    </View>
  );
}

// ── Benefits section ──────────────────────────────────────────────────────────

function BenefitsSection({ card }: { card: CardDefinition }) {
  const hasBonus = card.bonusAmount > 0;

  return (
    <Section title="What you're getting">
      <BenefitRow
        icon={<Wallet size={16} color={C.accent} strokeWidth={2} />}
        label={`${formatCardPrice(card.walletAmount)} to spend`}
        caption="Use across all items"
        value={formatCardPrice(card.walletAmount)}
        isLast={!hasBonus}
      />
      {hasBonus ? (
        <BenefitRow
          icon={<Gift size={16} color="#C9973A" strokeWidth={2} />}
          label="Bonus value"
          caption="Extra value added"
          value={`+${formatCardPrice(card.bonusAmount)}`}
          highlight
          isLast
        />
      ) : null}
    </Section>
  );
}

// ── Validity section ──────────────────────────────────────────────────────────
// Value shown as a compact pill (matching the reference), not a plain
// right-aligned number — a badge for the one number in this row that
// deserves emphasis.

function ValiditySection({ card }: { card: CardDefinition }) {
  return (
    <Section title="Validity">
      <BenefitRow
        icon={<CalendarDays size={16} color={C.accent} strokeWidth={2} />}
        label="Valid for"
        caption={`${card.validityInDays} days from activation`}
        value={`${card.validityInDays} days`}
        valuePill
        isLast
      />
      <View style={styles.validityFooter}>
        <ShieldCheck size={14} color={C.muted} strokeWidth={1.8} />
        <Text style={styles.validityFooterText}>
          Activate your card to start using benefits
        </Text>
      </View>
    </Section>
  );
}

// ── Eligible categories section ───────────────────────────────────────────────

function EligibleCategoriesSection({
  card,
  menuCategories,
}: {
  card: CardDefinition;
  menuCategories: MenuCategory[];
}) {
  const categoryIds = card.categoryIds ?? [];
  const covered = menuCategories.filter((cat) => categoryIds.includes(cat.id));
  if (covered.length === 0) return null;

  return (
    <Section title="Eligible Categories">
      <View style={styles.catGrid}>
        {covered.map((cat) => (
          <View key={cat.id} style={styles.catChip}>
            <Tag size={11} color={C.accent} strokeWidth={2.2} />
            <Text style={styles.catChipText}>{cat.name}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

// ── Eligible items section ────────────────────────────────────────────────────

function EligibleItemRow({ item, isLast }: { item: MenuItem; isLast: boolean }) {
  const isVeg = item.itemType === 'VEG';
  return (
    <View style={[styles.eligItemRow, !isLast && styles.benefitRowBorder]}>
      <View
        style={[
          styles.eligDot,
          { backgroundColor: isVeg ? '#34C759' : '#FF3B30' },
        ]}
      />
      <Text style={styles.eligItemName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.eligItemPrice}>{formatCardPrice(item.price)}</Text>
    </View>
  );
}

function EligibleItemsSection({
  card,
  menuCategories,
}: {
  card: CardDefinition;
  menuCategories: MenuCategory[];
}) {
  const eligibleIds  = card.eligibleMenuItemIds ?? [];
  const categoryIds  = card.categoryIds ?? [];
  const hasItemIds   = eligibleIds.length > 0;
  const hasCategories = categoryIds.length > 0;

  // Nothing to show if neither field is populated
  if (!hasItemIds && !hasCategories) return null;

  // Backward-compat: card only has categoryIds, no specific items configured yet
  if (!hasItemIds) {
    return (
      <Section title="Eligible Items">
        <View style={styles.legacyNote}>
          <Info size={15} color={C.muted} strokeWidth={1.8} />
          <Text style={styles.legacyNoteText}>
            Items covered will be determined by the selected categories.
          </Text>
        </View>
      </Section>
    );
  }

  // Resolve item names from already-cached store menu — zero extra network calls
  const allItems = menuCategories.flatMap((cat) => cat.items);
  const eligibleItems = allItems.filter((item) => eligibleIds.includes(item.id));

  if (eligibleItems.length === 0) {
    return (
      <Section title="Eligible Items">
        <View style={styles.legacyNote}>
          <Info size={15} color={C.muted} strokeWidth={1.8} />
          <Text style={styles.legacyNoteText}>
            Items covered will be determined by the selected categories.
          </Text>
        </View>
      </Section>
    );
  }

  return (
    <Section title={`Eligible Items (${eligibleItems.length})`}>
      {eligibleItems.map((item, idx) => (
        <EligibleItemRow
          key={item.id}
          item={item}
          isLast={idx === eligibleItems.length - 1}
        />
      ))}
    </Section>
  );
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection({ description }: { description: string }) {
  return (
    <Section title="About this card">
      <Text style={styles.aboutText}>{description}</Text>
    </Section>
  );
}

// ── Store section ─────────────────────────────────────────────────────────────

function StoreSection({ storeName }: { storeName: string | undefined }) {
  if (!storeName) return null;
  return (
    <Section title="Available at">
      <View style={styles.storeRow}>
        <View style={styles.storeIconWrap}>
          <Building2 size={18} color={C.accent} strokeWidth={2} />
        </View>
        <Text style={styles.storeName}>{storeName}</Text>
      </View>
    </Section>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <CardDetailHeroSkeleton />
        {/* Benefit skeleton rows */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <View style={[styles.skBone, { width: 100, height: 16, margin: 16, marginBottom: 4 }]} />
            {[1, 2].map((i) => (
              <View key={i} style={[styles.benefitRow, i < 2 && styles.benefitRowBorder]}>
                <View style={[styles.skBone, { width: 32, height: 32, borderRadius: 10 }]} />
                <View style={[styles.skBone, { flex: 1, marginLeft: 12 }]} />
                <View style={[styles.skBone, { width: 50 }]} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({
  message,
  onBack,
  onRetry,
}: {
  message: string;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar onBack={onBack} />
      <View style={styles.errorCenter}>
        <AlertCircle size={40} color={C.muted} strokeWidth={1.5} />
        <Text style={styles.errorTitle}>Couldn't load card</Text>
        <Text style={styles.errorSub}>{message}</Text>
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Active membership banner ──────────────────────────────────────────────────
// Shown instead of the activation pitch when the user already owns this card.

function ActiveMembershipBanner({
  walletBalance,
  expiresAt,
}: {
  walletBalance: number;
  expiresAt: string;
}) {
  return (
    <View style={styles.activeBanner}>
      <View style={styles.activeBannerBadgeRow}>
        <View style={styles.activeDot} />
        <Text style={styles.activeBannerLabel}>ACTIVE MEMBERSHIP</Text>
      </View>
      <View style={styles.activeBannerStats}>
        <View style={styles.activeBannerStat}>
          <Text style={styles.activeBannerStatLabel}>Remaining Balance</Text>
          <Text style={styles.activeBannerStatValue}>{formatCardPrice(walletBalance)}</Text>
        </View>
        <View style={styles.activeBannerStatDivider} />
        <View style={styles.activeBannerStat}>
          <Text style={styles.activeBannerStatLabel}>Expires</Text>
          <Text style={styles.activeBannerStatValue}>{fmtDate(expiresAt)}</Text>
        </View>
      </View>
    </View>
  );
}

// ── View membership CTA ───────────────────────────────────────────────────────
// Replaces ActivateCTA when the user already has an active subscription.

function ViewMembershipCTA({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    tapLight();
    Animated.spring(scale, { toValue: 0.97, tension: 120, friction: 8, useNativeDriver: true }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }).start();
  }

  return (
    <Animated.View style={[styles.ctaContainer, { transform: [{ scale }] }]}>
      <Pressable
        style={styles.viewMembershipBtn}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Text style={styles.viewMembershipBtnText}>View Membership</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Activate CTA ──────────────────────────────────────────────────────────────

function ActivateCTA({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    tapMedium();
    Animated.spring(scale, {
      toValue: 0.97,
      tension: 120,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }

  function onPressOut() {
    Animated.spring(scale, {
      toValue: 1,
      tension: 120,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[styles.ctaContainer, { transform: [{ scale }] }]}>
      <Pressable
        style={styles.ctaBtn}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Text style={styles.ctaBtnText}>Activate Card</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [sheetVisible, setSheetVisible] = useState(false);
  // Measured rather than guessed — the sticky bar's real content (summary
  // row + CTA) determines how much bottom padding the scroll content needs,
  // so the last section is never clipped behind it regardless of font
  // scaling or device width.
  const [stickyBarHeight, setStickyBarHeight] = useState(0);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const {
    data: card,
    isLoading: cardLoading,
    isError,
    error: cardErr,
    refetch,
  } = useCardDetail(id ?? '');

  // Already cached from the Cards tab — zero extra network cost.
  const { data: activeSubscriptions } = useMyActiveSubscriptions();

  // Both queries below use the card's storeId — already cached from Store Detail.
  const { data: store, refetch: refetchStore } = useStoreDetail(card?.storeId ?? 0);
  const { data: menuCategories, refetch: refetchMenu } = useStoreMenu(card?.storeId ?? 0);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetch(), refetchStore(), refetchMenu()]);
    setIsRefreshing(false);
  }, [refetch, refetchStore, refetchMenu]);

  // Detect ownership: find an ACTIVE sub for this specific card definition.
  const activeSub = card
    ? (activeSubscriptions ?? []).find((s) => s.cardDefinitionId === card.id)
    : undefined;

  function handleActivationSuccess(sub: Subscription) {
    setSheetVisible(false);
    notify({
      type: 'success',
      title: 'Membership Activated',
      message: `${sub.cardName} — wallet loaded with ${formatCardPrice(sub.walletBalance)}`,
    });
    router.push({
      pathname: '/subscriptions/success',
      params: {
        subId:         String(sub.id),
        cardName:      sub.cardName,
        walletBalance: String(sub.walletBalance),
        expiresAt:     sub.expiresAt,
      },
    } as never);
  }

  if (cardLoading) return <LoadingState onBack={handleBack} />;

  if (isError || !card) {
    return (
      <ErrorState
        message={(cardErr as Error)?.message ?? 'Card not found.'}
        onBack={handleBack}
        onRetry={() => void refetch()}
      />
    );
  }

  const cats = menuCategories ?? [];

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
        {/* Premium card hero */}
        <CardHero card={card} />

        {/* Active membership status — shown instead of pitching activation */}
        {activeSub ? (
          <ActiveMembershipBanner
            walletBalance={activeSub.walletBalance}
            expiresAt={activeSub.expiresAt}
          />
        ) : null}

        {/* Benefits */}
        <BenefitsSection card={card} />

        {/* Validity */}
        <ValiditySection card={card} />

        {/* Eligible categories (chips) */}
        <EligibleCategoriesSection card={card} menuCategories={cats} />

        {/* Eligible items (resolved from store menu — no extra calls) */}
        <EligibleItemsSection card={card} menuCategories={cats} />

        {/* Store association */}
        <StoreSection storeName={store?.name} />

        {/* Description / terms */}
        {card.description ? <AboutSection description={card.description} /> : null}

        {/* Extra pad so content clears the sticky CTA — measured, not
            guessed, so "About This Card" is never clipped behind it. */}
        <View style={{ height: stickyBarHeight + 16 }} />
      </ScrollView>

      {/* ── Sticky CTA — View Membership (owned) or "Ready to activate?"
          activation card (available) ────────────────────────────────────── */}
      <View
        style={[styles.stickyBar, { paddingBottom: insets.bottom + 16 }]}
        onLayout={(e) => setStickyBarHeight(e.nativeEvent.layout.height)}
      >
        {activeSub ? (
          <ViewMembershipCTA
            onPress={() =>
              router.push(buildRoute.subscriptionDetail(String(activeSub.id)) as never)
            }
          />
        ) : (
          <>
            <View style={styles.activationHeader}>
              <View style={styles.activationIconWrap}>
                <ShieldCheck size={22} color={C.accent} strokeWidth={2.2} />
              </View>
              <View style={styles.activationHeaderText}>
                <Text style={styles.activationTitle}>Ready to activate?</Text>
                <Text style={styles.activationSubtitle}>
                  Your {card.validityInDays}-day validity starts after activation.
                </Text>
              </View>
            </View>

            <ActivateCTA onPress={() => setSheetVisible(true)} />

            <View style={styles.secureRow}>
              <Lock size={12} color={C.muted} strokeWidth={2} />
              <Text style={styles.secureText}>Secure activation</Text>
            </View>
          </>
        )}
      </View>

      {/* ── Confirmation sheet — only when not already owned ────────────────── */}
      {!activeSub && (
        <ActivationSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          card={card}
          storeName={store?.name}
          menuCategories={cats}
          onSuccess={handleActivationSuccess}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Near-white — not the app-wide C.bg gray, which read as a visibly gray
  // page against the reference's clean, almost-white background. White
  // section cards still separate from it via a subtle border + soft shadow.
  root: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },

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
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 3 },
    }),
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  topBarSpacer: {
    width: 36,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Hero card ──────────────────────────────────────────────────────────────
  // Outer container owns the radius/clip/shadow so the gradient body and the
  // (optional) footer band below read as ONE rounded card, not two stacked
  // boxes with a visible seam.
  heroOuter: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  hero: {
    padding: 18,
    minHeight: CARD_HEIGHT,
    justifyContent: 'space-between',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTopText: { flex: 1, gap: 2 },
  heroBrand: {
    fontSize: 10,
    fontFamily: ManropeWeights.bold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  heroName: {
    fontSize: 20,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.4,
  },
  heroValueProp: {
    fontSize: 13.5,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: -0.1,
    marginTop: 2,
  },
  heroChip: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },

  heroDivider: {
    height: 1,
    opacity: 0.7,
    marginVertical: 14,
  },

  // flex-start so "Valid for" / "You Pay" start at the same top position in
  // both columns, and their values line up the same way beneath them.
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroStatBlock: { flex: 1, gap: 4 },
  heroStatBlockRight: { flex: 1, gap: 4 },
  heroStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
    opacity: 0.6,
  },
  heroStatLabel: {
    fontSize: 12,
    fontFamily: ManropeWeights.medium,
  },
  // Calendar icon sits beside the VALUE ("30 days"), not the label.
  heroStatValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroStatValue: {
    fontSize: 15,
    fontFamily: ManropeWeights.bold,
  },
  heroPayValue: {
    fontSize: 21,
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.4,
  },

  // Footer — sits inside heroOuter's overflow:hidden clip, so it inherits
  // the outer card's bottom corner radius automatically.
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  heroFooterText: {
    fontSize: 13,
    fontFamily: ManropeWeights.bold,
  },

  // Decorative circles — same treatment as every other card representation
  // (My Cards, Membership, Vendor Available Cards) for one consistent
  // decorative language across the card system. Color set inline from theme.
  heroCircle1: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    top: -28,
    right: -28,
    pointerEvents: 'none',
  },
  heroCircle2: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    bottom: -12,
    right: 46,
    pointerEvents: 'none',
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  // Heading lives INSIDE the white card (not floating above it on the page
  // background) — same treatment for every section: What You're Getting,
  // Validity, Eligible Categories, Eligible Items, Available At, About.
  sectionTitle: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.2,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },

  // ── Benefit row ────────────────────────────────────────────────────────────
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 14,
  },
  benefitRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  benefitIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: CC.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  benefitIconHighlight: {
    backgroundColor: CC.goldSoft,
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitLabel: {
    fontSize: 14,
    color: C.primary,
    fontFamily: ManropeWeights.medium,
  },
  benefitCaption: {
    fontSize: 11.5,
    color: C.muted,
    fontFamily: ManropeWeights.regular,
    marginTop: 2,
  },
  benefitValue: {
    fontSize: 15,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.3,
  },
  benefitValueHighlight: {
    color: CC.gold,
  },
  // Compact pill badge — for the validity row's value specifically.
  benefitValuePill: {
    backgroundColor: CC.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  benefitValuePillText: {
    fontSize: 12,
    fontFamily: ManropeWeights.bold,
    color: C.accent,
    letterSpacing: 0.2,
  },

  // ── Validity card footer note ──────────────────────────────────────────────
  validityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CC.accentSoft,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  validityFooterText: {
    flex: 1,
    fontSize: 12.5,
    color: C.secondary,
    fontFamily: ManropeWeights.regular,
  },

  // ── Categories grid ────────────────────────────────────────────────────────
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CC.accentSoft,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  catChipText: {
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
    color: C.accent,
  },

  // ── Eligible items list ────────────────────────────────────────────────────
  eligItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  eligDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  eligItemName: {
    flex: 1,
    fontSize: 14,
    color: C.primary,
    fontFamily: ManropeWeights.medium,
  },
  eligItemPrice: {
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },

  // ── Backward-compat note ───────────────────────────────────────────────────
  legacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
  },
  legacyNoteText: {
    flex: 1,
    fontSize: 13,
    color: C.secondary,
    lineHeight: 20,
    fontFamily: ManropeWeights.regular,
  },

  // ── About ──────────────────────────────────────────────────────────────────
  aboutText: {
    fontSize: 14,
    color: C.secondary,
    lineHeight: 22,
    padding: 16,
    fontFamily: ManropeWeights.regular,
  },

  // ── Store row ──────────────────────────────────────────────────────────────
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  storeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: CC.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  storeName: {
    fontSize: 15,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    flex: 1,
  },

  // ── Error state ────────────────────────────────────────────────────────────
  errorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    marginTop: 8,
  },
  errorSub: {
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 21,
    fontFamily: ManropeWeights.regular,
  },
  retryBtn: {
    marginTop: 10,
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 16,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: ManropeWeights.bold,
  },

  // ── Loading skeleton bones ─────────────────────────────────────────────────
  skBone: {
    height: 13,
    borderRadius: 6,
    backgroundColor: CC.skeleton,
  },

  bottomPad: { height: 48 },

  // ── Active membership banner ───────────────────────────────────────────────
  activeBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: '#34C759',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  activeBannerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  activeBannerLabel: {
    fontSize: 11,
    fontFamily: ManropeWeights.bold,
    color: '#1A7A35',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  activeBannerStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeBannerStat: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 3,
  },
  activeBannerStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: C.border,
  },
  activeBannerStatLabel: {
    fontSize: 11,
    color: C.muted,
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.2,
  },
  activeBannerStatValue: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.3,
  },

  // ── Sticky CTA ────────────────────────────────────────────────────────────
  stickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  // "Ready to activate?" header — small tinted icon + heading + subtitle,
  // sits above the CTA inside the same sticky bar.
  activationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  activationIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CC.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activationHeaderText: { flex: 1, paddingTop: 2 },
  // Same scale as sectionTitle ("What you're getting") — this heading
  // reads as a normal section heading, not a page/hero title.
  activationTitle: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  // Same scale as benefitCaption ("Extra value added") — subtle supporting
  // text, not competing with the heading above it.
  activationSubtitle: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.regular,
    color: C.muted,
    lineHeight: 16,
    marginTop: 3,
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  secureText: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
  },

  ctaContainer: { width: '100%' },
  ctaBtn: {
    flexDirection: 'row',
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  ctaBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  viewMembershipBtn: {
    backgroundColor: '#1C7A3C',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#34C759', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.20, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  viewMembershipBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
});
