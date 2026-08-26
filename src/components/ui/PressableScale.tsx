// Shared press-scale wrapper — behavior-preserving extraction of the
// byte-for-byte-identical local `ScalePressable` duplicated in index.tsx and
// profile.tsx. Kept on the plain `Animated` API on purpose (not Reanimated):
// this is a literal dedup, not a redesign, so the exact same spring feel is
// preserved rather than introduced as an unrelated engine change.

import { useRef } from 'react';
import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { tapLight } from '@/utils/haptics';

interface PressableScaleProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  hitSlop?: number;
  disabled?: boolean;
}

export function PressableScale({ children, style, onPress, hitSlop, disabled }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const go = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => { tapLight(); go(0.96); }}
      onPressOut={() => go(1)}
      hitSlop={hitSlop}
      disabled={disabled}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
