// Table-of-contents sheet opened from the floating Menu button — lists every
// category so the user can jump straight to one instead of scrolling past
// everything to find it. Presented as a detached floating card (not an
// edge-to-edge sheet) with a springy scale/slide entrance and a staggered
// cascade of the category rows.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutGrid, X } from 'lucide-react-native';
import { C } from './theme';
import type { MenuCategory } from '@/types/store';

import { ManropeWeights } from '@/constants/theme';
interface Props {
  visible: boolean;
  categories: MenuCategory[];
  onClose: () => void;
  onSelect: (categoryId: number | null) => void;
}

const AVATAR_PALETTE = [
  { bg: '#FEF2EF', fg: '#D63527' },
  { bg: '#EEF4FF', fg: '#2563EB' },
  { bg: '#F0FDF4', fg: '#16A34A' },
  { bg: '#FFFBEB', fg: '#B45309' },
  { bg: '#FDF4FF', fg: '#9333EA' },
  { bg: '#F0F9FF', fg: '#0369A1' },
];

function avatarColors(name: string) {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

// ── Row — cascades in with a small per-index delay each time the sheet opens ──

function Row({
  index,
  icon,
  name,
  count,
  onPress,
}: {
  index: number;
  icon: React.ReactNode;
  name: string;
  count: number;
  onPress: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay: 90 + Math.min(index, 8) * 45,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        delay: 90 + Math.min(index, 8) * 45,
        useNativeDriver: true,
        damping: 16,
        stiffness: 220,
        mass: 0.6,
      }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={onPress}
      >
        {icon}
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{count}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Sheet ──────────────────────────────────────────────────────────────────

export function MenuCategoriesSheet({ visible, categories, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);

  const translateY = useRef(new Animated.Value(40)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0, useNativeDriver: true, damping: 15, stiffness: 220, mass: 0.9,
        }),
        Animated.spring(scale, {
          toValue: 1, useNativeDriver: true, damping: 14, stiffness: 220, mass: 0.9,
        }),
        Animated.timing(opacity, {
          toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1, duration: 260, easing: Easing.out(Easing.ease), useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 30, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.94, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0, duration: 180, useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0, duration: 200, useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, translateY, scale, opacity, backdropOpacity]);

  if (!mounted) return null;

  const totalItems = categories.reduce((n, cat) => n + cat.items.length, 0);

  const handleSelect = (id: number | null) => {
    onSelect(id);
    onClose();
  };

  return (
    <Modal visible={mounted} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            bottom: insets.bottom + 14,
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Menu</Text>
            <Text style={styles.headerSub}>
              {totalItems} dish{totalItems === 1 ? '' : 'es'} · {categories.length}{' '}
              {categories.length === 1 ? 'category' : 'categories'}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <X size={18} color={C.primary} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Row
            index={0}
            icon={
              <View style={[styles.avatar, styles.avatarAll]}>
                <LayoutGrid size={17} color="#FFFFFF" strokeWidth={2} />
              </View>
            }
            name="All Items"
            count={totalItems}
            onPress={() => handleSelect(null)}
          />

          {categories.map((cat, i) => {
            const { bg, fg } = avatarColors(cat.name);
            return (
              <Row
                key={cat.id}
                index={i + 1}
                icon={
                  <View style={[styles.avatar, { backgroundColor: bg }]}>
                    <Text style={[styles.avatarInitial, { color: fg }]}>
                      {cat.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                }
                name={cat.name}
                count={cat.items.length}
                onPress={() => handleSelect(cat.id)}
              />
            );
          })}

          <View style={styles.bottomPad} />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    maxHeight: '74%',
    backgroundColor: C.surface,
    borderRadius: 28,
    paddingTop: 10,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.28, shadowRadius: 32 },
      android: { elevation: 20 },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.divider,
  },
  headerTitle: {
    fontSize: 21,
    fontFamily: ManropeWeights.extraBold,
    color: C.primary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 12.5,
    color: C.muted,
    fontFamily: ManropeWeights.medium,
    marginTop: 3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  list: { paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  rowPressed: { backgroundColor: C.bg },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarAll: { backgroundColor: C.accent },
  avatarInitial: {
    fontSize: 16,
    fontFamily: ManropeWeights.extraBold,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  countPill: {
    backgroundColor: C.bg,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    minWidth: 30,
    alignItems: 'center',
  },
  countPillText: {
    fontSize: 12,
    fontFamily: ManropeWeights.bold,
    color: C.muted,
  },
  bottomPad: { height: 24 },
});
