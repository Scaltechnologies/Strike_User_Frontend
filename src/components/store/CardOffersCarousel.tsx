// Auto-advancing "deal" carousel — one offer at a time, swaps every 2s, and
// is also manually swipeable (swiping resets the auto-advance timer so it
// doesn't fight the user). Built from the real bonus each active card
// carries (CardDefinition.bonusAmount) — the backend has no browsable
// coupon-list endpoint, only a validate-a-known-code one, so this is the
// genuine "discount on cards" data available.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BadgePercent } from 'lucide-react-native';
import { useStoreCards } from '@/hooks/useCards';
import { ManropeWeights } from '@/constants/theme';
import { C, formatPrice } from './theme';
import type { CardDefinition } from '@/types/card';

interface Props {
  storeId: string | number;
}

const ADVANCE_MS = 2000;
const BADGE_SIZE = 48;

// A dimensional discount badge: soft ambient glow, a rich gradient disc with
// a glassy top sheen, and a thin hairline edge instead of a thick sticker
// border — reads as a real UI element rather than a cartoon icon.
function DealBadge() {
  return (
    <View style={styles.badgeWrap}>
      <View style={[styles.glow, styles.glowOuter]} />
      <View style={[styles.glow, styles.glowInner]} />

      <LinearGradient
        colors={[C.accent, C.accentDeep]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.badgeCircle}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.85 }}
          style={styles.badgeSheen}
        />
        <BadgePercent size={19} color="#FFFFFF" strokeWidth={2} />
      </LinearGradient>
    </View>
  );
}

// ── One page of the carousel ─────────────────────────────────────────────────

function DealPage({ card, width, onPress }: { card: CardDefinition; width: number; onPress: () => void }) {
  return (
    <Pressable style={[styles.page, { width }]} onPress={onPress}>
      <DealBadge />

      <View style={styles.pageBody}>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {formatPrice(card.bonusAmount)} free
        </Text>
        <Text style={styles.pageSubtitle} numberOfLines={1}>
          ON {card.name.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

// ── Carousel ──────────────────────────────────────────────────────────────────

export function CardOffersCarousel({ storeId }: Props) {
  const router = useRouter();
  const { data: cards } = useStoreCards(storeId);
  const offers = useMemo(
    () => (cards ?? []).filter((c) => c.isActive && c.bonusAmount > 0),
    [cards],
  );

  const [pageWidth, setPageWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    if (offers.length <= 1 || pageWidth <= 0) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % offers.length;
        scrollRef.current?.scrollTo({ x: next * pageWidth, animated: true });
        return next;
      });
    }, ADVANCE_MS);
  }, [offers.length, pageWidth, stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  // Clamp a stale index (e.g. offers list shrank) back into range.
  useEffect(() => {
    if (index >= offers.length && offers.length > 0) setIndex(0);
  }, [offers.length, index]);

  const handleMomentumEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    setIndex(Math.max(0, Math.min(next, offers.length - 1)));
    startTimer();
  }, [pageWidth, offers.length, startTimer]);

  if (offers.length === 0) return null;

  const goToCard = (id: number) => router.push(`/cards/${id}` as never);

  return (
    <>
      <View style={styles.divider} />
      <View
        style={styles.wrap}
        onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
      >
        {pageWidth > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={stopTimer}
            onMomentumScrollEnd={handleMomentumEnd}
            scrollEventThrottle={16}
          >
            {offers.map((card) => (
              <DealPage key={card.id} card={card} width={pageWidth} onPress={() => goToCard(card.id)} />
            ))}
          </ScrollView>
        ) : null}

        {offers.length > 1 ? (
          <View style={styles.counterWrap} pointerEvents="none">
            <Text style={styles.counterText}>
              {index + 1}/{offers.length}
            </Text>
            <View style={styles.dotsRow}>
              {offers.map((card, i) => (
                <View key={card.id} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginTop: 18,
    marginBottom: 14,
  },
  wrap: {
    backgroundColor: C.accentSoft,
    borderRadius: 16,
    overflow: 'hidden',
  },
  page: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 62,
  },
  badgeWrap: {
    width: BADGE_SIZE + 14,
    height: BADGE_SIZE + 14,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(214, 53, 39, 0.10)',
  },
  glowOuter: {
    width: BADGE_SIZE + 14,
    height: BADGE_SIZE + 14,
  },
  glowInner: {
    width: BADGE_SIZE + 5,
    height: BADGE_SIZE + 5,
    backgroundColor: 'rgba(214, 53, 39, 0.14)',
  },
  badgeCircle: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: C.accentDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '65%',
  },
  pageBody: {
    flex: 1,
    gap: 3,
  },
  pageTitle: {
    fontSize: 17,
    fontFamily: ManropeWeights.extraBold,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.semiBold,
    fontWeight: '600',
    color: C.secondary,
    letterSpacing: 0.3,
  },
  counterWrap: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  counterText: {
    fontSize: 13,
    fontFamily: ManropeWeights.extraBold,
    fontWeight: '800',
    color: C.accent,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D9C7C4',
  },
  dotActive: {
    backgroundColor: C.accent,
    width: 12,
  },
});
