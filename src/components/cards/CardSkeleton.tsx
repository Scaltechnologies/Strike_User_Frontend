import { StyleSheet, View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { CC } from './theme';

const BONE_COLOR = 'rgba(0,0,0,0.10)';

// Skeleton placeholder for a single card in the discovery list.
// 'list' spans the full width to match the vertical Cards tab; 'grid' keeps
// the original fixed-width widget for horizontal strips.
export function CardListSkeleton({ layout = 'grid' }: { layout?: 'grid' | 'list' }) {
  return (
    <View style={[styles.card, layout === 'list' && styles.cardList]}>
      <View style={styles.topRow}>
        <Skeleton width={36} height={12} color={BONE_COLOR} />
        <Skeleton width={32} height={32} radius={10} color={BONE_COLOR} />
      </View>
      <Skeleton width="75%" height={18} color={BONE_COLOR} style={{ marginTop: 'auto' }} />
      <Skeleton width="45%" height={12} color={BONE_COLOR} style={{ marginTop: 8 }} />
      <View style={styles.bottomRow}>
        <Skeleton width={56} height={12} color={BONE_COLOR} />
        <Skeleton width={32} height={26} radius={13} color={BONE_COLOR} />
      </View>
    </View>
  );
}

// Skeleton for the full-width hero card on the Card Detail screen.
export function CardDetailHeroSkeleton() {
  return (
    <View style={styles.hero}>
      <Skeleton width={44} height={12} color={BONE_COLOR} />
      <Skeleton width="65%" height={22} color={BONE_COLOR} style={{ marginTop: 'auto' }} />
      <Skeleton width="35%" height={32} color={BONE_COLOR} style={{ marginTop: 8 }} />
      <View style={styles.heroBottom}>
        <Skeleton width={60} height={12} color={BONE_COLOR} />
        <Skeleton width={50} height={12} color={BONE_COLOR} />
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
  cardList: {
    width: '100%',
    height: 168,
    padding: 20,
    marginRight: 0,
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
