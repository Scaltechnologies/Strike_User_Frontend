import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { C, MAP_THUMB_SIZE } from './theme';

function Pulse({
  height,
  width,
  radius = 8,
  style,
}: {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.38, duration: 880, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 880, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: C.skeleton, borderRadius: radius, height, opacity },
        width != null ? { width } : { flex: 1 },
        style,
      ]}
    />
  );
}

function SkeletonCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// Extracted so the Menu tab can show just this while the store's other
// sections (header/info, which only depend on the store query) are already
// rendered — instead of the whole screen waiting on both queries together.
export function MenuItemsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <SkeletonCard key={i} style={{ marginTop: 12 }}>
          <View style={styles.itemRow}>
            <View style={styles.itemLeft}>
              <Pulse height={12} width={12} radius={2} style={{ marginBottom: 6 }} />
              <Pulse height={15} width="68%" />
              <Pulse height={12} width="84%" style={{ marginTop: 6 }} />
              <Pulse height={12} width="55%" style={{ marginTop: 4 }} />
              <Pulse height={15} width="28%" style={{ marginTop: 10 }} />
            </View>
            <Pulse height={76} width={76} radius={10} />
          </View>
        </SkeletonCard>
      ))}
    </>
  );
}

export function StoreSkeleton() {
  return (
    <View style={styles.root}>
      {/* Header card — name + badges beside a small map thumbnail, then address */}
      <SkeletonCard style={[styles.headerCard, { marginTop: 14 }]}>
        <View style={styles.topRowSkeleton}>
          <View style={{ flex: 1 }}>
            <Pulse height={22} width="80%" />
            <View style={styles.badgeRowSkeleton}>
              <Pulse height={26} width={92} radius={20} />
              <Pulse height={26} width={64} radius={20} />
            </View>
            <Pulse height={13} width="55%" style={{ marginTop: 10 }} />
          </View>
          <Pulse height={MAP_THUMB_SIZE} width={MAP_THUMB_SIZE} radius={16} />
        </View>
        <View style={styles.divider} />
        <Pulse height={13} width="88%" />
      </SkeletonCard>

      {/* Info card */}
      <SkeletonCard style={{ marginTop: 12 }}>
        <Pulse height={13} width="92%" />
        <Pulse height={13} width="78%" style={{ marginTop: 8 }} />
        <View style={styles.divider} />
        <Pulse height={13} width="52%" />
        <Pulse height={13} width="44%" style={{ marginTop: 8 }} />
      </SkeletonCard>

      {/* Cards / Menu tabs */}
      <View style={styles.tabsRow}>
        <View style={styles.tabsTrack}>
          <Pulse height={40} radius={11} />
          <Pulse height={40} radius={11} />
        </View>
      </View>

      {/* Menu items */}
      <MenuItemsSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    gap: 0,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  headerCard: {
    borderRadius: 20,
    padding: 20,
  },
  topRowSkeleton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  badgeRowSkeleton: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginVertical: 14,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    marginTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  tabsTrack: {
    flexDirection: 'row',
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemLeft: {
    flex: 1,
  },
});
