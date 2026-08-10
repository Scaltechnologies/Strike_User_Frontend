import { StyleSheet, View } from 'react-native';
import { CC } from './theme';

// Skeleton placeholder for a single card in the horizontal discovery list.
export function CardListSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={[styles.bone, { width: 36 }]} />
        <View style={styles.chip} />
      </View>
      <View style={[styles.bone, { width: '75%', height: 18, marginTop: 'auto' as unknown as number }]} />
      <View style={[styles.bone, { width: '45%', marginTop: 8 }]} />
      <View style={styles.bottomRow}>
        <View style={[styles.bone, { width: 56 }]} />
        <View style={[styles.bone, { width: 32, height: 26, borderRadius: 13 }]} />
      </View>
    </View>
  );
}

// Skeleton for the full-width hero card on the Card Detail screen.
export function CardDetailHeroSkeleton() {
  return (
    <View style={styles.hero}>
      <View style={[styles.bone, { width: 44 }]} />
      <View style={[styles.bone, { width: '65%', height: 22, marginTop: 'auto' as unknown as number }]} />
      <View style={[styles.bone, { width: '35%', height: 32, marginTop: 8 }]} />
      <View style={styles.heroBottom}>
        <View style={[styles.bone, { width: 60 }]} />
        <View style={[styles.bone, { width: 50 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: 175,
    borderRadius: 18,
    backgroundColor: CC.skeleton,
    marginRight: 12,
    padding: 18,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bone: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  chip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.10)',
  },

  // Hero skeleton for Card Detail
  hero: {
    marginHorizontal: 16,
    marginTop: 16,
    height: 215,
    borderRadius: 22,
    backgroundColor: CC.skeleton,
    padding: 24,
    justifyContent: 'space-between',
  },
  heroBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
