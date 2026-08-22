import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { MapPin } from 'lucide-react-native';
import { formatDistance } from '@/utils/maps';
import { isStoreOpenNow } from '@/utils/storeTiming';
import { StoreMapThumbnail } from './StoreMapThumbnail';
import { CardOffersCarousel } from './CardOffersCarousel';
import { C } from './theme';
import { ManropeWeights } from '@/constants/theme';
import type { Store } from '@/types/store';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Store['status'] }) {
  const cfg = {
    ACTIVE:             { label: 'Open Now',           color: C.successText, bg: C.successBg  },
    INACTIVE:           { label: 'Closed',              color: C.dangerText,  bg: C.dangerBg   },
    TEMPORARILY_CLOSED: { label: 'Temporarily Closed',  color: C.warningText, bg: C.warningBg  },
  }[status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
      <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Closed signboard — one rope from the card's left edge, one from its
// right edge, both tied to a board hanging in the middle of the card. The
// two anchors are fixed (they're nailed to the card), so the ropes are
// drawn once; the board itself swings from its own tie-point, in the app's
// own accent colour rather than a wood/physical-board palette. ────────────

const CARD_PADDING = 20; // must match styles.card.padding below

const SIGN_BOARD_W = 116;
const SIGN_BOARD_H = 38;
const SIGN_ROPE_LEN = 64; // long enough to clear a two-line store name below it
const SIGN_ROPE_INSET = 10; // how far each anchor sits in from the card's edge
const SIGN_ROPE_COLOR = '#9A9AA0';

function ClosedSignboard({ cardWidth }: { cardWidth: number }) {
  const swing = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(swing, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(swing, {
          toValue: -1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [swing]);

  const rotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] });
  const boardCenterX = cardWidth / 2;

  return (
    <View style={styles.signboardLayer} pointerEvents="none">
      {/* Static ropes — each anchored to a fixed point at the card's edge,
          both converging on the board's tie-point in the middle. */}
      <Svg width={cardWidth} height={SIGN_ROPE_LEN} style={styles.ropesSvg}>
        <Line
          x1={SIGN_ROPE_INSET} y1={2}
          x2={boardCenterX} y2={SIGN_ROPE_LEN}
          stroke={SIGN_ROPE_COLOR} strokeWidth={2} strokeLinecap="round"
        />
        <Line
          x1={cardWidth - SIGN_ROPE_INSET} y1={2}
          x2={boardCenterX} y2={SIGN_ROPE_LEN}
          stroke={SIGN_ROPE_COLOR} strokeWidth={2} strokeLinecap="round"
        />
        <Circle cx={SIGN_ROPE_INSET} cy={2} r={2.5} fill={SIGN_ROPE_COLOR} />
        <Circle cx={cardWidth - SIGN_ROPE_INSET} cy={2} r={2.5} fill={SIGN_ROPE_COLOR} />
        <Circle cx={boardCenterX} cy={SIGN_ROPE_LEN} r={2} fill={SIGN_ROPE_COLOR} />
      </Svg>

      {/* The board swings from its own tie-point — the ropes stay put. */}
      <Animated.View
        style={[
          styles.signboard,
          {
            left: boardCenterX - SIGN_BOARD_W / 2,
            transform: [{ rotate }],
            transformOrigin: ['50%', 0, 0],
          },
        ]}
      >
        <Text style={styles.signboardText}>Closed</Text>
      </Animated.View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  store: Store;
}

export const StoreHeader = memo(function StoreHeader({ store }: Props) {
  const hasCoords = store.latitude != null && store.longitude != null;
  // Reuses the same open/closed source of truth as the Home listing cards —
  // no separate status logic for this screen.
  const closed = !isStoreOpenNow(store);
  // The ropes anchor at the card's own left/right content edges, so the
  // sign needs the card's real measured width, not a guess. onLayout
  // reports the outer (border-box) width; absolutely-positioned children
  // are placed relative to the padding edge, so the card's own horizontal
  // padding has to come back out before using this as the ropes' canvas.
  const [cardWidth, setCardWidth] = useState(0);

  return (
    <View
      style={styles.card}
      onLayout={(e) => setCardWidth(e.nativeEvent.layout.width - CARD_PADDING * 2)}
    >
      {closed && cardWidth > 0 ? <ClosedSignboard cardWidth={cardWidth} /> : null}

      {/* Name (fills the row, like a Swiggy store page) + small map thumbnail */}
      <View style={styles.topRow}>
        <View style={styles.nameCol}>
          <Text style={styles.name} numberOfLines={2}>{store.name}</Text>

          <View style={styles.badgeRow}>
            <StatusBadge status={store.status} />
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{store.category}</Text>
            </View>
          </View>

          {store.distanceKm != null ? (
            <View style={styles.distanceRow}>
              <MapPin size={12} color={C.accent} strokeWidth={2} />
              <Text style={styles.distanceText}>{formatDistance(store.distanceKm)}</Text>
            </View>
          ) : null}

          {/* Address — tap the map thumbnail itself for turn-by-turn directions */}
          <View style={styles.addressLine}>
            <MapPin size={12} color={C.muted} strokeWidth={1.8} style={styles.pinIcon} />
            <Text style={styles.address} numberOfLines={2}>{store.address}</Text>
          </View>
        </View>

        {hasCoords ? (
          <View style={closed ? styles.mapThumbClosed : undefined}>
            <StoreMapThumbnail latitude={store.latitude!} longitude={store.longitude!} />
          </View>
        ) : null}
      </View>

      {/* Auto-advancing deal carousel — real bonus each active card offers */}
      <CardOffersCarousel storeId={store.id} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 14,
    padding: CARD_PADDING,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  nameCol: {
    flex: 1,
  },
  name: {
    fontSize: 21,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
  },
  categoryPill: {
    backgroundColor: C.bg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    color: C.secondary,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  addressLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 10,
  },
  pinIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  address: {
    fontSize: 12.5,
    color: C.secondary,
    flex: 1,
    lineHeight: 18,
    fontFamily: ManropeWeights.regular,
  },

  // ── Map thumbnail closed treatment ────────────────────────────────────────
  // True black & white + slight fade — same values as the closed treatment
  // on the Home listing cards, for one consistent "closed" language app-wide.
  mapThumbClosed: {
    filter: [{ grayscale: 1 }],
    opacity: 0.7,
  },

  // ── Closed signboard — spans the full card, hanging in the middle. ───────
  signboardLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  ropesSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  signboard: {
    position: 'absolute',
    top: SIGN_ROPE_LEN,
    width: SIGN_BOARD_W,
    height: SIGN_BOARD_H,
    borderRadius: 8,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: C.accentDeep, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 7 },
      android: { elevation: 8 },
    }),
  },
  signboardText: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    color: '#FFFFFF',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
