// Fixed, full-bleed backdrop for the Home screen — sits behind the ScrollView
// (outside it, so it never scrolls) and replaces the old flat grey fill with
// a bright creamy-white base plus several slow, softly drifting glow patches
// in the same warm-white tonal family (no added hues). Each patch moves on
// an independent X/Y timing loop (a Lissajous-style path rather than a
// straight line) so the motion reads as organic, not mechanical. Everything
// animates on the UI thread via Reanimated worklets (transform/opacity
// only), so it stays smooth even while the list above it scrolls.

import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface GlowConfig {
  size: number;
  color: string;
  opacity: number;
  innerStop: number;
  top: number;
  left: number;
  driftX: number;
  driftY: number;
  durationX: number;
  durationY: number;
  delay: number;
  scaleTo: number;
  scaleDuration: number;
  spin?: number;
}

function GlowPatch({ config }: { config: GlowConfig }) {
  const {
    size, color, opacity, innerStop, top, left,
    driftX, driftY, durationX, durationY, delay,
    scaleTo, scaleDuration, spin,
  } = config;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(0);
  const rotation = useSharedValue(0);

  const gradId = useMemo(
    () => `home-glow-${color.replace('#', '')}-${size}`,
    [color, size],
  );

  // Independent X/Y loops (different periods) trace a slow, organic
  // Lissajous-style path instead of a straight back-and-forth line.
  x.value = withDelay(delay, withRepeat(
    withTiming(1, { duration: durationX, easing: Easing.inOut(Easing.sin) }), -1, true,
  ));
  y.value = withDelay(delay, withRepeat(
    withTiming(1, { duration: durationY, easing: Easing.inOut(Easing.sin) }), -1, true,
  ));
  scale.value = withDelay(delay, withRepeat(
    withTiming(1, { duration: scaleDuration, easing: Easing.inOut(Easing.sin) }), -1, true,
  ));
  if (spin) {
    rotation.value = withRepeat(withTiming(1, { duration: spin, easing: Easing.linear }), -1, false);
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value * driftX },
      { translateY: y.value * driftY },
      { scale: 1 + scale.value * (scaleTo - 1) },
      { rotate: spin ? `${rotation.value * 360}deg` : '0deg' },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top, left, width: size, height: size },
        animatedStyle,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset={`${innerStop}%`} stopColor={color} stopOpacity={opacity * 0.5} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradId})`} />
      </Svg>
    </Animated.View>
  );
}

export function AnimatedHomeBackground() {
  const { width, height } = useWindowDimensions();

  const glows: GlowConfig[] = useMemo(
    () => [
      // Soft focal bloom behind the header — gives the top of the screen a
      // gentle "lit from above" feel instead of uniform flatness.
      {
        size: width * 1.3,
        color: '#FFFFFF',
        opacity: 0.95,
        innerStop: 45,
        top: -height * 0.16,
        left: -width * 0.15,
        driftX: width * 0.06,
        driftY: height * 0.03,
        durationX: 14000,
        durationY: 18000,
        delay: 0,
        scaleTo: 1.06,
        scaleDuration: 10000,
        spin: 60000,
      },
      {
        size: width * 1.05,
        color: '#FFF3DE',
        opacity: 0.75,
        innerStop: 55,
        top: height * 0.4,
        left: width * 0.2,
        driftX: -width * 0.18,
        driftY: -height * 0.07,
        durationX: 13000,
        durationY: 16500,
        delay: 300,
        scaleTo: 1.14,
        scaleDuration: 12000,
      },
      {
        size: width * 0.9,
        color: '#FFEBCB',
        opacity: 0.55,
        innerStop: 50,
        top: height * 0.72,
        left: -width * 0.25,
        driftX: width * 0.2,
        driftY: -height * 0.05,
        durationX: 17000,
        durationY: 11000,
        delay: 900,
        scaleTo: 1.16,
        scaleDuration: 14000,
      },
      {
        size: width * 0.7,
        color: '#FFFFFF',
        opacity: 0.7,
        innerStop: 40,
        top: height * 0.12,
        left: width * 0.45,
        driftX: -width * 0.12,
        driftY: height * 0.1,
        durationX: 9000,
        durationY: 12500,
        delay: 500,
        scaleTo: 1.1,
        scaleDuration: 8000,
      },
    ],
    [width, height],
  );

  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#FFFFFF', '#FFFDF8', '#FFF8EC', '#FFF2DE']}
        locations={[0, 0.32, 0.66, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {glows.map((glow, i) => (
        <GlowPatch key={i} config={glow} />
      ))}
    </Animated.View>
  );
}
