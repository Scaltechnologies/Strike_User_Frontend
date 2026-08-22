import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ManropeWeights } from '@/constants/theme';
import { C, formatPrice } from './theme';
import type { MenuItem } from '@/types/store';

// FSSAI-style veg/non-veg indicator: coloured square outline with filled circle inside.
function VegIndicator({ type }: { type: 'VEG' | 'NON_VEG' }) {
  const color = type === 'VEG' ? '#16A34A' : '#DC2626';
  return (
    <View style={[styles.vegBox, { borderColor: color }]}>
      <View style={[styles.vegDot, { backgroundColor: color }]} />
    </View>
  );
}

interface Props {
  item: MenuItem;
  isLast?: boolean;
}

export const MenuItemCard = memo(function MenuItemCard({ item, isLast }: Props) {
  const unavailable = item.availabilityStatus === 'OUT_OF_STOCK';

  return (
    <View style={[styles.row, !isLast && styles.rowDivider, unavailable && styles.dimmed]}>
      <View style={styles.titleRow}>
        <VegIndicator type={item.itemType} />
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={[styles.price, unavailable && styles.priceDimmed]}>
          {formatPrice(item.price)}
        </Text>
      </View>

      {item.description ? (
        <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
      ) : null}

      {unavailable ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Out of stock</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    gap: 4,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  dimmed: {
    opacity: 0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  vegBox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 3,
    flexShrink: 0,
  },
  vegDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  name: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  desc: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.regular,
    color: C.secondary,
    lineHeight: 18,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.accentDeep,
    letterSpacing: -0.2,
    flexShrink: 0,
  },
  priceDimmed: {
    color: C.muted,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: C.dangerBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.dangerText,
  },
});
