import type { CardDefinition } from '@/types/card';
import type { MenuCategory } from '@/types/store';
import { CreditCard } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ManropeWeights } from '@/constants/theme';
import { cardBgColor, formatCardPrice } from './theme';

interface Props {
  card: CardDefinition;
  categories: MenuCategory[];
  onPress: () => void;
  isOwned?: boolean;
  // 'list' spans the full available width (vertical card lists); 'grid' keeps
  // the original fixed-width widget for horizontal strips.
  layout?: 'grid' | 'list';
}

// Premium dark widget, Apple Wallet / CRED aesthetic.
export function CardListItem({ card, categories, onPress, isOwned = false, layout = 'grid' }: Props) {
  const bg = cardBgColor(card.name);
  const hasBonus = card.bonusAmount > 0;
  const isList = layout === 'list';

  // Resolve category names covered by this card.
  // Guard: backend may omit categoryIds on older card records.
  const covered = categories
    .filter((cat) => (card.categoryIds ?? []).includes(cat.id))
    .map((cat) => cat.name);

  const catLabel =
    covered.length === 0
      ? null
      : covered.length <= 2
        ? covered.join(' · ')
        : `${covered.slice(0, 2).join(' · ')} +${covered.length - 2}`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isList && styles.cardList,
        { backgroundColor: bg, opacity: pressed ? 0.9 : 1 },
      ]}
      onPress={onPress}
    >
      {/* Top row: brand label + chip icon (or owned badge) */}
      <View style={styles.topRow}>
        <Text style={styles.brand}>Strike</Text>
        {isOwned ? (
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedBadgeText}>Active</Text>
          </View>
        ) : (
          <View style={styles.chip}>
            <CreditCard size={15} color="rgba(255,255,255,0.6)" strokeWidth={1.5} />
          </View>
        )}
      </View>

      {/* Card name */}
      <Text style={styles.name} numberOfLines={2}>
        {card.name}
      </Text>

      {/* Wallet + bonus line */}
      <Text style={styles.walletLine} numberOfLines={1}>
        {formatCardPrice(card.walletAmount)} wallet
        {hasBonus ? (
          <Text style={styles.bonusText}>{'  '}+{formatCardPrice(card.bonusAmount)} bonus</Text>
        ) : null}
      </Text>

      {/* Bottom: price + validity pill */}
      <View style={styles.bottomRow}>
        <View>
          {catLabel ? (
            <Text style={styles.catLabel} numberOfLines={1}>
              {catLabel}
            </Text>
          ) : null}
          <Text style={styles.price}>{formatCardPrice(card.cardPrice)}</Text>
        </View>
        <View style={styles.validityPill}>
          <Text style={styles.validityText}>{card.validityInDays}d</Text>
        </View>
      </View>

      {/* Decorative background circles */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: 175,
    borderRadius: 18,
    padding: 18,
    marginRight: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  cardList: {
    width: '100%',
    height: 168,
    padding: 20,
    marginRight: 0,
    marginBottom: 14,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  chip: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  name: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginTop: 2,
  },

  walletLine: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  bonusText: {
    color: '#FFD580',
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  catLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    marginBottom: 4,
    letterSpacing: 0.2,
    fontFamily: ManropeWeights.regular,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  validityPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-end',
  },
  validityText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: 'rgba(255,255,255,0.82)',
  },

  ownedBadge: {
    backgroundColor: 'rgba(52,199,89,0.22)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.30)',
  },
  ownedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: '#34C759',
    letterSpacing: 0.3,
  },

  // Decorative depth circles
  circle1: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -25,
    right: -25,
    pointerEvents: 'none',
  },
  circle2: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: 12,
    right: 65,
    pointerEvents: 'none',
  },
});
