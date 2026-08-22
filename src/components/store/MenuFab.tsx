// Floating "Menu" button — stays fixed on screen while the Menu tab scrolls
// (mirrors the familiar food-delivery-app floating items button), opening
// MenuCategoriesSheet, a table-of-contents jump-to-category view.

import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen } from 'lucide-react-native';
import { ManropeWeights } from '@/constants/theme';
import { C } from './theme';
import type { MenuCategory } from '@/types/store';

interface Props {
  categories: MenuCategory[];
  onPress: () => void;
}

export function MenuFab({ categories, onPress }: Props) {
  const insets = useSafeAreaInsets();

  if (categories.length === 0) return null;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 22 }]} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        onPress={onPress}
      >
        <LinearGradient
          colors={[C.accent, C.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <BookOpen size={20} color="#FFFFFF" strokeWidth={2.1} />
          <Text style={styles.label}>Menu</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const FAB_SIZE = 68;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    zIndex: 20,
  },
  pressable: {
    borderRadius: FAB_SIZE / 2,
    ...Platform.select({
      ios: { shadowColor: C.accentDeep, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  label: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginTop: 2,
  },
});
