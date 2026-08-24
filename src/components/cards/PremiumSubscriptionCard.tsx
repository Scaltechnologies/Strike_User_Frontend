// Shared premium subscription-card widget — used by both the Home screen's
// purchased-cards carousel and the My Cards tab's Active/Expiring lists, so
// the two surfaces never visually drift apart again. Gradient variant, glow,
// glass sheen, one-shot shimmer sweep, spring press, and the "₹used of
// ₹total" usage bar are shared; `urgency`/`showDirections`/`width` cover the
// two screens' real differences (Cards tab needs expiry tracking + get
// directions; Home's carousel is a compact fixed-width teaser).

import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, Navigation } from 'lucide-react-native';
import { ManropeWeights } from '@/constants/theme';
import { openDirections } from '@/utils/maps';
import type { Store } from '@/types/store';
import type { Subscription } from '@/types/subscription';

// Warm variants of the app's own accent red (#D63527) — every card reads as
// "Strike", not a generic dark-fintech navy/purple/gold palette.
const CARD_GRADIENTS: readonly [string, string][] = [
  ['#3A0F0A', '#8A2A1C'],
  ['#33120A', '#B0431F'],
  ['#3D0E14', '#9C1F3B'],
  ['#341505', '#A85A18'],
  ['#380D0D', '#7A2020'],
];
const CARD_GLOWS = ['#FF6B52', '#FF9147', '#FF5C7A', '#FFB25C', '#FF7A5C'] as const;

function cardVariant(name: string): number {
  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % CARD_GRADIENTS.length;
}

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
  /** "Get Directions" row when the store has coordinates — Cards tab only. */
  showDirections?: boolean;
}

export function PremiumSubscriptionCard({
  sub, store, onPress, index = 0, width, urgency, showExpiry, showDirections,
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

  const variant = cardVariant(sub.cardName);
  const [gradFrom, gradTo] = CARD_GRADIENTS[variant];
  const glow = CARD_GLOWS[variant];
  const hasCoords = store?.latitude != null && store?.longitude != null;
  const enterDelay = Math.min(index, 5) * 90;
  const days = daysLeft(sub.expiresAt);

  const [cardWidth, setCardWidth] = useState(width ?? 280);
  const press = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const pulse = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withDelay(enterDelay + 480, withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) }));
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

  function onLayout(e: LayoutChangeEvent) {
    if (width == null) setCardWidth(e.nativeEvent.layout.width);
  }

  function handlePressIn() {
    'worklet';
    press.value = withSpring(1, { damping: 18, stiffness: 260 });
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

  const shimmerStyle = useAnimatedStyle(() => {
    const x = interpolate(shimmer.value, [0, 1], [-cardWidth * 0.5, cardWidth * 1.4]);
    return {
      opacity: interpolate(shimmer.value, [0, 0.12, 0.75, 1], [0, 1, 1, 0]),
      transform: [{ translateX: x }, { rotate: '-14deg' }],
    };
  });

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
      onLayout={onLayout}
      style={[styles.cardPressable, width != null && { width }]}
    >
      <Animated.View style={[styles.cardShadowWrap, pressStyle]}>
        <LinearGradient
          colors={[gradFrom, gradTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardWidget, { borderColor: `${glow}33` }]}
        >
          <View style={[styles.decGlowOuter, { backgroundColor: glow }]} pointerEvents="none" />
          <View style={[styles.decGlowInner, { backgroundColor: glow }]} pointerEvents="none" />

          <LinearGradient
            colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 0.8 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none" />

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
              <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
            ) : null}
            <Text style={styles.cardName} numberOfLines={1}>{sub.cardName}</Text>
          </View>

          <View style={styles.midSection}>
            {hasOriginalAmount ? (
              <>
                <Text style={styles.usageValue}>
                  {fmt(used)} <Text style={styles.usageOfTotal}>of {fmt(total)} used</Text>
                </Text>
                <View style={styles.progressTrack}>
                  <Animated.View style={[styles.progressFill, { backgroundColor: glow }, progressBarStyle]} />
                </View>
              </>
            ) : (
              <Text style={styles.usageValue}>
                {fmt(sub.walletBalance)} <Text style={styles.usageOfTotal}>available</Text>
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
                  <Text style={styles.expLabel}>Expires</Text>
                  <Text style={styles.expDate}>{fmtDate(sub.expiresAt)}</Text>
                </View>
              )
            ) : <View />}

            <View style={styles.viewCardBtn}>
              <Text style={styles.viewCardBtnText}>View Card</Text>
              <ChevronRight size={12} color="#FFFFFF" strokeWidth={2.5} />
            </View>
          </View>

          {showDirections && hasCoords && (
            <Pressable
              onPress={() => openDirections(store!.latitude!, store!.longitude!)}
              style={({ pressed }) => [
                styles.directionsRow,
                { borderColor: `${glow}4D`, backgroundColor: 'rgba(255,255,255,0.08)' },
                pressed && styles.directionsRowPressed,
              ]}
              hitSlop={8}
            >
              <View style={styles.directionsLeft}>
                <View style={[styles.directionsIconWrap, { backgroundColor: glow }]}>
                  <Navigation size={13} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <Text style={styles.directionsText}>Get Directions</Text>
              </View>
              <ChevronRight size={16} color="rgba(255,255,255,0.75)" strokeWidth={2.4} />
            </Pressable>
          )}
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
    borderRadius: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
      android: { elevation: 5 },
    }),
  },
  cardWidget: {
    borderRadius: 18,
    padding: 14,
    minHeight: 118,
    overflow: 'hidden',
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  decGlowOuter: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    opacity: 0.16, top: -60, right: -50,
  },
  decGlowInner: {
    position: 'absolute', width: 75, height: 75, borderRadius: 38,
    opacity: 0.22, top: -20, right: -10,
  },
  shimmer: {
    position: 'absolute',
    top: -30,
    left: 0,
    width: 45,
    height: '220%',
    experimental_backgroundImage:
      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)',
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
    color: 'rgba(255,255,255,0.52)',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardName: {
    fontSize: 15,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  midSection: {
    marginTop: 10,
  },
  usageValue: {
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  usageOfTotal: {
    fontSize: 12,
    fontFamily: ManropeWeights.medium,
    color: 'rgba(255,255,255,0.58)',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
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
    color: 'rgba(255,255,255,0.45)',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  expDate: {
    fontSize: 12,
    fontFamily: ManropeWeights.semiBold,
    color: 'rgba(255,255,255,0.88)',
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
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
  },
  viewCardBtnText: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
  },
  directionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  directionsRowPressed: { opacity: 0.68, transform: [{ scale: 0.98 }] },
  directionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  directionsIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionsText: {
    fontSize: 12,
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.1,
  },
});
