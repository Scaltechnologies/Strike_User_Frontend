import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, CreditCard } from 'lucide-react-native';
import { cardBgColor, formatCardPrice } from '@/components/cards/theme';
import { ROUTES, buildRoute } from '@/constants/routes';

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:         '#0D0D14',
  surface:    '#171722',
  border:     'rgba(255,255,255,0.10)',
  primary:    '#FFFFFF',
  secondary:  'rgba(255,255,255,0.55)',
  muted:      'rgba(255,255,255,0.30)',
  accent:     '#D63527',
  success:    '#34C759',
  successSoft:'rgba(52,199,89,0.15)',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function toUtc(iso: string): string {
  return iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(toUtc(iso)).getTime() - Date.now()) / 86_400_000));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActivationSuccessScreen() {
  const router = useRouter();
  const {
    cardName   = 'Membership',
    walletBalance = '0',
    expiresAt  = '',
    subId      = '',
  } = useLocalSearchParams<{
    cardName: string;
    walletBalance: string;
    expiresAt: string;
    subId: string;
  }>();

  const balance    = parseFloat(walletBalance) || 0;
  const days       = expiresAt ? daysLeft(expiresAt) : 0;
  const expiryFmt  = expiresAt ? fmtDate(expiresAt) : '';
  const cardBg     = cardBgColor(cardName);

  // ── Entrance animations ────────────────────────────────────────────────────

  const checkScale  = useRef(new Animated.Value(0)).current;
  const cardScale   = useRef(new Animated.Value(0.72)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const infoOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Checkmark pops in
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      // 2. Card slides + fades in
      Animated.parallel([
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
      // 3. Info + CTAs fade in
      Animated.parallel([
        Animated.timing(infoOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(ctaOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleViewCards() {
    router.replace(ROUTES.TABS.CARDS as never);
  }

  function handleContinue() {
    router.replace(ROUTES.TABS.HOME as never);
  }

  function handleViewDetail() {
    if (subId) {
      router.replace(buildRoute.subscriptionDetail(subId) as never);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Main content — centered */}
      <View style={styles.body}>
        {/* Success badge */}
        <Animated.View style={[styles.successBadge, { transform: [{ scale: checkScale }] }]}>
          <CheckCircle2 size={32} color={C.success} strokeWidth={2} />
        </Animated.View>

        {/* Title */}
        <Animated.View style={[styles.titleWrap, { opacity: checkScale }]}>
          <Text style={styles.title}>Membership Activated</Text>
          <Text style={styles.subtitle}>Your wallet is ready to use</Text>
        </Animated.View>

        {/* Membership card widget */}
        <Animated.View
          style={[
            styles.cardWidget,
            { backgroundColor: cardBg },
            { transform: [{ scale: cardScale }], opacity: cardOpacity },
          ]}
        >
          {/* Top */}
          <View style={styles.cardWidgetTop}>
            <View style={styles.cardWidgetNames}>
              <Text style={styles.cardWidgetBrand}>Membership</Text>
              <Text style={styles.cardWidgetName} numberOfLines={2}>
                {cardName}
              </Text>
            </View>
            <View style={styles.cardWidgetChip}>
              <CreditCard size={20} color="rgba(255,255,255,0.55)" strokeWidth={1.5} />
            </View>
          </View>

          {/* Balance */}
          <View style={styles.cardWidgetBalance}>
            <Text style={styles.cardWidgetBalLabel}>Wallet Balance</Text>
            <Text style={styles.cardWidgetBalValue}>
              {formatCardPrice(balance)}
            </Text>
          </View>

          {/* Expiry row */}
          {expiryFmt ? (
            <View style={styles.cardWidgetBottom}>
              <View>
                <Text style={styles.cardWidgetMetaLabel}>Valid Until</Text>
                <Text style={styles.cardWidgetMetaValue}>{expiryFmt}</Text>
              </View>
              <View style={styles.cardWidgetDaysPill}>
                <Text style={styles.cardWidgetDaysText}>{days}d remaining</Text>
              </View>
            </View>
          ) : null}

          {/* Decorative circles */}
          <View style={styles.decCircle1} pointerEvents="none" />
          <View style={styles.decCircle2} pointerEvents="none" />
        </Animated.View>

        {/* Info chips */}
        <Animated.View style={[styles.infoRow, { opacity: infoOpacity }]}>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Balance</Text>
            <Text style={styles.infoChipValue}>{formatCardPrice(balance)}</Text>
          </View>
          {expiryFmt ? (
            <View style={styles.infoChip}>
              <Text style={styles.infoChipLabel}>Expires</Text>
              <Text style={styles.infoChipValue}>{expiryFmt}</Text>
            </View>
          ) : null}
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Status</Text>
            <Text style={[styles.infoChipValue, styles.infoChipActive]}>Active</Text>
          </View>
        </Animated.View>

        {/* View detail link */}
        {subId ? (
          <Animated.View style={{ opacity: infoOpacity }}>
            <Pressable style={styles.viewDetailLink} onPress={handleViewDetail}>
              <Text style={styles.viewDetailText}>View membership details →</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {/* CTA bar */}
      <Animated.View style={[styles.ctaBar, { opacity: ctaOpacity }]}>
        <Pressable style={styles.primaryBtn} onPress={handleViewCards}>
          <Text style={styles.primaryBtnText}>View My Cards</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={handleContinue}>
          <Text style={styles.secondaryBtnText}>Continue Exploring</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Body
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 20,
  },

  // Success badge
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.successSoft,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.success,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: { elevation: 0 },
    }),
  },

  // Title
  titleWrap: { alignItems: 'center', gap: 6 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: C.primary,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 15,
    color: C.secondary,
    fontWeight: '500',
  },

  // Card widget
  cardWidget: {
    width: '100%',
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
    }),
  },
  cardWidgetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardWidgetNames: { flex: 1, gap: 4, paddingRight: 12 },
  cardWidgetBrand: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  cardWidgetName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: -0.4,
  },
  cardWidgetChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardWidgetBalance: { gap: 4 },
  cardWidgetBalLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardWidgetBalValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: -1.5,
  },
  cardWidgetBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardWidgetMetaLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  cardWidgetMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  cardWidgetDaysPill: {
    backgroundColor: 'rgba(52,199,89,0.20)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cardWidgetDaysText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6EE89E',
  },
  decCircle1: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -40,
    right: -40,
  },
  decCircle2: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: 10,
    right: 80,
  },

  // Info chips
  infoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoChip: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  infoChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoChipValue: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
    textAlign: 'center',
  },
  infoChipActive: {
    color: C.success,
  },

  // View detail link
  viewDetailLink: { paddingVertical: 4 },
  viewDetailText: {
    fontSize: 13,
    color: C.secondary,
    fontWeight: '500',
  },

  // CTA bar
  ctaBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  primaryBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: C.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
});
