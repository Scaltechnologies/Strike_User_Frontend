// The "Card Locked → Card Active" visual (spec §16). Built from cardName/amount alone — no real
// Subscription exists until the backend confirms SUCCESS (a Payment is the only thing that
// exists pre-confirmation), so this mirrors ActivationSheet's own mini-card preview rather than
// rendering an actual Subscription record. `unlocked` must only ever be driven by a confirmed
// backend SUCCESS status — never flipped locally in anticipation of one.

import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, LockOpen } from 'lucide-react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { formatCardPrice } from '@/components/cards/theme';
import { CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import { ManropeWeights } from '@/constants/theme';

interface LockedCardPreviewProps {
  cardName: string;
  amount: number;
  unlocked: boolean;
}

export function LockedCardPreview({ cardName, amount, unlocked }: LockedCardPreviewProps) {
  const cardTheme = getCardColorTheme(cardName);
  const unlockProgress = useSharedValue(unlocked ? 1 : 0);

  useEffect(() => {
    unlockProgress.value = withTiming(unlocked ? 1 : 0, { duration: 320, reduceMotion: ReduceMotion.System });
  }, [unlocked, unlockProgress]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - unlockProgress.value }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: (1 - unlockProgress.value) * 0.55 }));

  return (
    <LinearGradient
      colors={cardTheme.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <LinearGradient
        colors={CARD_SHINE}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.7 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Text style={[styles.cardName, { color: cardTheme.textPrimary }]} numberOfLines={2}>
        {cardName}
      </Text>
      <Text style={[styles.amount, { color: cardTheme.textPrimary }]}>{formatCardPrice(amount)}</Text>

      <View
        style={[
          styles.statusPill,
          unlocked ? styles.statusPillActive : { backgroundColor: cardTheme.chipBg },
        ]}
      >
        {unlocked ? (
          <LockOpen size={12} color="#1A7A35" strokeWidth={2.4} />
        ) : (
          <Lock size={12} color={cardTheme.textPrimary} strokeWidth={2.4} />
        )}
        <Text style={[styles.statusText, { color: unlocked ? '#1A7A35' : cardTheme.textPrimary }]}>
          {unlocked ? 'Card Active' : 'Card Locked'}
        </Text>
      </View>

      {/* Dim overlay fades out as the card unlocks — never removed abruptly, always a transition. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />
      <Animated.View style={[styles.lockBadge, overlayStyle]} pointerEvents="none">
        <Lock size={22} color="#FFFFFF" strokeWidth={2} />
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    gap: 6,
    minHeight: 140,
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  cardName: {
    fontSize: 17,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.3,
  },
  amount: {
    fontSize: 26,
    fontFamily: ManropeWeights.extraBold,
    letterSpacing: -0.8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  statusPillActive: { backgroundColor: 'rgba(52,199,89,0.18)' },
  statusText: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.2,
  },
  dim: { backgroundColor: '#000000' },
  lockBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
