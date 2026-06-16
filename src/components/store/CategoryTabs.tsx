import { memo, useCallback } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from './theme';
import type { MenuCategory } from '@/types/store';

interface Props {
  categories: MenuCategory[];
  selectedId: number | null; // null = "All"
  onSelect: (id: number | null) => void;
}

export const CategoryTabs = memo(function CategoryTabs({ categories, selectedId, onSelect }: Props) {
  const selectAll = useCallback(() => onSelect(null), [onSelect]);

  if (categories.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          style={[styles.tab, selectedId === null && styles.tabActive]}
          onPress={selectAll}
        >
          <Text style={[styles.label, selectedId === null && styles.labelActive]}>All</Text>
        </Pressable>

        {categories.map((cat) => {
          const active = selectedId === cat.id;
          return (
            <Pressable
              key={cat.id}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => onSelect(cat.id)}
            >
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {cat.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  scroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.bg,
    minWidth: 52,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: C.accent,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: C.muted,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
