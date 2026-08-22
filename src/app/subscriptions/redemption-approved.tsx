import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { useRedemptionDetail } from '@/hooks/useRedemptions';
import { useSubscriptionDetail } from '@/hooks/useSubscriptions';
import { useStoreDetail } from '@/hooks/useStores';
import { notify } from '@/services/notificationService';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';

// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  bg:          '#0D0D14',
  surface:     '#171722',
  border:      'rgba(255,255,255,0.10)',
  primary:     '#FFFFFF',
  secondary:   'rgba(255,255,255,0.55)',
  muted:       'rgba(255,255,255,0.30)',
  accent:      '#D63527',
  success:     '#34C759',
  successSoft: 'rgba(52,199,89,0.15)',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function RedemptionApprovedScreen() {
  const { redemptionId, subId } = useLocalSearchParams<{
    redemptionId: string;
    subId: string;
  }>();

  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Data — served from cache seeded during polling on pending screen.
  const { data: redemption } = useRedemptionDetail(redemptionId);
  const { data: sub }        = useSubscriptionDetail(subId ?? '');
  const { data: store }      = useStoreDetail(sub?.storeId ?? 0);

  // ── Entrance animations ────────────────────────────────────────────────────
  const checkScale   = useRef(new Animated.Value(0)).current;
  const contentFade  = useRef(new Animated.Value(0)).current;
  const ctaFade      = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(checkScale, {
        toValue: 1, tension: 75, friction: 7, useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(contentFade, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(ctaFade,     { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();

    notify({
      type: 'success',
      title: 'Redemption Approved',
      message: 'Your items are ready — enjoy!',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleViewMembership() {
    if (subId) {
      router.replace(buildRoute.subscriptionDetail(subId) as never);
    } else {
      router.replace('/(tabs)/cards' as never);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Success badge ─────────────────────────────────────────────── */}
        <Animated.View style={[styles.badgeWrap, { transform: [{ scale: checkScale }] }]}>
          <View style={styles.badge}>
            <CheckCircle2 size={36} color={C.success} strokeWidth={2} />
          </View>
        </Animated.View>

        {/* ── Heading ──────────────────────────────────────────────────── */}
        <Animated.View style={[styles.headWrap, { opacity: checkScale }]}>
          <Text style={styles.heading}>Redemption Approved</Text>
          <Text style={styles.subheading}>Your items are ready — enjoy!</Text>
        </Animated.View>

        {/* ── Items ────────────────────────────────────────────────────── */}
        <Animated.View style={[styles.block, { opacity: contentFade }]}>
          <Text style={styles.blockLabel}>Items Redeemed</Text>
          <View style={styles.card}>
            {(redemption?.items ?? []).map((item, idx, arr) => (
              <View
                key={item.menuItemId}
                style={[styles.itemRow, idx < arr.length - 1 && styles.itemRowBorder]}
              >
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.menuItemName}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                </Text>
                <Text style={styles.itemPrice}>{fmt(item.totalPrice)}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Amount chips ─────────────────────────────────────────────── */}
        {redemption ? (
          <Animated.View style={[styles.chipsRow, { opacity: contentFade }]}>
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Amount Deducted</Text>
              <Text style={[styles.chipValue, styles.chipValueDeduct]}>
                −{fmt(redemption.totalAmount)}
              </Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipLabel}>Remaining Balance</Text>
              <Text style={styles.chipValue}>{fmt(redemption.remainingBalance)}</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* ── Membership + Store ───────────────────────────────────────── */}
        <Animated.View style={[styles.block, { opacity: contentFade }]}>
          <Text style={styles.blockLabel}>Details</Text>
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Membership</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {sub?.cardName ?? '—'}
              </Text>
            </View>
            <View style={[styles.detailRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border }]}>
              <Text style={styles.detailLabel}>Store</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {store?.name ?? (sub ? `Store #${sub.storeId}` : '—')}
              </Text>
            </View>
          </View>
        </Animated.View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12, opacity: ctaFade }]}>
        <Pressable style={styles.primaryBtn} onPress={handleViewMembership}>
          <Text style={styles.primaryBtnText}>Back to Membership</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  scroll:        { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 20,
  },

  // Success badge
  badgeWrap: { marginBottom: 24 },
  badge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.successSoft,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.success, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 0 },
    }),
  },

  // Heading
  headWrap: { alignItems: 'center', gap: 8, marginBottom: 32 },
  heading: {
    fontSize: 26, fontFamily: ManropeWeights.extraBold, color: C.primary, letterSpacing: -0.8,
  },
  subheading: {
    fontSize: 15, color: C.secondary, fontFamily: ManropeWeights.medium,
  },

  // Block (labeled section)
  block: { width: '100%', marginBottom: 16 },
  blockLabel: {
    fontSize: 11, fontFamily: ManropeWeights.bold,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },

  // Items
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  itemName: {
    flex: 1, fontSize: 14, fontFamily: ManropeWeights.medium, color: C.primary, lineHeight: 20,
  },
  itemPrice: {
    fontSize: 14, fontFamily: ManropeWeights.bold, color: C.secondary, flexShrink: 0,
  },

  // Amount chips
  chipsRow: {
    width: '100%', flexDirection: 'row', gap: 10, marginBottom: 16,
  },
  chip: {
    flex: 1, backgroundColor: C.surface,
    borderRadius: 14, padding: 14, alignItems: 'center', gap: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  chipLabel: {
    fontSize: 10, fontFamily: ManropeWeights.semiBold,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  chipValue: {
    fontSize: 17, fontFamily: ManropeWeights.extraBold, color: C.primary, letterSpacing: -0.4,
  },
  chipValueDeduct: { color: '#FF9B9B' },

  // Details
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  detailLabel: { fontSize: 13, color: C.secondary, fontFamily: ManropeWeights.medium },
  detailValue: {
    fontSize: 13, fontFamily: ManropeWeights.bold, color: C.primary,
    textAlign: 'right', flex: 1,
  },

  // CTA
  ctaBar: {
    paddingHorizontal: 24, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  primaryBtn: {
    backgroundColor: '#D63527',
    borderRadius: 16, paddingVertical: 18, alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#D63527', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 14 },
      android: { elevation: 8 },
    }),
  },
  primaryBtnText: {
    color: '#FFF', fontSize: 16, fontFamily: ManropeWeights.bold, letterSpacing: -0.2,
  },
});
