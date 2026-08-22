import { ActivationSheet } from '@/components/cards/ActivationSheet';
import { CardDetailHeroSkeleton } from '@/components/cards/CardSkeleton';
import { cardBgColor, CC, formatCardPrice } from '@/components/cards/theme';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { useCardDetail } from '@/hooks/useCards';
import { useStoreDetail, useStoreMenu } from '@/hooks/useStores';
import { useMyActiveSubscriptions } from '@/hooks/useSubscriptions';
import { notify } from '@/services/notificationService';
import type { CardDefinition } from '@/types/card';
import type { MenuCategory, MenuItem } from '@/types/store';
import type { Subscription } from '@/types/subscription';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CreditCard,
  Gift,
  Info,
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
  const bg = cardBgColor(card.name);
  const hasBonus = card.bonusAmount > 0;

  return (
    <View style={[styles.hero, { backgroundColor: bg }]}>
      {/* Top row: brand + chip */}
      <View style={styles.heroTopRow}>
        <View>
          <Text style={styles.heroBrand}>Strike</Text>
          <Text style={styles.heroName} numberOfLines={2}>
            {card.name}
          </Text>
        </View>
        <View style={styles.heroChip}>
          <CreditCard size={22} color="rgba(255,255,255,0.65)" strokeWidth={1.5} />
        </View>
      </View>

      {/* Wallet amount — the headline number */}
      <View style={styles.heroMid}>
        <Text style={styles.heroWalletLabel}>Wallet Credit</Text>
        <Text style={styles.heroWalletAmount}>{formatCardPrice(card.walletAmount)}</Text>
        {hasBonus ? (
          <View style={styles.heroBonusPill}>
            <Text style={styles.heroBonusText}>
              +{formatCardPrice(card.bonusAmount)} bonus included
            </Text>
          </View>
        ) : null}
      </View>

      {/* Bottom row: price + validity */}
      <View style={styles.heroBottomRow}>
        <View>
          <Text style={styles.heroMetaLabel}>Price</Text>
          <Text style={styles.heroMetaValue}>{formatCardPrice(card.cardPrice)}</Text>
        </View>
        <View style={styles.heroDot} />
        <View>
          <Text style={styles.heroMetaLabel}>Valid for</Text>
          <Text style={styles.heroMetaValue}>{card.validityInDays} days</Text>
        </View>
      </View>

      {/* Decorative depth circles */}
      <View style={styles.heroCircle1} />
      <View style={styles.heroCircle2} />
      <View style={styles.heroCircle3} />
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ── Benefit row ───────────────────────────────────────────────────────────────

interface BenefitRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  isLast?: boolean;
}

function BenefitRow({ icon, label, value, highlight, isLast }: BenefitRowProps) {
  return (
    <View style={[styles.benefitRow, !isLast && styles.benefitRowBorder]}>
      <View style={[styles.benefitIcon, highlight && styles.benefitIconHighlight]}>
        {icon}
      </View>
      <Text style={styles.benefitLabel}>{label}</Text>
      <Text style={[styles.benefitValue, highlight && styles.benefitValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

// ── Benefits section ──────────────────────────────────────────────────────────

function BenefitsSection({ card }: { card: CardDefinition }) {
  const hasBonus = card.bonusAmount > 0;
  const savingsPct =
    hasBonus ? Math.round((card.bonusAmount / card.cardPrice) * 100) : 0;

  return (
    <Section title="Benefits">
      <BenefitRow
        icon={<Wallet size={16} color={C.accent} strokeWidth={2} />}
        label="Wallet Credit"
        value={formatCardPrice(card.walletAmount)}
        isLast={!hasBonus}
      />
      {hasBonus ? (
        <BenefitRow
          icon={<Gift size={16} color="#C9973A" strokeWidth={2} />}
          label={`Bonus Savings (${savingsPct}% extra)`}
          value={`+${formatCardPrice(card.bonusAmount)}`}
          highlight
          isLast
        />
      ) : null}
    </Section>
  );
}

// ── Validity section ──────────────────────────────────────────────────────────

function ValiditySection({ card }: { card: CardDefinition }) {
  return (
    <Section title="Validity">
      <BenefitRow
        icon={<CalendarDays size={16} color={C.accent} strokeWidth={2} />}
        label="Valid for"
        value={`${card.validityInDays} days from purchase`}
        isLast
      />
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
          <View style={[styles.skBone, { width: 70, marginBottom: 12 }]} />
          <View style={styles.sectionCard}>
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
        <Text style={styles.ctaBtnText}>Activate Membership</Text>
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
  const ctaHeight = 56 + 24 + insets.bottom;

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

        {/* Extra pad so content clears the sticky CTA */}
        <View style={{ height: ctaHeight + 16 }} />
      </ScrollView>

      {/* ── Sticky CTA — View Membership (owned) or Activate (available) ─────── */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 16 }]}>
        {activeSub ? (
          <ViewMembershipCTA
            onPress={() =>
              router.push(buildRoute.subscriptionDetail(String(activeSub.id)) as never)
            }
          />
        ) : (
          <ActivateCTA onPress={() => setSheetVisible(true)} />
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
  root: {
    flex: 1,
    backgroundColor: C.bg,
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
    fontWeight: '600',
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
  hero: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 22,
    padding: 24,
    minHeight: 215,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
    }),
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroBrand: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: 'rgba(255,255,255,0.40)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    maxWidth: 220,
  },
  heroChip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroMid: {
    marginTop: 20,
  },
  heroWalletLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.48)',
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  heroWalletAmount: {
    fontSize: 38,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -1.5,
  },
  heroBonusPill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,151,58,0.22)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBonusText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: '#FFD580',
    letterSpacing: 0.2,
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 20,
    marginTop: 20,
  },
  heroDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 6,
  },
  heroMetaLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  heroMetaValue: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: 'rgba(255,255,255,0.90)',
    letterSpacing: -0.3,
  },
  heroCircle1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -40,
    right: -40,
    pointerEvents: 'none',
  },
  heroCircle2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: 20,
    right: 90,
    pointerEvents: 'none',
  },
  heroCircle3: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: -10,
    left: 40,
    pointerEvents: 'none',
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
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
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
  benefitLabel: {
    flex: 1,
    fontSize: 14,
    color: C.primary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  benefitValue: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.3,
  },
  benefitValueHighlight: {
    color: CC.gold,
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
    fontWeight: '600',
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
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  eligItemPrice: {
    fontSize: 13,
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    borderRadius: 22,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.2,
  },
  activeBannerStatValue: {
    fontSize: 16,
    fontWeight: '700',
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
  ctaContainer: { width: '100%' },
  ctaBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.40,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  ctaBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  viewMembershipBtn: {
    backgroundColor: '#1C7A3C',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#34C759', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  viewMembershipBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
});
