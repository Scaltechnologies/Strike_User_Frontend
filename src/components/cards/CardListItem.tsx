import type { CardDefinition } from '@/types/card';
import type { MenuCategory } from '@/types/store';
import { CalendarDays, ChevronRight, Sparkles, Tag } from 'lucide-react-native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ManropeWeights } from '@/constants/theme';
import { CARD_HEIGHT, CARD_RADIUS, CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import { tapLight } from '@/utils/haptics';
import { formatCardPrice } from './theme';

// Local color math, scoped to this component only — deliberately NOT added
// to the shared cardColorTheme.ts, since that palette also drives My Cards /
// Card Details / Membership and this refinement is Available-Cards-only.
// Blends the card's own gradient hue toward white/black instead of using a
// generic gray/black overlay, so the footer band and border read as "this
// card's color, lighter/darker" rather than an unrelated tint.
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function blendRgb(hex: string, target: number, factor: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const mix = (v: number) => Math.round(v + (target - v) * factor);
  return [mix(r), mix(g), mix(b)];
}
function towardWhite(hex: string, factor: number, alpha = 1): string {
  const [r, g, b] = blendRgb(hex, 255, factor);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function towardBlack(hex: string, factor: number, alpha = 1): string {
  const [r, g, b] = blendRgb(hex, 0, factor);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Props {
  card: CardDefinition;
  // Unused by this redesign directly, kept so callers building a future
  // "eligible categories" preview don't need a signature change.
  categories?: MenuCategory[];
  onPress: () => void;
  // 'list' spans the full available width (vertical card lists); 'grid' keeps
  // the original fixed-width widget for horizontal strips.
  layout?: 'grid' | 'list';
}

// Vendor Available-Cards list item. The one job of this component: the
// customer should understand "pay X, get Y to spend, for Z days" in the
// first glance — never wallet+bonus numbers they have to add up themselves.
// Same canonical per-card color (@/utils/cardColorTheme) as every other
// card surface (My Cards, Card Details, Membership).
export function CardListItem({ card, onPress, layout = 'grid' }: Props) {
  const theme = getCardColorTheme(card.name);
  const hasBonus = card.bonusAmount > 0;
  const isList = layout === 'list';

  // Brighter rendering of this card's own hue — a small lift toward white on
  // each gradient stop, not a new color and not the shared palette itself, so
  // My Cards / Card Details / Membership stay exactly as they are. Kept
  // modest: too strong a lift washes out the light-colored text on top.
  const baseHue = theme.gradient[0];
  const brightGradient = [
    towardWhite(theme.gradient[0], 0.08),
    towardWhite(theme.gradient[1], 0.03),
  ] as const;
  // Footer + border: real light/dark tints of the card's own hue, not a
  // generic translucent white/black overlay.
  const footerBg = towardWhite(baseHue, 0.86);
  const footerFg = towardBlack(baseHue, 0.4);
  const borderColor = towardWhite(baseHue, 0.55, 0.55);
  // Low-contrast divider between the two stat columns — a faint tint of the
  // card's own hue, never a harsh flat white line.
  const statDividerColor = towardWhite(baseHue, 0.7, 0.35);

  return (
    <Pressable
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}
      onPress={() => { tapLight(); onPress(); }}
    >
      <LinearGradient
        colors={brightGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, isList && styles.cardList, { borderColor }]}
      >
        {/* Subtle warm shine — same treatment on every card representation */}
        <LinearGradient
          colors={CARD_SHINE}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0.7 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.mainArea}>
          {/* Identity: icon + name + the ONE headline value proposition */}
          <View style={styles.headRow}>
            <View style={[styles.iconWrap, { backgroundColor: theme.chipBg }]}>
              <Sparkles size={18} color={theme.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.headTextWrap}>
              <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                {card.name}
              </Text>
              <Text style={[styles.valueProp, { color: theme.textPrimary }]} numberOfLines={1}>
                Get {formatCardPrice(card.walletAmount)} to spend
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: theme.chipBg }]} />

          {/* Valid for / You Pay as two balanced columns — "You Pay" starts
              at the divider (roughly card-center), never pinned to the far
              edge. Labels stay in the dimmer "muted" tier; the actual
              values (days, price) get full-strength text so they never
              read as dull next to the bold headline above. */}
          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <View style={styles.statLabelRow}>
                <CalendarDays size={12} color={theme.textMuted} strokeWidth={2.2} />
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Valid for</Text>
              </View>
              <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                {card.validityInDays} days
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: statDividerColor }]} />
            <View style={styles.statBlockRight}>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>You Pay</Text>
              <Text style={[styles.payValue, { color: theme.textPrimary }]}>
                {formatCardPrice(card.cardPrice)}
              </Text>
            </View>
          </View>
        </View>

        {/* Footer — the real bonus (server-computed max(wallet - price, 0)),
            reframed as the saving it represents. Never shown when there
            genuinely isn't one; never a fabricated discount claim. */}
        <View style={[styles.footerBand, { backgroundColor: footerBg }]}>
          {hasBonus ? (
            <View style={styles.footerLeft}>
              <Tag size={12} color={footerFg} strokeWidth={2.2} />
              <Text style={[styles.footerText, { color: footerFg }]}>
                Save {formatCardPrice(card.bonusAmount)}
              </Text>
            </View>
          ) : <View />}
          <ChevronRight size={16} color={footerFg} strokeWidth={2.4} />
        </View>

        {/* One restrained decorative circle — depth, not competing with content */}
        <View style={[styles.circle1, { backgroundColor: theme.decor1 }]} pointerEvents="none" />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 220,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  // No fixed height — the redesigned list item has more content (headline
  // value prop, divider, two-stat row, footer band) than the compact grid
  // widget, so its height is content-driven instead of forced to match the
  // fixed CARD_HEIGHT shared with My Cards/Card Details (those still use it
  // via `card` above, untouched).
  cardList: {
    width: '100%',
    height: undefined,
    marginRight: 0,
    marginBottom: 14,
  },

  mainArea: {
    padding: 17,
    gap: 13,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTextWrap: { flex: 1, gap: 2 },
  name: {
    fontSize: 18,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.3,
  },
  valueProp: {
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: -0.1,
  },

  divider: {
    height: 1,
    opacity: 0.7,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  // Equal-width columns — "You Pay" naturally lands just past the divider
  // (roughly card-center) instead of being pinned to the far right edge.
  statBlock: { flex: 1, gap: 3 },
  statBlockRight: { flex: 1, gap: 3 },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0,
  },
  statValue: {
    fontSize: 15,
    fontFamily: ManropeWeights.bold,
  },
  payValue: {
    fontSize: 21,
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.4,
  },

  footerBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
    fontFamily: ManropeWeights.bold,
  },

  // A single restrained depth circle — the earlier two-circle treatment
  // was decoration competing with the value proposition; one, smaller and
  // further off-canvas, still reads as "premium card" without the clutter.
  circle1: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    top: -50,
    right: -40,
    pointerEvents: 'none',
  },
});
