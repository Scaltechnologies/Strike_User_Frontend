// Promotional banner carousel — admin-managed images (Marketing > Banners in
// strike-admin-panel) shown at the top of the home feed. Auto-advances like
// CardOffersCarousel (store/CardOffersCarousel.tsx), manually swipeable, and
// fails silently (renders nothing) on error/empty so a backend hiccup here
// never blocks the rest of the home feed.
//
// "New Arrivals" (vendor cards created in the last 3 days — see useNewArrivals)
// ride in the same rail as extra slides, same size, appended after the admin
// banners, rather than a separate section: one horizontal strip, one timer,
// one dot row. A card slide is visually distinct (solid card color, no photo)
// since it has no promotional image, but it's sized and paged identically.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useActiveBanners } from '@/hooks/useBanners';
import { useNewArrivals } from '@/hooks/useCards';
import { useMediaSource, logMediaError } from '@/utils/media';
import { formatCardPrice } from '@/components/cards/theme';
import { getCardColorTheme } from '@/utils/cardColorTheme';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { C } from '../store/theme';
import type { Banner } from '@/types/banner';
import type { CardDefinition } from '@/types/card';
import type { Store } from '@/types/store';

const ADVANCE_MS = 4000;
const H_PADDING = 20;
const ASPECT_RATIO = 2.2; // width / height

type Slide =
  | { kind: 'banner'; key: string; banner: Banner }
  | { kind: 'card'; key: string; card: CardDefinition };

function BannerSlide({ banner, width }: { banner: Banner; width: number }) {
  const source = useMediaSource(banner.imageUrl);

  const handlePress = useCallback(() => {
    if (!banner.linkUrl) return;
    void openBrowserAsync(banner.linkUrl, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  }, [banner.linkUrl]);

  if (!source) return null;

  return (
    <Pressable
      style={[styles.slide, { width }]}
      onPress={handlePress}
      disabled={!banner.linkUrl}
    >
      <Image
        source={source}
        style={styles.image}
        contentFit="cover"
        transition={200}
        onError={(e) => logMediaError(`banner:${banner.id}`, source.uri, e)}
      />
    </Pressable>
  );
}

// New-arrival card rendered banner-sized — same width/aspect ratio as
// BannerSlide, filled with the card's own color instead of a photo (cards
// don't carry a promotional image in this app).
function NewArrivalCardSlide({
  card, width, storeName,
}: { card: CardDefinition; width: number; storeName: string | undefined }) {
  const router = useRouter();
  const theme = getCardColorTheme(card.name);
  const hasBonus = card.bonusAmount > 0;

  return (
    <Pressable
      style={[styles.slide, styles.cardSlide, { width, backgroundColor: theme.gradient[0] }]}
      onPress={() => router.push(buildRoute.cardDetail(card.id) as never)}
    >
      <View style={styles.cardSlideLeft}>
        <View style={[styles.newPill, { backgroundColor: theme.chipBg }]}>
          <Text style={[styles.newPillText, { color: theme.textPrimary }]}>NEW</Text>
        </View>
        <Text style={[styles.cardSlideName, { color: theme.textPrimary }]} numberOfLines={1}>
          {card.name}
        </Text>
        {storeName ? (
          <Text style={[styles.cardSlideStore, { color: theme.textSecondary }]} numberOfLines={1}>
            {storeName}
          </Text>
        ) : null}
        <Text style={[styles.cardSlideWallet, { color: theme.textSecondary }]} numberOfLines={1}>
          {formatCardPrice(card.walletAmount)} wallet
          {hasBonus ? (
            <Text style={[styles.cardSlideBonus, { color: theme.textPrimary }]}>{'  '}+{formatCardPrice(card.bonusAmount)} bonus</Text>
          ) : null}
        </Text>
      </View>

      <View style={styles.cardSlideRight}>
        <Text style={[styles.cardSlidePriceLabel, { color: theme.textMuted }]}>Price</Text>
        <Text style={[styles.cardSlidePrice, { color: theme.textPrimary }]}>{formatCardPrice(card.cardPrice)}</Text>
        <View style={[styles.cardSlideValidityPill, { backgroundColor: theme.chipBg }]}>
          <Text style={[styles.cardSlideValidityText, { color: theme.textSecondary }]}>{card.validityInDays}d</Text>
        </View>
      </View>

      {/* Decorative depth circles — same treatment as CardListItem */}
      <View style={[styles.circle1, { backgroundColor: theme.decor1 }]} pointerEvents="none" />
      <View style={[styles.circle2, { backgroundColor: theme.decor2 }]} pointerEvents="none" />
    </Pressable>
  );
}

export function BannerCarousel({ storesById }: { storesById?: Record<number, Store> }) {
  const { data: banners } = useActiveBanners();
  const { data: newArrivals } = useNewArrivals();

  const sortedBanners = (banners ?? [])
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const slides: Slide[] = [
    ...sortedBanners.map((banner): Slide => ({ kind: 'banner', key: `banner-${banner.id}`, banner })),
    ...(newArrivals ?? []).map((card): Slide => ({ kind: 'card', key: `card-${card.id}`, card })),
  ];

  const [slideWidth, setSlideWidth] = useState(
    () => Dimensions.get('window').width - H_PADDING * 2,
  );
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    if (slides.length <= 1 || slideWidth <= 0) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true });
        return next;
      });
    }, ADVANCE_MS);
  }, [slides.length, slideWidth, stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (slideWidth <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
      setIndex(Math.max(0, Math.min(next, slides.length - 1)));
      startTimer();
    },
    [slideWidth, slides.length, startTimer],
  );

  if (slides.length === 0) return null;

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setSlideWidth(e.nativeEvent.layout.width)}
    >
      {slideWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={stopTimer}
          onMomentumScrollEnd={handleMomentumEnd}
          scrollEventThrottle={16}
        >
          {slides.map((slide) =>
            slide.kind === 'banner' ? (
              <BannerSlide key={slide.key} banner={slide.banner} width={slideWidth} />
            ) : (
              <NewArrivalCardSlide
                key={slide.key}
                card={slide.card}
                width={slideWidth}
                storeName={storesById?.[slide.card.storeId]?.name}
              />
            ),
          )}
        </ScrollView>
      ) : null}

      {slides.length > 1 ? (
        <View style={styles.dotsRow} pointerEvents="none">
          {slides.map((slide, i) => (
            <View key={slide.key} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: H_PADDING,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: C.skeleton,
  },
  slide: {
    aspectRatio: ASPECT_RATIO,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
    width: 12,
  },

  // ── New-arrival card slide ──
  cardSlide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  cardSlideLeft: {
    flex: 1,
    gap: 3,
    paddingRight: 10,
  },
  newPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  newPillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: 0.4,
  },
  cardSlideName: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.3,
  },
  cardSlideStore: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cardSlideWallet: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    marginTop: 4,
  },
  cardSlideBonus: {
    fontWeight: '600',
    fontFamily: ManropeWeights.semiBold,
  },
  cardSlideRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardSlidePriceLabel: {
    fontSize: 9,
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  cardSlidePrice: {
    fontSize: 19,
    fontWeight: '800',
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.5,
  },
  cardSlideValidityPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  cardSlideValidityText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
  },

  // Decorative depth circles — same treatment as CardListItem
  circle1: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    top: -35,
    right: -25,
  },
  circle2: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    bottom: -20,
    right: 55,
  },
});
