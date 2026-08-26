import type { CardDefinition } from '@/types/card';
import type { MenuCategory } from '@/types/store';
import { CreditCard } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ManropeWeights } from '@/constants/theme';
import { CARD_HEIGHT, CARD_RADIUS, CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import { tapLight } from '@/utils/haptics';
import { formatCardPrice } from './theme';

interface Props {
  card: CardDefinition;
  categories: MenuCategory[];
  onPress: () => void;
  isOwned?: boolean;
  // 'list' spans the full available width (vertical card lists); 'grid' keeps
  // the original fixed-width widget for horizontal strips.
  layout?: 'grid' | 'list';
}

// Premium gradient widget, Apple Wallet / CRED aesthetic. Color is the
// card's canonical identity (@/utils/cardColorTheme) — the same card
// renders the same color here, on Card Details and on the Membership screen.
export function CardListItem({ card, onPress, isOwned = false, layout = 'grid' }: Props) {
  const theme = getCardColorTheme(card.name);
  const hasBonus = card.bonusAmount > 0;
  const isList = layout === 'list';

  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      onPress={() => { tapLight(); onPress(); }}
    >
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, isList && styles.cardList]}
      >
        {/* Subtle warm shine — same treatment on every card representation */}
        <LinearGradient
          colors={CARD_SHINE}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0.7 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Top row: brand label + chip icon (or owned badge) */}
        <View style={styles.topRow}>
          <Text style={[styles.brand, { color: theme.textMuted }]}>Strike</Text>
          {isOwned ? (
            <View style={styles.ownedBadge}>
              <Text style={styles.ownedBadgeText}>Active</Text>
            </View>
          ) : (
            <View style={[styles.chip, { backgroundColor: theme.chipBg }]}>
              <CreditCard size={15} color={theme.textSecondary} strokeWidth={1.5} />
            </View>
          )}
        </View>

        {/* Card name */}
        <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={2}>
          {card.name}
        </Text>

        {/* Wallet + bonus line — the card's own credit, distinct from what the user pays */}
        <Text style={[styles.walletLine, { color: theme.textPrimary }]} numberOfLines={1}>
          {formatCardPrice(card.walletAmount)} <Text style={[styles.walletLineCaption, { color: theme.textSecondary }]}>wallet</Text>
          {hasBonus ? (
            <Text style={[styles.bonusText, { color: theme.textPrimary }]}>{'  '}+{formatCardPrice(card.bonusAmount)} bonus</Text>
          ) : null}
        </Text>

        {/* Bottom: clearly labeled price + validity pill */}
        <View style={styles.bottomRow}>
          <View>
            <Text style={[styles.priceLabel, { color: theme.textMuted }]}>Price</Text>
            <Text style={[styles.price, { color: theme.textPrimary }]}>{formatCardPrice(card.cardPrice)}</Text>
          </View>
          <View style={[styles.validityPill, { backgroundColor: theme.chipBg }]}>
            <Text style={[styles.validityText, { color: theme.textSecondary }]}>{card.validityInDays}d</Text>
          </View>
        </View>

        {/* Decorative background circles */}
        <View style={[styles.circle1, { backgroundColor: theme.decor1 }]} />
        <View style={[styles.circle2, { backgroundColor: theme.decor2 }]} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginRight: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  cardList: {
    width: '100%',
    height: CARD_HEIGHT,
    padding: 16,
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
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  chip: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },

  name: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.3,
    marginTop: 2,
  },

  walletLine: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.1,
  },
  walletLineCaption: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
  },
  bonusText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },

  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.5,
  },
  validityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-end',
  },
  validityText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
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

  // Decorative circles — same treatment as every other card representation
  // (My Cards, Card Details, Membership) for one consistent decorative
  // language across the card system. Color set inline from the card's own theme.
  circle1: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    top: -28,
    right: -28,
    pointerEvents: 'none',
  },
  circle2: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    bottom: -12,
    right: 46,
    pointerEvents: 'none',
  },
});
