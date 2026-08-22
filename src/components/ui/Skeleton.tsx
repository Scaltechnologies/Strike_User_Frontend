// Shared shimmer placeholder — one canonical implementation instead of the
// half-dozen near-identical local copies scattered across screens (index.tsx's
// SkeletonPulse, profile.tsx's Pulse, store/StoreSkeleton's Pulse, all doing
// the same 0.6↔0.25 opacity pulse with the plain Animated API). Reanimated
// runs this on the UI thread instead of the JS thread, so it stays smooth
// even while the JS thread is busy with a network response coming in.

import { useEffect } from 'react';
import { type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  color?: string;
  style?: ViewStyle | ViewStyle[];
}

// Matches the cadence every existing ad-hoc skeleton already converged on
// independently (900ms, 0.6 → 0.25) — same feel, just one implementation.
export function Skeleton({ width, height, radius = 8, color = '#E5E5EA', style }: SkeletonProps) {
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.25, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { backgroundColor: color, borderRadius: radius, height },
        width != null ? { width } : { flex: 1 },
        animatedStyle,
        style,
      ]}
    />
  );
}
