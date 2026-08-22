// Promotional banner carousel — admin-managed images (Marketing > Banners in
// strike-admin-panel) shown at the top of the home feed. Auto-advances like
// CardOffersCarousel (store/CardOffersCarousel.tsx), manually swipeable, and
// fails silently (renders nothing) on error/empty so a backend hiccup here
// never blocks the rest of the home feed.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useActiveBanners } from '@/hooks/useBanners';
import { useMediaSource, logMediaError } from '@/utils/media';
import { C } from '../store/theme';
import type { Banner } from '@/types/banner';

const ADVANCE_MS = 4000;
const H_PADDING = 20;
const ASPECT_RATIO = 2.2; // width / height

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

export function BannerCarousel() {
  const { data: banners } = useActiveBanners();

  const sorted = (banners ?? [])
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);

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
    if (sorted.length <= 1 || slideWidth <= 0) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % sorted.length;
        scrollRef.current?.scrollTo({ x: next * slideWidth, animated: true });
        return next;
      });
    }, ADVANCE_MS);
  }, [sorted.length, slideWidth, stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  useEffect(() => {
    if (index >= sorted.length && sorted.length > 0) setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (slideWidth <= 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
      setIndex(Math.max(0, Math.min(next, sorted.length - 1)));
      startTimer();
    },
    [slideWidth, sorted.length, startTimer],
  );

  if (sorted.length === 0) return null;

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
          {sorted.map((banner) => (
            <BannerSlide key={banner.id} banner={banner} width={slideWidth} />
          ))}
        </ScrollView>
      ) : null}

      {sorted.length > 1 ? (
        <View style={styles.dotsRow} pointerEvents="none">
          {sorted.map((banner, i) => (
            <View key={banner.id} style={[styles.dot, i === index && styles.dotActive]} />
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
});
