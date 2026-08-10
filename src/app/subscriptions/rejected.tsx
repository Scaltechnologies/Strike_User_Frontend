import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { XCircle } from 'lucide-react-native';
import { notify } from '@/services/notificationService';
import { buildRoute } from '@/constants/routes';

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  bg:         '#0D0D14',
  surface:    '#171722',
  border:     'rgba(255,255,255,0.10)',
  primary:    '#FFFFFF',
  secondary:  'rgba(255,255,255,0.55)',
  muted:      'rgba(255,255,255,0.30)',
  accent:     '#D63527',
  danger:     '#FF3B30',
  dangerSoft: 'rgba(255,59,48,0.15)',
} as const;

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function RedemptionRejectedScreen() {
  const { subId, reason } = useLocalSearchParams<{
    redemptionId: string;
    subId: string;
    reason: string;
  }>();

  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Entrance animations
  const iconScale   = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(iconScale, {
        toValue: 1, tension: 75, friction: 7, useNativeDriver: true,
      }),
      Animated.timing(contentFade, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    notify({
      type: 'error',
      title: 'Redemption Rejected',
      message: reason && reason.trim().length > 0
        ? reason.trim()
        : "The store couldn't process your request.",
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTryAgain() {
    if (subId) {
      router.replace({
        pathname: '/subscriptions/select' as never,
        params: { subId },
      } as never);
    } else {
      router.replace('/(tabs)/cards' as never);
    }
  }

  function handleBack() {
    if (subId) {
      router.replace(buildRoute.subscriptionDetail(subId) as never);
    } else {
      router.replace('/(tabs)/cards' as never);
    }
  }

  const reasonText = reason && reason.trim().length > 0 ? reason.trim() : null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        {/* Icon */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: iconScale }] }]}>
          <View style={styles.iconBadge}>
            <XCircle size={36} color={C.danger} strokeWidth={2} />
          </View>
        </Animated.View>

        {/* Heading */}
        <Animated.View style={[styles.headWrap, { opacity: iconScale }]}>
          <Text style={styles.heading}>Redemption Rejected</Text>
          <Text style={styles.subheading}>
            The store couldn't process your request
          </Text>
        </Animated.View>

        {/* Reason (if provided) */}
        {reasonText ? (
          <Animated.View style={[styles.reasonCard, { opacity: contentFade }]}>
            <Text style={styles.reasonLabel}>Reason</Text>
            <Text style={styles.reasonText}>{reasonText}</Text>
          </Animated.View>
        ) : null}

        {/* Info */}
        <Animated.Text style={[styles.infoText, { opacity: contentFade }]}>
          Your balance has not been deducted. You can try again with a different selection.
        </Animated.Text>
      </View>

      {/* CTAs */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.primaryBtn} onPress={handleTryAgain}>
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={handleBack}>
          <Text style={styles.secondaryBtnText}>Back to Membership</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },

  // Icon badge
  iconWrap: { marginBottom: 4 },
  iconBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.dangerSoft,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.danger, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 18 },
      android: { elevation: 0 },
    }),
  },

  // Heading
  headWrap: { alignItems: 'center', gap: 8 },
  heading: {
    fontSize: 26, fontWeight: '800',
    color: C.primary, letterSpacing: -0.8,
  },
  subheading: {
    fontSize: 14, color: C.secondary,
    fontWeight: '500', textAlign: 'center', lineHeight: 21,
  },

  // Reason card
  reasonCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 14, padding: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  reasonLabel: {
    fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.30)',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  reasonText: {
    fontSize: 14, color: C.secondary,
    lineHeight: 21, fontWeight: '400',
  },

  // Info text
  infoText: {
    fontSize: 13, color: C.muted,
    textAlign: 'center', lineHeight: 20,
  },

  // CTAs
  ctaBar: {
    paddingHorizontal: 24, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    backgroundColor: C.bg,
    gap: 4,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  primaryBtnText: {
    color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: -0.2,
  },
  secondaryBtn: {
    borderRadius: 16, paddingVertical: 14, alignItems: 'center',
  },
  secondaryBtnText: {
    color: C.secondary, fontSize: 15, fontWeight: '600',
  },
});
