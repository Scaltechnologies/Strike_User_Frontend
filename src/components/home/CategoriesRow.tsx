// Tappable category row — deduped category names across every store's menu
// (added by vendors when they build their menus). Tapping one filters the
// store list to stores whose menu actually has that category; tapping the
// active one again clears the filter.

import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { UtensilsCrossed } from 'lucide-react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { useStoreCategories } from '@/hooks/useStores';
import { useMediaSource } from '@/utils/media';
import { tapSelect } from '@/utils/haptics';
import { ManropeWeights } from '@/constants/theme';
import { C } from '../store/theme';
import type { CategorySummary } from '@/types/store';

const ICON_SIZE = 66;

// Same "hash name → distinct pastel" approach used for store fallback
// avatars elsewhere on this screen — every category reads as its own
// thing instead of all sharing one identical placeholder icon.
const BG_PALETTE = ['#EEF2FF', '#F0FDF4', '#FFF7ED', '#FDF4FF', '#F0F9FF', '#FEFCE8', '#FFF1F2'];
const FG_PALETTE = ['#818CF8', '#34D399', '#FB923C', '#C084FC', '#38BDF8', '#FACC15', '#FB7185'];

function hashIndex(name: string, mod: number): number {
  return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % mod;
}

function CategoryIcon({
  category, index, selected, onPress,
}: {
  category: CategorySummary;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const source = useMediaSource(category.imageUrl);
  const bg = BG_PALETTE[hashIndex(category.name, BG_PALETTE.length)];
  const fg = FG_PALETTE[hashIndex(category.name, FG_PALETTE.length)];

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay: 60 + index * 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: 60 + index * 60,
        useNativeDriver: true,
        damping: 15,
        stiffness: 180,
        mass: 0.6,
      }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Pressable
        style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
        onPress={() => { tapSelect(); onPress(); }}
        hitSlop={4}
      >
        <View style={styles.iconShadow}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: source ? C.skeleton : bg },
              selected && styles.iconWrapSelected,
            ]}
          >
            {source ? (
              <Image source={source} style={styles.iconImage} contentFit="cover" transition={200} />
            ) : (
              <UtensilsCrossed size={23} color={fg} strokeWidth={1.6} />
            )}
          </View>
        </View>
        <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
          {category.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function CategoriesRow({
  selectedCategory, onSelectCategory,
}: {
  selectedCategory: string | null;
  onSelectCategory: (name: string) => void;
}) {
  const { data: categories, isLoading } = useStoreCategories();

  // Placeholder circles while loading, instead of the row popping in from
  // nothing once data arrives. A genuinely-empty result still renders nothing.
  if (isLoading) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.scrollContent, { flexDirection: 'row' }]}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.item}>
              <Skeleton width={ICON_SIZE} height={ICON_SIZE} radius={ICON_SIZE / 2} style={{ marginBottom: 8 }} />
              <Skeleton width={ICON_SIZE * 0.7} height={11} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!categories || categories.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((cat, i) => (
          <CategoryIcon
            key={cat.name}
            category={cat}
            index={i}
            selected={cat.name === selectedCategory}
            onPress={() => onSelectCategory(cat.name)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: C.surface,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 22,
  },
  item: {
    alignItems: 'center',
    width: ICON_SIZE + 10,
  },
  // Split from iconWrap on purpose — Android's `elevation` casts its shadow from
  // the view's rectangular bounds, not its clipped/rounded shape, so combining
  // elevation with overflow:'hidden' + borderRadius on the SAME view renders a
  // square shadow behind the circle. Shadow lives here (no clipping); the actual
  // rounded, clipped content lives in iconWrap, layered inside with no elevation.
  iconShadow: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    marginBottom: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  iconWrap: {
    width: '100%',
    height: '100%',
    borderRadius: ICON_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconWrapSelected: {
    borderWidth: 2.5,
    borderColor: C.accent,
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  label: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    textAlign: 'center',
    marginTop: 1,
  },
  labelSelected: {
    fontFamily: ManropeWeights.bold,
    color: C.accent,
  },
});
