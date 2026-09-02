import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type ViewStyle } from 'react-native';

interface Props {
  style?: ViewStyle | ViewStyle[];
  // Extra vertical offset — for a header/sheet-handle sitting above this
  // view that isn't accounted for by the view's own layout height.
  verticalOffset?: number;
}

// One consistent keyboard-avoidance strategy, used everywhere a screen or
// sheet has a TextInput: iOS shifts content with `padding`; Android relies
// on `android.softwareKeyboardLayoutMode: "resize"` (app.json) to shrink the
// window when the keyboard opens, so `height` behavior here only has to
// react to that resize — no per-screen keyboard-height tracking needed.
export function KeyboardAvoidingScreen({
  children,
  style,
  verticalOffset = 0,
}: PropsWithChildren<Props>) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={verticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
