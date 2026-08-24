// Animated "hero card" reveal shown right after a successful card purchase.
// Self-contained: drives its own entrance (3D flip + spring pop), a one-shot
// gloss sweep once it lands, a soft idle glow pulse, and an interactive
// touch-tilt (Apple-Card-style parallax) — all on the UI thread via Reanimated
// worklets so it stays smooth even while the JS thread is busy elsewhere.
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CreditCard } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ManropeWeights } from '@/constants/theme';
import { CARD_SHINE, type CardColorTheme } from '@/utils/cardColorTheme';

const TILT_DEG = 9;

type PurchaseCardRevealProps = {
  cardName: string;
  /** Same canonical per-card theme as My Cards, Card Details, Membership
   *  and Vendor Available Cards — keeps text/decoration contrast-safe
   *  across the whole approved palette. */
  theme: CardColorTheme;
  balanceLabel: string;
  expiryLabel?: string;
  daysLabel?: string;
  /** ms to hold before the card starts flipping in — lets it land after a preceding beat (e.g. a checkmark). */
  delay?: number;
};

export function PurchaseCardReveal({
  cardName,
  theme,
  balanceLabel,
  expiryLabel,
  daysLabel,
  delay = 0,
}: PurchaseCardRevealProps) {
  const [cardWidth, setCardWidth] = useState(320);

  const flip = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const glow = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    flip.value = withDelay(
      delay,
      withSpring(1, {
        damping: 14,
        stiffness: 120,
        reduceMotion: ReduceMotion.System,
      })
    );
    shimmer.value = withDelay(
      delay + 650,
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) })
    );
    glow.value = withDelay(
      delay + 500,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onLayout(e: LayoutChangeEvent) {
    setCardWidth(e.nativeEvent.layout.width);
  }

  const cardStyle = useAnimatedStyle(() => {
    const entranceRotate = interpolate(flip.value, [0, 1], [72, 0]);
    const scale = interpolate(flip.value, [0, 1], [0.78, 1]) * pressScale.value;
    const translateY = interpolate(flip.value, [0, 1], [26, 0]);
    return {
      opacity: flip.value,
      transform: [
        { perspective: 900 },
        { translateY },
        { rotateY: `${entranceRotate + tiltY.value}deg` },
        { rotateX: `${tiltX.value}deg` },
        { scale },
      ],
    };
  });

  const shimmerStyle = useAnimatedStyle(() => {
    const x = interpolate(shimmer.value, [0, 1], [-cardWidth * 0.6, cardWidth * 1.3]);
    return {
      opacity: interpolate(shimmer.value, [0, 0.1, 0.8, 1], [0, 1, 1, 0]),
      transform: [{ translateX: x }, { rotate: '-16deg' }],
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.16, 0.38]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.95, 1.04]) }],
  }));

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onBegin(() => {
      'worklet';
      pressScale.value = withTiming(1.02, { duration: 130 });
    })
    .onChange((e) => {
      'worklet';
      tiltY.value = Math.max(-TILT_DEG, Math.min(TILT_DEG, e.translationX / 7));
      tiltX.value = Math.max(-TILT_DEG, Math.min(TILT_DEG, -e.translationY / 7));
    })
    .onFinalize(() => {
      'worklet';
      tiltX.value = withSpring(0, { damping: 11, stiffness: 140 });
      tiltY.value = withSpring(0, { damping: 11, stiffness: 140 });
      pressScale.value = withSpring(1, { damping: 11, stiffness: 140 });
    });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glow, { backgroundColor: theme.gradient[0] }, glowStyle]} pointerEvents="none" />

      <GestureDetector gesture={pan}>
        <Animated.View onLayout={onLayout} style={[styles.card, cardStyle]}>
          <LinearGradient
            colors={theme.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Subtle warm shine — same treatment on every card representation */}
          <LinearGradient
            colors={CARD_SHINE}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.7 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.top}>
            <View style={styles.names}>
              <Text style={[styles.brand, { color: theme.textMuted }]}>Membership</Text>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
                {cardName}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
              <CreditCard size={20} color={theme.textSecondary} strokeWidth={1.5} />
            </View>
          </View>

          <View style={styles.balanceWrap}>
            <Text style={[styles.balLabel, { color: theme.textMuted }]}>Wallet Balance</Text>
            <Text style={[styles.balValue, { color: theme.textPrimary }]}>{balanceLabel}</Text>
          </View>

          {expiryLabel ? (
            <View style={styles.bottom}>
              <View>
                <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Valid Until</Text>
                <Text style={[styles.metaValue, { color: theme.textSecondary }]}>{expiryLabel}</Text>
              </View>
              {daysLabel ? (
                <View style={styles.daysPill}>
                  <Text style={styles.daysText}>{daysLabel}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.decCircle1, { backgroundColor: theme.decor1 }]} pointerEvents="none" />
          <View style={[styles.decCircle2, { backgroundColor: theme.decor2 }]} pointerEvents="none" />

          <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none" />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    top: 14,
    width: '90%',
    height: '86%',
    borderRadius: 30,
  },
  card: {
    width: '100%',
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
    }),
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  names: { flex: 1, gap: 4, paddingRight: 12 },
  brand: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  name: {
    fontSize: 19,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.4,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceWrap: { gap: 4 },
  balLabel: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balValue: {
    fontSize: 36,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -1.5,
  },
  bottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
  daysPill: {
    backgroundColor: 'rgba(52,199,89,0.20)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  daysText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#6EE89E',
  },
  decCircle1: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    top: -40,
    right: -40,
  },
  decCircle2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    bottom: 10,
    right: 80,
  },
  shimmer: {
    position: 'absolute',
    top: -60,
    left: 0,
    width: 70,
    height: '260%',
    experimental_backgroundImage:
      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.32) 50%, transparent 100%)',
  },
});
