// Renders the Pay-at-Store QR. qrPayload is a plain opaque string (e.g. "STRIKE-PAY-STORE:xyz")
// — not a URL — so it's encoded directly, with no wrapping/transformation. High-contrast,
// generous whitespace, no decoration on the QR itself so scan reliability is never at risk;
// the surrounding card can be premium.

import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ScanLine } from 'lucide-react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CC } from '@/components/cards/theme';
import { ManropeWeights } from '@/constants/theme';

const C = CC;
const QR_SIZE = 196;

interface PayAtStoreQrCardProps {
  qrPayload: string;
}

export function PayAtStoreQrCard({ qrPayload }: PayAtStoreQrCardProps) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, reduceMotion: ReduceMotion.System }),
        withTiming(0, { duration: 1500, reduceMotion: ReduceMotion.System }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.02 }],
  }));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <ScanLine size={13} color={C.accent} strokeWidth={2.4} />
        </View>
        <Text style={styles.eyebrow}>SCAN TO ACTIVATE</Text>
      </View>

      <View style={styles.qrOuter}>
        <Animated.View style={[styles.qrGlow, glowStyle]} pointerEvents="none" />
        <View style={styles.qrFrame}>
          <QRCode value={qrPayload} size={QR_SIZE} backgroundColor="#FFFFFF" color="#0D0D0D" />
          <View style={[styles.corner, styles.cornerTL]} pointerEvents="none" />
          <View style={[styles.corner, styles.cornerTR]} pointerEvents="none" />
          <View style={[styles.corner, styles.cornerBL]} pointerEvents="none" />
          <View style={[styles.corner, styles.cornerBR]} pointerEvents="none" />
        </View>
      </View>

      <Text style={styles.caption}>Scan this QR at the store</Text>
    </View>
  );
}

const CORNER = 20;

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 22,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 10.5,
    fontFamily: ManropeWeights.bold,
    color: C.accent,
    letterSpacing: 1.1,
  },
  qrOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrGlow: {
    position: 'absolute',
    top: -18,
    left: -18,
    right: -18,
    bottom: -18,
    borderRadius: 30,
    backgroundColor: C.accentSoft,
  },
  qrFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: C.accent,
  },
  cornerTL: { top: 4, left: 4, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  cornerTR: { top: 4, right: 4, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  cornerBL: { bottom: 4, left: 4, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  cornerBR: { bottom: 4, right: 4, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  caption: {
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
});
