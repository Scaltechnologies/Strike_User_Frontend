// Shared premium subscription-card widget — used by both the Home screen's
// purchased-cards carousel and the My Cards tab's Active/Expiring lists, so
// the two surfaces never visually drift apart again. Canonical per-card
// gradient/glow, decorative circles, spring press, and the "₹used of ₹total"
// usage bar are shared; `urgency`/`width` cover the two screens' real
// differences (Cards tab needs expiry tracking; Home's carousel is a
// compact fixed-width teaser).

import { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import { ManropeWeights } from '@/constants/theme';
import { CARD_HEIGHT, CARD_RADIUS, CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import { tapLight } from '@/utils/haptics';
import type { Store } from '@/types/store';
import type { Subscription } from '@/types/subscription';

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(toUtc(expiresAt)).getTime() - Date.now()) / 86_400_000));
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PremiumSubscriptionCardProps {
  sub: Subscription;
  store: Store | undefined;
  onPress: () => void;
  index?: number;
  /** Fixed width for a carousel slide; omit for full-width list rows. */
  width?: number;
  /** Pulsing top accent bar + a red "Xd left" badge instead of the plain
   *  expiry date — Cards tab's Expiring Soon section only. */
  urgency?: boolean;
  /** Show the plain "Expires <date>" / urgency badge row at all — off by
   *  default so Home's compact carousel card stays exactly as designed. */
  showExpiry?: boolean;
}

export function PremiumSubscriptionCard({
  sub, store, onPress, index = 0, width, urgency, showExpiry,
}: PremiumSubscriptionCardProps) {
  // originalWalletAmount is the purchase-time wallet snapshot (never
  // CardDefinition.walletAmount, which can drift after purchase) — null only
  // for a handful of legacy/test subscriptions that predate the backend
  // field. Falling back to walletBalance as the "total" would silently force
  // used = total - walletBalance = 0 every time, masking any real
  // redemptions on exactly those cards. consumedAmount/consumptionPercentage
  // are trusted straight from the backend when present, matching
  // WalletConsumptionGrid, rather than re-derived here.
  const hasOriginalAmount = sub.originalWalletAmount != null;
  const total = sub.originalWalletAmount ?? sub.walletBalance;
  const used = sub.consumedAmount ?? Math.max(0, total - sub.walletBalance);
  const progressPct = sub.consumptionPercentage ?? (total > 0 ? Math.min(1, used / total) * 100 : 0);

  // Same canonical per-card color as Card Details, Membership and Vendor
  // Available Cards (see @/utils/cardColorTheme).
  const theme = getCardColorTheme(sub.cardName);
  const [gradFrom, gradTo] = theme.gradient;
  const glow = theme.glow;
  const enterDelay = Math.min(index, 5) * 90;
  const days = daysLeft(sub.expiresAt);

  const press = useSharedValue(0);
  const pulse = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(enterDelay + 250, withTiming(progressPct, { duration: 900, easing: Easing.out(Easing.cubic) }));
    if (urgency) {
      pulse.value = withDelay(
        enterDelay + 400,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          false,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressPct, urgency]);

  function handlePressIn() {
    'worklet';
    press.value = withSpring(1, { damping: 18, stiffness: 260 });
    runOnJS(tapLight)();
  }

  function handlePressOut() {
    'worklet';
    press.value = withSpring(0, { damping: 14, stiffness: 200 });
  }

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(press.value, [0, 1], [1, 0.97]) },
      { translateY: interpolate(press.value, [0, 1], [0, 2]) },
    ],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.5, 1]),
  }));

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <AnimatedPressable
      entering={FadeInDown.delay(enterDelay).duration(480).easing(Easing.out(Easing.cubic))}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[styles.cardPressable, width != null && { width }]}
    >
      <Animated.View style={[styles.cardShadowWrap, pressStyle]}>
        <LinearGradient
          colors={[gradFrom, gradTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardWidget}
        >
          {/* Subtle warm shine — same treatment on every card representation */}
          <LinearGradient
            colors={CARD_SHINE}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.7 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Decorative circles — same treatment as every other card representation */}
          <View style={[styles.decCircle1, { backgroundColor: theme.decor1 }]} pointerEvents="none" />
          <View style={[styles.decCircle2, { backgroundColor: theme.decor2 }]} pointerEvents="none" />

          {urgency && (
            <Animated.View style={pulseStyle}>
              <LinearGradient
                colors={['#FF6259', '#D63527']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.urgencyBar}
              />
            </Animated.View>
          )}

          <View style={styles.topRow}>
            {store?.name ? (
              <Text style={[styles.storeName, { color: theme.textSecondary }]} numberOfLines={1}>{store.name}</Text>
            ) : null}
            <Text style={[styles.cardName, { color: theme.textPrimary }]} numberOfLines={1}>{sub.cardName}</Text>
          </View>

          <View style={styles.midSection}>
            {hasOriginalAmount ? (
              <>
                <Text style={[styles.usageValue, { color: theme.textPrimary }]}>
                  {fmt(used)} <Text style={[styles.usageOfTotal, { color: theme.textSecondary }]}>of {fmt(total)} used</Text>
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: theme.trackBg }]}>
                  <Animated.View style={[styles.progressFill, { backgroundColor: glow }, progressBarStyle]} />
                </View>
              </>
            ) : (
              <Text style={[styles.usageValue, { color: theme.textPrimary }]}>
                {fmt(sub.walletBalance)} <Text style={[styles.usageOfTotal, { color: theme.textSecondary }]}>available</Text>
              </Text>
            )}
          </View>

          <View style={styles.bottomRow}>
            {showExpiry ? (
              urgency ? (
                <View style={styles.urgencyPill}>
                  <Text style={styles.urgencyPillText}>{days === 0 ? 'Today' : `${days}d left`}</Text>
                </View>
              ) : (
                <View>
                  <Text style={[styles.expLabel, { color: theme.textMuted }]}>Expires</Text>
                  <Text style={[styles.expDate, { color: theme.textSecondary }]}>{fmtDate(sub.expiresAt)}</Text>
                </View>
              )
            ) : <View />}

            <View style={[styles.viewCardBtn, { backgroundColor: theme.chipBg }]}>
              <Text style={[styles.viewCardBtnText, { color: theme.textPrimary }]}>View Card</Text>
              <ChevronRight size={12} color={theme.textPrimary} strokeWidth={2.5} />
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  cardPressable: {
    marginBottom: 12,
  },
  cardShadowWrap: {
    borderRadius: CARD_RADIUS,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  cardWidget: {
    borderRadius: CARD_RADIUS,
    padding: 16,
    minHeight: CARD_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  // Decorative circles — same treatment as Card Details, Membership and
  // Vendor Available Cards, so every card representation feels like one
  // family. Color is set inline from the card's own theme (decor1/decor2).
  decCircle1: {
    position: 'absolute', width: 110, height: 110, borderRadius: 55,
    top: -28, right: -28,
  },
  decCircle2: {
    position: 'absolute', width: 64, height: 64, borderRadius: 32,
    bottom: -12, right: 46,
  },
  urgencyBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
  },
  topRow: {
    gap: 2,
  },
  storeName: {
    fontSize: 10,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardName: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  midSection: {
    marginTop: 12,
  },
  usageValue: {
    fontSize: 18,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.3,
  },
  usageOfTotal: {
    fontSize: 12,
    fontFamily: ManropeWeights.medium,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  expLabel: {
    fontSize: 9,
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  expDate: {
    fontSize: 12,
    fontFamily: ManropeWeights.semiBold,
  },
  urgencyPill: {
    backgroundColor: 'rgba(255,59,48,0.24)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,98,89,0.45)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  urgencyPillText: {
    fontSize: 11,
    fontFamily: ManropeWeights.bold,
    color: '#FFB3AC',
  },
  viewCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },
  viewCardBtnText: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.bold,
  },
});
