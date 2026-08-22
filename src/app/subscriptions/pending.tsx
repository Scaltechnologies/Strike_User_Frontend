import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
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
import { AlertTriangle, ArrowLeft, Clock, Receipt, ShoppingBag, Smartphone, Wallet, XCircle } from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import {
  getRedemptionCreatedAtMs,
  useCancelRedemption,
  useRedemptionDetail,
  redemptionKeys,
} from '@/hooks/useRedemptions';
import { subscriptionKeys } from '@/hooks/useSubscriptions';
import { useAuthStore } from '@/store/authStore';
import { ROUTES, buildRoute } from '@/constants/routes';
import { ManropeWeights } from '@/constants/theme';
import type { RedemptionItem } from '@/types/redemption';
// ── Design tokens ──────────────────────────────────────────────────────────────

const C = {
  accent:      '#D63527',
  accentSoft:  '#FEF2EF',
  bg:          '#F2F2F7',
  surface:     '#FFFFFF',
  border:      '#E8E8ED',
  primary:     '#0D0D0D',
  secondary:   '#6C6C6C',
  muted:       '#AEAEB2',
  warning:     '#FF9500',
  warningSoft: '#FFF5E0',
  warningDark: '#7A4500',
  success:     '#34C759',
  info:        '#2563EB',
  infoSoft:    '#EEF4FF',
  skeleton:    '#E5E5EA',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

function fmtRequestId(id: number): string {
  return `#${String(id).padStart(6, '0')}`;
}

// See getRedemptionCreatedAtMs — redemption-service's createdAt has no
// reliable timezone marker, so this takes an already-resolved ms timestamp
// rather than parsing an ISO string directly.
function fmtTime(atMs: number): string {
  const d       = new Date(atMs);
  const now     = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ds      = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const time    = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ds === todayMs) return `Today · ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ` · ${time}`;
}

// ── Fade + slide entrance — staggers each section in as data resolves ─────────

function FadeInSection({ index, style, children }: { index: number; style?: object; children: React.ReactNode }) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        delay: 90 + index * 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: 90 + index * 70,
        useNativeDriver: true,
        damping: 16,
        stiffness: 200,
        mass: 0.6,
      }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ── Spinning arc loader behind the clock — continuous "in progress" cue ───────

function RingLoader({ size }: { size: number }) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [rotate]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const r = size / 2 - 3;
  const circumference = 2 * Math.PI * r;

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={C.warning}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.26} ${circumference * 0.74}`}
        />
      </Svg>
    </Animated.View>
  );
}

// ── Status orb — spinning ring + breathing core ────────────────────────────────

const ORB_SIZE = 108;

function StatusOrb() {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);

  return (
    <View style={styles.orbWrap}>
      <View style={styles.orbRingLayer}>
        <RingLoader size={ORB_SIZE} />
      </View>
      <Animated.View style={[styles.orbCore, { transform: [{ scale }] }]}>
        <Clock size={26} color={C.warning} strokeWidth={1.8} />
      </Animated.View>
    </View>
  );
}

// ── Live badge — reassures the user this screen is actively polling ───────────

function LiveBadge() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <View style={styles.liveBadge}>
      <Animated.View style={[styles.liveDot, { opacity }]} />
      <Text style={styles.liveText}>Auto-updating</Text>
    </View>
  );
}

// ── Section header — icon badge + title, replaces the plain uppercase label ───

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIconWrap}>{icon}</View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Item list ──────────────────────────────────────────────────────────────────

function ItemsList({ items }: { items: RedemptionItem[] }) {
  return (
    <View style={styles.section}>
      <SectionHeader icon={<ShoppingBag size={14} color={C.accent} strokeWidth={2} />} title="Items Requested" />
      <View style={styles.sectionCard}>
        {items.map((item, idx) => (
          <View key={item.menuItemId} style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.menuItemName}
              {item.quantity > 1 ? ` ×${item.quantity}` : ''}
            </Text>
            <Text style={styles.itemTotal}>{fmt(item.totalPrice)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Cancel confirm dialog ─────────────────────────────────────────────────────

function CancelConfirmDialog({
  visible, loading, onDismiss, onConfirm,
}: {
  visible: boolean;
  loading: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const scale = useRef(new Animated.Value(0.86)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(bdOp, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 260, mass: 0.7 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bdOp, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.86, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={loading ? undefined : onDismiss} statusBarTranslucent>
      <Animated.View style={[styles.confirmBackdrop, { opacity: bdOp }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={loading ? undefined : onDismiss} />
      </Animated.View>

      <View style={styles.confirmWrap} pointerEvents="box-none">
        <Animated.View style={[styles.confirmCard, { opacity, transform: [{ scale }] }]}>
          <View style={styles.confirmIconWrap}>
            <XCircle size={24} color={C.accent} strokeWidth={2} />
          </View>

          <Text style={styles.confirmTitle}>Cancel this request?</Text>
          <Text style={styles.confirmMessage}>
            The vendor won't see this request anymore. You can submit a new one right away — useful if an item isn't available.
          </Text>

          <View style={styles.confirmActions}>
            <Pressable style={styles.confirmDismissBtn} onPress={onDismiss} disabled={loading}>
              <Text style={styles.confirmDismissText}>Keep waiting</Text>
            </Pressable>
            <Pressable style={styles.confirmDangerBtn} onPress={onConfirm} disabled={loading}>
              {loading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.confirmDangerText}>Cancel request</Text>
              }
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Error dialog — replaces the OS-native Alert to match the app's own UI ─────

function ErrorDialog({
  visible, title, message, onDismiss,
}: {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  const scale = useRef(new Animated.Value(0.86)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bdOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(bdOp, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 260, mass: 0.7 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bdOp, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.86, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onDismiss} statusBarTranslucent>
      <Animated.View style={[styles.confirmBackdrop, { opacity: bdOp }]} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      <View style={styles.confirmWrap} pointerEvents="box-none">
        <Animated.View style={[styles.confirmCard, { opacity, transform: [{ scale }] }]}>
          <View style={styles.confirmIconWrap}>
            <AlertTriangle size={24} color={C.warning} strokeWidth={2} />
          </View>

          <Text style={styles.confirmTitle}>{title}</Text>
          <Text style={styles.confirmMessage}>{message}</Text>

          <Pressable style={styles.errorOkBtn} onPress={onDismiss}>
            <Text style={styles.errorOkText}>OK</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PendingRedemptionScreen() {
  const { redemptionId, subId } = useLocalSearchParams<{
    redemptionId: string;
    subId: string;
  }>();

  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const userId      = useAuthStore((s) => s.userId);

  const [navigated, setNavigated] = useState(false);
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null);

  const { data: redemption, refetch } = useRedemptionDetail(redemptionId);
  const { mutate: cancelRedemption, isPending: isCancelling } = useCancelRedemption();

  // Invalidate subscription + history caches after a terminal status.
  const invalidateAfterResolution = useCallback(() => {
    if (subId) {
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(subId) });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.my(0) });
    }
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.byUser(userId) });
    }
    if (subId) {
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.bySubscription(subId) });
    }
  }, [queryClient, subId, userId]);

  // Navigate when status resolves.
  useEffect(() => {
    if (!redemption || navigated) return;

    if (redemption.status === 'APPROVED' || redemption.status === 'COMPLETED') {
      setNavigated(true);
      invalidateAfterResolution();
      router.replace({
        pathname: '/subscriptions/redemption-approved' as never,
        params: {
          redemptionId: String(redemption.id),
          subId:        subId ?? '',
        },
      } as never);
    } else if (redemption.status === 'REJECTED') {
      setNavigated(true);
      router.replace({
        pathname: '/subscriptions/rejected' as never,
        params: {
          redemptionId:  String(redemption.id),
          subId:         subId ?? '',
          reason:        redemption.rejectionReason ?? '',
        },
      } as never);
    }
  }, [redemption?.status, navigated, invalidateAfterResolution, redemption, router, subId]);

  // Poll every 5 seconds while PENDING.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!navigated) void refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch, navigated]);

  const handleConfirmCancel = useCallback(() => {
    if (!redemption) return;
    cancelRedemption(redemption.id, {
      onSuccess: () => {
        setNavigated(true);
        setCancelDialogVisible(false);
        invalidateAfterResolution();
        router.replace(
          subId
            ? (buildRoute.subscriptionSelect(subId) as never)
            : (ROUTES.TABS.HOME as never),
        );
      },
      onError: (err) => {
        setCancelDialogVisible(false);
        const axiosErr = err as { response?: { data?: { message?: string } } };
        const message = axiosErr.response?.data?.message
          ?? 'Something went wrong cancelling your request. Please try again.';
        setCancelErrorMessage(message);
        // The request may have already moved on (e.g. auto-expired to REJECTED,
        // or the vendor just approved/rejected it) — refetch so the screen
        // reflects reality instead of still claiming it's cancellable.
        void refetch();
      },
    });
  }, [redemption, cancelRedemption, invalidateAfterResolution, router, subId, refetch]);

  // The request is already submitted — going "back" into the select-items
  // flow would land on a stale screen with nothing useful to do. Send the
  // user to Home instead, where they can keep browsing; the persistent
  // PendingRedemptionBar stays reachable from anywhere to resume tracking.
  const handleBack = useCallback(() => {
    router.replace(ROUTES.TABS.HOME as never);
  }, [router]);

  // Same rule for the Android hardware/gesture back button, not just the
  // on-screen arrow.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={handleBack} hitSlop={12}>
          <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.topBarTitle}>Redemption Request</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status hero ──────────────────────────────────────────────────── */}
        <FadeInSection index={0} style={styles.heroCard}>
          <StatusOrb />
          <Text style={styles.heroTitle}>Request Submitted</Text>
          <Text style={styles.heroSub}>Waiting for store approval</Text>

          <View style={styles.heroBadgeRow}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Pending Approval</Text>
            </View>
            <LiveBadge />
          </View>

          <Pressable
            style={styles.cancelLink}
            onPress={() => setCancelDialogVisible(true)}
            disabled={!redemption}
            hitSlop={8}
          >
            <Text style={styles.cancelLinkText}>Item unavailable? Cancel request</Text>
          </Pressable>
        </FadeInSection>

        {/* ── Request details ───────────────────────────────────────────────── */}
        {redemption ? (
          <>
            {/* Request ID */}
            <FadeInSection index={1} style={styles.section}>
              <SectionHeader icon={<Receipt size={14} color={C.accent} strokeWidth={2} />} title="Request ID" />
              <View style={styles.sectionCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.requestId}>{fmtRequestId(redemption.id)}</Text>
                </View>
              </View>
            </FadeInSection>

            {/* Items */}
            <FadeInSection index={2}>
              <ItemsList items={redemption.items} />
            </FadeInSection>

            {/* Total + timestamp */}
            <FadeInSection index={3} style={styles.section}>
              <SectionHeader icon={<Wallet size={14} color={C.accent} strokeWidth={2} />} title="Summary" />
              <View style={styles.sectionCard}>
                <View style={[styles.summaryRow, styles.summaryRowBorder]}>
                  <Text style={styles.summaryLabel}>Total Requested</Text>
                  <Text style={styles.summaryValue}>{fmt(redemption.totalAmount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Submitted</Text>
                  <Text style={styles.summaryValue}>{fmtTime(getRedemptionCreatedAtMs(redemption))}</Text>
                </View>
              </View>
            </FadeInSection>

            {/* Instruction */}
            <FadeInSection index={4} style={styles.instructionCard}>
              <View style={styles.instructionIconWrap}>
                <Smartphone size={16} color={C.info} strokeWidth={2} />
              </View>
              <Text style={styles.instructionText}>
                Show this screen to the vendor. They'll approve your request and your items will be prepared.
              </Text>
            </FadeInSection>
          </>
        ) : (
          // Skeleton while first load
          <View style={styles.section}>
            <View style={[styles.skBone, { width: 80, height: 11, marginBottom: 12 }]} />
            <View style={styles.sectionCard}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.summaryRow, i < 2 && styles.summaryRowBorder]}>
                  <View style={[styles.skBone, { width: 100, height: 12 }]} />
                  <View style={[styles.skBone, { width: 70, height: 12 }]} />
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 + insets.bottom }} />
      </ScrollView>

      <CancelConfirmDialog
        visible={cancelDialogVisible}
        loading={isCancelling}
        onDismiss={() => setCancelDialogVisible(false)}
        onConfirm={handleConfirmCancel}
      />

      <ErrorDialog
        visible={!!cancelErrorMessage}
        title="Could not cancel"
        message={cancelErrorMessage ?? ''}
        onDismiss={() => setCancelErrorMessage(null)}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    minHeight: 52,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center',
  },
  topBarTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontFamily: ManropeWeights.semiBold,
    color: C.primary, letterSpacing: -0.2,
  },
  topBarSpacer: { width: 36 },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // ── Hero card ──────────────────────────────────────────────────────────────
  heroCard: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    paddingTop: 32,
    paddingBottom: 26,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: C.warningSoft,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: C.warning, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 20 },
      android: { elevation: 3 },
    }),
  },

  // Status orb
  orbWrap: {
    width: ORB_SIZE, height: ORB_SIZE,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 6,
  },
  orbRingLayer: {
    position: 'absolute',
  },
  orbCore: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },

  heroTitle: {
    fontSize: 22, fontFamily: ManropeWeights.extraBold,
    color: C.primary, letterSpacing: -0.6,
  },
  heroSub: {
    fontSize: 14, color: C.secondary, fontFamily: ManropeWeights.medium,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.surface,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20,
  },
  statusDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: C.warning,
  },
  statusText: {
    fontSize: 12, fontFamily: ManropeWeights.bold,
    color: C.warningDark, letterSpacing: 0.2,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  liveDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: C.success,
  },
  liveText: {
    fontSize: 11.5, fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },

  cancelLink: {
    marginTop: 4,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  cancelLinkText: {
    fontSize: 12.5, fontFamily: ManropeWeights.semiBold,
    color: C.accent, textDecorationLine: 'underline',
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 26, height: 26, borderRadius: 9,
    backgroundColor: C.accentSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13.5, fontFamily: ManropeWeights.bold,
    color: C.primary, letterSpacing: -0.1,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },

  // Request ID
  infoRow: {
    paddingHorizontal: 16, paddingVertical: 14,
  },
  requestId: {
    fontSize: 18, fontFamily: ManropeWeights.extraBold, color: C.primary, letterSpacing: -0.3,
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 12,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  itemName: {
    flex: 1, fontSize: 14, fontFamily: ManropeWeights.medium, color: C.primary, lineHeight: 20,
  },
  itemTotal: {
    fontSize: 14, fontFamily: ManropeWeights.bold, color: C.primary, flexShrink: 0,
  },

  // Summary rows
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  summaryRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
  summaryLabel: { fontSize: 14, color: C.secondary, fontFamily: ManropeWeights.medium },
  summaryValue: { fontSize: 14, color: C.primary, fontFamily: ManropeWeights.bold },

  // Instruction
  instructionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 16,
    backgroundColor: C.infoSoft,
    borderRadius: 16,
    padding: 16,
  },
  instructionIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: C.surface,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  instructionText: {
    flex: 1,
    fontSize: 13, color: C.secondary, lineHeight: 20, fontFamily: ManropeWeights.regular,
  },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skBone: {
    height: 13, width: '100%', borderRadius: 7, backgroundColor: C.skeleton,
  },

  // ── Cancel confirm dialog ─────────────────────────────────────────────────────
  confirmBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  confirmWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32,
  },
  confirmCard: {
    width: '100%', maxWidth: 340,
    backgroundColor: C.surface, borderRadius: 26,
    paddingTop: 28, paddingHorizontal: 24, paddingBottom: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.22, shadowRadius: 32 },
      android: { elevation: 16 },
    }),
  },
  confirmIconWrap: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: C.accentSoft,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 19, fontFamily: ManropeWeights.extraBold,
    color: C.primary, letterSpacing: -0.4,
    marginBottom: 8, textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 14, color: C.secondary, textAlign: 'center',
    lineHeight: 20, marginBottom: 24, fontFamily: ManropeWeights.regular,
  },
  confirmActions: {
    flexDirection: 'row', width: '100%',
  },
  confirmDismissBtn: {
    flex: 1, height: 50, marginRight: 10, borderRadius: 14,
    backgroundColor: C.bg,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
  },
  confirmDismissText: {
    fontSize: 15, fontFamily: ManropeWeights.bold, color: C.secondary,
  },
  confirmDangerBtn: {
    flex: 1, height: 50, borderRadius: 14,
    backgroundColor: C.accent,
    justifyContent: 'center', alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  confirmDangerText: {
    fontSize: 15, fontFamily: ManropeWeights.bold, color: '#FFFFFF',
  },
  errorOkBtn: {
    width: '100%', height: 50, borderRadius: 14,
    backgroundColor: C.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  errorOkText: {
    fontSize: 15, fontFamily: ManropeWeights.bold, color: '#FFFFFF',
  },
});
