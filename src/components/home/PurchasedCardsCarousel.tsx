// User's own purchased/active cards — auto-advancing hero carousel at the
// top of the home feed. Renders the same shared PremiumSubscriptionCard
// widget used by the My Cards tab, so the two surfaces can never visually
// drift apart. Auto-advances like BannerCarousel, and a manual swipe pauses
// the timer then resumes it.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { PremiumSubscriptionCard } from '@/components/cards/PremiumSubscriptionCard';
import { useMyActiveSubscriptions } from '@/hooks/useSubscriptions';
import { buildRoute } from '@/constants/routes';
import { C } from '../store/theme';
import type { Store } from '@/types/store';

const H_PADDING = 20;
const PEEK = 32; // sliver of the next card visible at the right edge
const CARD_SPACING = 12;
const ADVANCE_MS = 4000;

export function PurchasedCardsCarousel({ storesById }: { storesById: Record<number, Store> }) {
  const router = useRouter();
  const { data: subscriptions, isLoading } = useMyActiveSubscriptions();
  const active = (subscriptions ?? []).filter((s) => s.status === 'ACTIVE');

  const [slideWidth] = useState(() => Dimensions.get('window').width - H_PADDING * 2 - PEEK);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    if (active.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % active.length;
        scrollRef.current?.scrollTo({ x: next * (slideWidth + CARD_SPACING), animated: true });
        return next;
      });
    }, ADVANCE_MS);
  }, [active.length, slideWidth, stopTimer]);

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, [startTimer, stopTimer]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / (slideWidth + CARD_SPACING));
      setIndex(Math.max(0, Math.min(next, active.length - 1)));
      startTimer();
    },
    [slideWidth, active.length, startTimer],
  );

  // While loading, show a card-shaped placeholder instead of nothing — without
  // this the carousel just pops in from empty space once data arrives. Once
  // loaded, a genuinely-empty result (no active cards) still renders nothing.
  if (isLoading) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.scrollContent, { flexDirection: 'row' }]}>
          <Skeleton width={slideWidth} height={118} radius={18} />
        </View>
      </View>
    );
  }

  if (active.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={slideWidth + CARD_SPACING}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={stopTimer}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
      >
        {active.map((sub, i) => (
          <PremiumSubscriptionCard
            key={sub.id}
            sub={sub}
            store={storesById[sub.storeId]}
            width={slideWidth}
            index={i}
            onPress={() => router.push(buildRoute.subscriptionDetail(String(sub.id)) as never)}
          />
        ))}
      </ScrollView>

      {active.length > 1 ? (
        <View style={styles.dotsRow} pointerEvents="none">
          {active.map((sub, i) => (
            <View key={sub.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
    marginBottom: 14,
  },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    gap: CARD_SPACING,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.border,
  },
  dotActive: {
    backgroundColor: C.accent,
    width: 16,
  },
});
