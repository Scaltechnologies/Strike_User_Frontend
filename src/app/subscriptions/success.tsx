import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { formatCardPrice } from '@/components/cards/theme';
import { getCardColorTheme } from '@/utils/cardColorTheme';
import { PurchaseCardReveal } from '@/components/cards/PurchaseCardReveal';
import { ROUTES, buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#0D0D14',
  surface:    '#171722',
  border:     'rgba(255,255,255,0.10)',
  primary:    '#FFFFFF',
  secondary:  'rgba(255,255,255,0.55)',
  muted:      'rgba(255,255,255,0.30)',
  accent:     '#D63527',
  success:    '#34C759',
  successSoft:'rgba(52,199,89,0.15)',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActivationSuccessScreen() {
  const router = useRouter();
  const {
    cardName   = 'Membership',
    walletBalance = '0',
    expiresAt  = '',
    subId      = '',
  } = useLocalSearchParams<{
    cardName: string;
    walletBalance: string;
    expiresAt: string;
    subId: string;
  }>();

  const balance    = parseFloat(walletBalance) || 0;
  const days       = expiresAt ? daysLeft(expiresAt) : 0;
  const expiryFmt  = expiresAt ? fmtDate(expiresAt) : '';
  // Same canonical per-card theme as Card Details / Membership / My Cards /
  // Vendor Available Cards (see @/utils/cardColorTheme).
  const cardTheme  = getCardColorTheme(cardName);

  // ── Entrance choreography ──────────────────────────────────────────────────
  // Runs entirely on the UI thread via Reanimated worklets: checkmark pops,
  // then the membership card flips in (see PurchaseCardReveal — it also owns
  // its own gloss sweep, idle glow and touch-tilt), then info/CTA settle in.

  const CARD_DELAY = 260;
  const CARD_SETTLE = 650; // approx time for the card's entrance spring to land

  const checkScale  = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleY       = useSharedValue(10);
  const infoOpacity  = useSharedValue(0);
  const ctaOpacity   = useSharedValue(0);
  const ctaY         = useSharedValue(10);

  useEffect(() => {
    checkScale.value = withSpring(1, {
      damping: 9,
      stiffness: 150,
      reduceMotion: ReduceMotion.System,
    });
    titleOpacity.value = withDelay(120, withTiming(1, { duration: 260 }));
    titleY.value = withDelay(120, withTiming(0, { duration: 260 }));

    const infoDelay = CARD_DELAY + CARD_SETTLE;
    infoOpacity.value = withDelay(infoDelay, withTiming(1, { duration: 240 }));
    ctaOpacity.value = withDelay(infoDelay + 60, withTiming(1, { duration: 240 }));
    ctaY.value = withDelay(infoDelay + 60, withTiming(0, { duration: 240 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const infoStyle = useAnimatedStyle(() => ({ opacity: infoOpacity.value }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
    transform: [{ translateY: ctaY.value }],
  }));

  function handleViewCards() {
    router.replace(ROUTES.TABS.CARDS as never);
  }

  function handleContinue() {
    router.replace(ROUTES.TABS.HOME as never);
  }

  function handleViewDetail() {
    if (subId) {
      router.replace(buildRoute.subscriptionDetail(subId) as never);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Main content — centered */}
      <View style={styles.body}>
        {/* Success badge */}
        <Animated.View style={[styles.successBadge, checkStyle]}>
          <CheckCircle2 size={32} color={C.success} strokeWidth={2} />
        </Animated.View>

        {/* Title */}
        <Animated.View style={[styles.titleWrap, titleStyle]}>
          <Text style={styles.title}>Membership Activated</Text>
          <Text style={styles.subtitle}>Your wallet is ready to use</Text>
        </Animated.View>

        {/* Membership card — flip-in reveal, gloss sweep, idle glow, touch-tilt */}
        <PurchaseCardReveal
          cardName={cardName}
          theme={cardTheme}
          balanceLabel={formatCardPrice(balance)}
          expiryLabel={expiryFmt || undefined}
          daysLabel={expiryFmt ? `${days}d remaining` : undefined}
          delay={CARD_DELAY}
        />

        {/* Info chips */}
        <Animated.View style={[styles.infoRow, infoStyle]}>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Balance</Text>
            <Text style={styles.infoChipValue}>{formatCardPrice(balance)}</Text>
          </View>
          {expiryFmt ? (
            <View style={styles.infoChip}>
              <Text style={styles.infoChipLabel}>Expires</Text>
              <Text style={styles.infoChipValue}>{expiryFmt}</Text>
            </View>
          ) : null}
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Status</Text>
            <Text style={[styles.infoChipValue, styles.infoChipActive]}>Active</Text>
          </View>
        </Animated.View>

        {/* View detail link */}
        {subId ? (
          <Animated.View style={infoStyle}>
            <Pressable style={styles.viewDetailLink} onPress={handleViewDetail}>
              <Text style={styles.viewDetailText}>View membership details →</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {/* CTA bar */}
      <Animated.View style={[styles.ctaBar, ctaStyle]}>
        <Pressable style={styles.primaryBtn} onPress={handleViewCards}>
          <Text style={styles.primaryBtnText}>View My Cards</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={handleContinue}>
          <Text style={styles.secondaryBtnText}>Continue Exploring</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Body
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 20,
  },

  // Success badge
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.successSoft,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.success,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 0 },
    }),
  },

  // Title
  titleWrap: { alignItems: 'center', gap: 6 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: C.primary,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 15,
    color: C.secondary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },

  // Info chips
  infoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoChip: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  infoChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoChipValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    textAlign: 'center',
  },
  infoChipActive: {
    color: C.success,
  },

  // View detail link
  viewDetailLink: { paddingVertical: 4 },
  viewDetailText: {
    fontSize: 13,
    color: C.secondary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },

  // CTA bar
  ctaBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: C.secondary,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
});
