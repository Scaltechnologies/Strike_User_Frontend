import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { C, BANNER_HEIGHT } from './theme';

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

export function StoreSkeleton() {
  return (
    <View style={styles.root}>
      {/* Banner */}
      <Pulse height={BANNER_HEIGHT} radius={0} />

      {/* Store meta */}
      <View style={styles.meta}>
        <View style={styles.metaLeft}>
          <Pulse height={22} width="58%" />
          <Pulse height={13} width="72%" style={{ marginTop: 8 }} />
          <Pulse height={13} width="36%" style={{ marginTop: 6 }} />
        </View>
        <View style={styles.metaActions}>
          <Pulse height={36} width={36} radius={10} />
          <Pulse height={36} width={36} radius={10} />
        </View>
      </View>

      {/* Info card */}
      <SkeletonCard style={{ marginTop: 12 }}>
        <Pulse height={13} width="92%" />
        <Pulse height={13} width="78%" style={{ marginTop: 8 }} />
        <View style={styles.divider} />
        <Pulse height={13} width="52%" />
        <Pulse height={13} width="44%" style={{ marginTop: 8 }} />
      </SkeletonCard>

      {/* Category tabs */}
      <View style={styles.tabsRow}>
        {[72, 88, 68, 82].map((w, i) => (
          <Pulse key={i} height={34} width={w} radius={17} />
        ))}
      </View>

      {/* Menu items */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  meta: {
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  metaLeft: {
    flex: 1,
  },
  metaActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 12,
    marginTop: 2,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginVertical: 14,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    marginTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
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
