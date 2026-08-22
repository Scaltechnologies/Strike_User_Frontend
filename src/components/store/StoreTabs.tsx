// Segmented "Cards" / "Menu" switcher — replaces the old floating menu button;
// cards and menu now live in separate tabs instead of one long interleaved scroll.

import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BookOpen, CreditCard } from 'lucide-react-native';
import { ManropeWeights } from '@/constants/theme';
import { C } from './theme';

export type StoreTab = 'cards' | 'menu';

interface Props {
  active: StoreTab;
  onChange: (tab: StoreTab) => void;
}

export const StoreTabs = memo(function StoreTabs({ active, onChange }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <Pressable
          style={[styles.tab, active === 'cards' && styles.tabActive]}
          onPress={() => onChange('cards')}
        >
          <CreditCard size={15} color={active === 'cards' ? '#FFFFFF' : C.secondary} strokeWidth={2.2} />
          <Text style={[styles.label, active === 'cards' && styles.labelActive]}>Cards</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, active === 'menu' && styles.tabActive]}
          onPress={() => onChange('menu')}
        >
          <BookOpen size={15} color={active === 'menu' ? '#FFFFFF' : C.secondary} strokeWidth={2.2} />
          <Text style={[styles.label, active === 'menu' && styles.labelActive]}>Menu</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  track: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: C.accent,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  labelActive: {
    color: '#FFFFFF',
    fontFamily: ManropeWeights.bold,
    fontWeight: '700',
  },
});
