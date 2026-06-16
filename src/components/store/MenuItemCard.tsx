import { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
      {/* Left: indicator + text */}
      <View style={styles.body}>
        <VegIndicator type={item.itemType} />
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text style={[styles.price, unavailable && styles.priceDimmed]}>
            {formatPrice(item.price)}
          </Text>
          {unavailable ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Out of stock</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right: item image */}
      {item.imageUrl ? (
        <View style={styles.imgWrap}>
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.img}
            contentFit="cover"
            transition={200}
          />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  dimmed: {
    opacity: 0.5,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  vegBox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  vegDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: C.primary,
    lineHeight: 20,
  },
  desc: {
    fontSize: 12,
    color: C.secondary,
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
  },
  priceDimmed: {
    color: C.muted,
  },
  badge: {
    backgroundColor: C.bg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: C.muted,
  },
  imgWrap: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: C.skeleton,
  },
  img: {
    width: 80,
    height: 80,
  },
});
