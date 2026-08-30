// "Cards" / "Menu" page tabs — reads as two pages of the same screen (text +
// icon + underline indicator), not a segmented toggle control.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
      <Pressable style={styles.tab} onPress={() => onChange('cards')}>
        <View style={styles.tabContent}>
          <CreditCard size={16} color={active === 'cards' ? C.accent : C.secondary} strokeWidth={2.2} />
          <Text style={[styles.label, active === 'cards' && styles.labelActive]}>Cards</Text>
        </View>
        <View style={[styles.underline, active === 'cards' && styles.underlineActive]} />
      </Pressable>
      <Pressable style={styles.tab} onPress={() => onChange('menu')}>
        <View style={styles.tabContent}>
          <BookOpen size={16} color={active === 'menu' ? C.accent : C.secondary} strokeWidth={2.2} />
          <Text style={[styles.label, active === 'menu' && styles.labelActive]}>Menu</Text>
        </View>
        <View style={[styles.underline, active === 'menu' && styles.underlineActive]} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 10,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  labelActive: {
    color: C.accent,
    fontFamily: ManropeWeights.bold,
  },
  // Reserves its space even when inactive (transparent) so the tab's height
  // never shifts as the selection changes.
  underline: {
    width: 56,
    height: 3,
    borderRadius: 2,
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  underlineActive: {
    backgroundColor: C.accent,
  },
});
