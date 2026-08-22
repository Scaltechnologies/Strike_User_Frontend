// Shared entrance-fade wrapper — extraction of the duplicated local `FadeIn`
// in index.tsx and profile.tsx (opacity 0→1 + translateY→0, 380ms). Kept on
// the plain `Animated` API to match the source implementations exactly.

import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  translateYFrom?: number;
  style?: StyleProp<ViewStyle>;
}

export function FadeInView({ children, delay = 0, translateYFrom = 10, style }: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(translateYFrom)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
    // Entrance animation runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
