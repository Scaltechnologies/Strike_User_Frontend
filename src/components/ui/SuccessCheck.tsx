// Reusable success badge — controlled spring scale-in checkmark with a soft glow ring, matching
// the treatment subscriptions/success.tsx already established for its own checkScale (same
// damping/stiffness, same ReduceMotion.System handling). Deliberately no confetti/particles —
// per the Pay-at-Store motion spec, this is the one "premium celebration" moment allowed, kept
// restrained: a controlled scale-in plus a glow that expands and fades once.

import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface SuccessCheckProps {
  color: string;
  backgroundColor: string;
  size?: number;
  delay?: number;
}

export function SuccessCheck({ color, backgroundColor, size = 72, delay = 0 }: SuccessCheckProps) {
  const checkScale = useSharedValue(0);
  const glowScale = useSharedValue(0.6);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withDelay(
      delay,
      withSpring(1, { damping: 9, stiffness: 150, reduceMotion: ReduceMotion.System }),
    );
    glowOpacity.value = withDelay(
      delay,
      withTiming(0.35, { duration: 180, reduceMotion: ReduceMotion.System }, () => {
        glowOpacity.value = withTiming(0, { duration: 500, reduceMotion: ReduceMotion.System });
      }),
    );
    glowScale.value = withDelay(delay, withTiming(1.6, { duration: 680, reduceMotion: ReduceMotion.System }));
    // Entrance animation runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  return (
    <View style={[styles.wrap, { width: size * 1.6, height: size * 1.6 }]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.badge,
          { width: size, height: size, borderRadius: size / 2, backgroundColor },
          checkStyle,
        ]}
      >
        <CheckCircle2 size={size * 0.55} color={color} strokeWidth={2} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  badge: { alignItems: 'center', justifyContent: 'center' },
});
