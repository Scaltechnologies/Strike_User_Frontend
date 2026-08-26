// Subtle "waiting" indicator — gentle opacity breathing, not a spinner. Used for payment
// states that are simply waiting on an external actor (e.g. Pay-at-Store PENDING, waiting for
// the store to scan). Reduced-motion note: Reanimated's `reduceMotion: ReduceMotion.System`
// option (same pattern as subscriptions/success.tsx's checkScale) makes the loop resolve
// immediately to its end value instead of animating when the OS setting is on — no manual
// branching needed.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface PulsingDotProps {
  color: string;
  size?: number;
}

export function PulsingDot({ color, size = 8 }: PulsingDotProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 900, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={style}>
      <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dot: {},
});
