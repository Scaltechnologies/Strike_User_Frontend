import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronRight, Wallet, X } from 'lucide-react-native';
import { useRedemptionDetail } from '@/hooks/useRedemptions';
import { useSubscriptionDetail } from '@/hooks/useSubscriptions';
import { useStoreDetail } from '@/hooks/useStores';
import { notify } from '@/services/notificationService';
import { buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import { getSubscriptionValidityDays } from '@/utils/subscription';
import { WalletConsumptionGrid } from '@/components/wallet/WalletConsumptionGrid';

// How long the settled grid (fully filled, or already-static on a reopen)
// stays on screen — counting down visibly — before the popup auto-dismisses.
const GRID_AUTO_DISMISS_SECONDS = 10;

function fmtPct(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '')}%`;
}

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
  // The wallet grid shows as a popup, not inline: it opens automatically the
  // first time this screen has real subscription data, plays the old→new
  // water-fill transition, then auto-dismisses — at which point the item
  // list, amount chips, and membership details fade in. A "Wallet Update" row
  // stays behind to reopen the same popup (now showing the settled state,
  // no animation) on demand.
  const checkScale   = useRef(new Animated.Value(0)).current;
  const contentFade  = useRef(new Animated.Value(0)).current;
  const ctaFade      = useRef(new Animated.Value(0)).current;
  const [gridSettled, setGridSettled]       = useState(false);
  const [gridAutoShown, setGridAutoShown]   = useState(false);
  const [gridModalVisible, setGridModalVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const hasGridData = !!sub && sub.originalWalletAmount != null && sub.consumptionPercentage != null;

  useEffect(() => {
    Animated.spring(checkScale, {
      toValue: 1, tension: 75, friction: 7, useNativeDriver: true,
    }).start();

    notify({
      type: 'success',
      title: 'Redemption Approved',
      message: 'Your items are ready — enjoy!',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // First time subscription data resolves: either pop the grid open (it'll
  // auto-dismiss once settled, via handleGridSettled below) or, for a
  // historical subscription with no consumption data, skip straight to
  // revealing the rest of the screen.
  useEffect(() => {
    if (!sub || gridAutoShown) return;
    setGridAutoShown(true);
    if (hasGridData) {
      openGridModal();
    } else {
      setGridSettled(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, gridAutoShown, hasGridData]);

  // Safety net: only for the case subscription data never resolves at all
  // (e.g. a network failure) — the popup's own countdown (up to ~11s: fill
  // animation + 10s hold) already governs the normal path, so this must stay
  // well clear of that or it'd reveal content while the popup is still open.
  useEffect(() => {
    if (gridAutoShown) return;
    const fallback = setTimeout(() => {
      setGridAutoShown(true);
      setGridSettled(true);
    }, 15000);
    return () => clearTimeout(fallback);
  }, [gridAutoShown]);

  useEffect(() => {
    if (!gridSettled) return;
    Animated.parallel([
      Animated.timing(contentFade, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(ctaFade,     { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [gridSettled, contentFade, ctaFade]);

  // Fires once the popup's grid has finished animating (or, on a reopen,
  // immediately since there's nothing left to animate to) — holds the
  // settled state on screen for a visible 5‑4‑3‑2‑1 countdown before
  // dismissing, so the user has a clear, unhurried moment to read it.
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearCountdown() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }
  useEffect(() => clearCountdown, []);

  function closeGridModal() {
    clearCountdown();
    setCountdown(null);
    setGridModalVisible(false);
    setGridSettled(true);
  }

  function openGridModal() {
    clearCountdown();
    setCountdown(null);
    setGridModalVisible(true);
  }

  function handleGridSettled() {
    clearCountdown();
    setCountdown(GRID_AUTO_DISMISS_SECONDS);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev == null || prev <= 1) {
          clearCountdown();
          closeGridModal();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

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

        {/* ── Wallet Update — reopens the grid popup; hidden for historical
             subscriptions with no originalWalletAmount snapshot. ────────── */}
        {hasGridData && (
          <Animated.View style={[styles.block, { opacity: contentFade }]}>
            <Pressable
              style={({ pressed }) => [styles.walletTapRow, pressed && styles.walletTapRowPressed]}
              onPress={openGridModal}
            >
              <View style={styles.walletTapIconWrap}>
                <Wallet size={16} color={C.success} strokeWidth={2} />
              </View>
              <View style={styles.walletTapTextWrap}>
                <Text style={styles.walletTapTitle}>Wallet Update</Text>
                <Text style={styles.walletTapSub}>
                  {fmtPct(sub!.consumptionPercentage!)} used · Tap to view
                </Text>
              </View>
              <ChevronRight size={18} color={C.muted} strokeWidth={2} />
            </Pressable>
          </Animated.View>
        )}

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

      {/* ── Wallet grid popup ──────────────────────────────────────────
          Mounting WalletConsumptionGrid only while visible means every
          open — the automatic post-approval one and every later reopen via
          the "Wallet Update" row — starts a fresh instance: the very first
          open shows the old→new animation (the subscription query's cached
          pre-approval value renders first, then animates to the refetched
          one), while a reopen after that has nothing left to animate to and
          just shows the current state directly. */}
      <Modal
        visible={gridModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeGridModal}
      >
        <View style={styles.modalBackdrop} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={closeGridModal} />
        </View>
        <View style={styles.modalWrap} pointerEvents="box-none">
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Wallet Update</Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={closeGridModal}
                hitSlop={8}
              >
                <X size={18} color={C.secondary} strokeWidth={2} />
              </Pressable>
            </View>
            {gridModalVisible && (
              <WalletConsumptionGrid
                originalWalletAmount={sub?.originalWalletAmount}
                walletBalance={sub?.walletBalance ?? 0}
                consumedAmount={sub?.consumedAmount}
                consumptionPercentage={sub?.consumptionPercentage}
                totalCells={sub ? getSubscriptionValidityDays(sub) : undefined}
                onSettled={handleGridSettled}
              />
            )}
            {countdown != null && (
              <View style={styles.modalCountdownRow}>
                <View style={styles.modalCountdownBadge}>
                  <Text style={styles.modalCountdownNumber}>{countdown}</Text>
                </View>
                <Text style={styles.modalCountdownText}>Closing automatically…</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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

  // ── Wallet Update row (reopens the grid popup) ────────────────────────────
  walletTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  walletTapRowPressed: {
    opacity: 0.7,
  },
  walletTapIconWrap: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: C.successSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  walletTapTextWrap: { flex: 1, gap: 2 },
  walletTapTitle: {
    fontSize: 13, fontFamily: ManropeWeights.bold, color: C.primary,
  },
  walletTapSub: {
    fontSize: 12, fontFamily: ManropeWeights.medium, color: C.secondary,
  },

  // ── Wallet grid popup ──────────────────────────────────────────────────
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.35, shadowRadius: 32 },
      android: { elevation: 16 },
    }),
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15, fontFamily: ManropeWeights.bold, color: C.primary, letterSpacing: -0.2,
  },
  modalCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  modalCountdownBadge: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCountdownNumber: {
    fontSize: 12, fontFamily: ManropeWeights.bold, color: C.primary,
  },
  modalCountdownText: {
    fontSize: 12, fontFamily: ManropeWeights.medium, color: C.secondary,
  },
});
