// Compact rotating ring for "actively confirming" states (e.g. Pay-at-Store
// AWAITING_VENDOR_CONFIRMATION) — deliberately not a full ActivityIndicator spinner, which reads
// as "loading data" rather than "someone else is confirming this". See PulsingDot.tsx for the
// reduced-motion approach (reduceMotion: ReduceMotion.System resolves immediately to the end
// value, so a continuous rotation simply stops rather than needing manual branching).

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface StatusRingProps {
  size?: number;
  color: string;
  trackColor?: string;
}

export function StatusRing({ size = 22, color, trackColor = 'transparent' }: StatusRingProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const strokeWidth = Math.max(2, size / 10);

  return (
    <Animated.View style={style}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: trackColor,
            borderTopColor: color,
            borderRightColor: color,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: {},
});
