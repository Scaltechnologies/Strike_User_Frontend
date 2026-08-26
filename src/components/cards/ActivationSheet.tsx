import { subscriptionApi } from '@/api/subscription.api';
import { PayAtStoreInfoCard } from '@/components/payment/PayAtStoreInfoCard';
import { FadeInView } from '@/components/ui/FadeInView';
import { ManropeWeights } from '@/constants/theme';
import { useValidateCoupon } from '@/hooks/useCoupons';
import { useCancelPayment, useCreatePayment, useVerifyPayment } from '@/hooks/usePayments';
import { usePayAtStoreSessionStore } from '@/store/payAtStoreSessionStore';
import type { CardDefinition } from '@/types/card';
import type { ValidateCouponResponse } from '@/types/coupon';
import type { PaymentResponse, RazorpayCheckoutResult } from '@/types/payment';
import type { MenuCategory } from '@/types/store';
import type { Subscription } from '@/types/subscription';
import { CARD_SHINE, getCardColorTheme } from '@/utils/cardColorTheme';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  BadgePercent,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  Layers,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { RazorpayCheckout } from './RazorpayCheckout';
import { CC, formatCardPrice } from './theme';

const DISCOUNT_GREEN = '#1F8A4C';
const DISCOUNT_GREEN_SOFT = '#EAF7EF';

const C = CC;

function extractApiError(err: unknown): string {
  const resp = (err as { response?: { data?: { message?: string } } })?.response;
  if (resp?.data?.message) return resp.data.message;
  const code = (err as { code?: string })?.code;
  if (code === 'ERR_NETWORK' || code === 'NETWORK_ERROR') {
    return 'Network error. Check your connection and try again.';
  }
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 409) return 'You already have an active membership for this card.';
  if (status === 400) return 'This membership plan is no longer available.';
  if (status === 401) return 'Session expired. Please log in again.';
  return 'Something went wrong. Please try again.';
}

// Coupon validation gets its own extractor: 400/409/422 map to "bad code"
// wording, and unclassified/5xx errors don't leak raw backend text (e.g.
// "An unexpected error occurred") to the user.
function extractCouponError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code === 'ERR_NETWORK' || code === 'NETWORK_ERROR') {
    return 'Network error. Check your connection and try again.';
  }
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 404) return "This coupon code doesn't exist.";
  if (status === 400 || status === 409 || status === 422) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data
      ?.message;
    return message || 'This coupon code is invalid or has expired.';
  }
  return "Couldn't validate this coupon right now. Please try again.";
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({
  icon: Icon,
  label,
  value,
  highlight,
  isGold,
  isDiscount,
  isLast,
  wrap,
}: {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  highlight?: boolean;
  isGold?: boolean;
  isDiscount?: boolean;
  isLast?: boolean;
  wrap?: boolean;
}) {
  const iconColor = isDiscount ? DISCOUNT_GREEN : isGold ? CC.gold : highlight ? C.accent : C.secondary;
  return (
    <View style={[styles.summaryRow, !isLast && styles.summaryRowBorder, wrap && styles.summaryRowWrap]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: `${iconColor}18` }]}>
        <Icon size={15} color={iconColor} strokeWidth={2.2} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          highlight && styles.summaryValueAccent,
          isGold && styles.summaryValueGold,
          isDiscount && styles.summaryValueDiscount,
          wrap && styles.summaryValueWrap,
        ]}
        numberOfLines={wrap ? 3 : 1}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Payment method segment ───────────────────────────────────────────────────────
// A sliding-indicator segmented control (the classic iOS-style toggle): a single white
// pill glides between the two options on a spring, instead of each option independently
// swapping its own background. Reads as noticeably smoother than a per-pill color flip.

const SEGMENT_PADDING = 3;
const SEGMENT_GAP = 4;

function PaymentMethodSegment({
  selected,
  onSelectOnline,
  onSelectStore,
  disabled,
}: {
  selected: 'ONLINE' | 'PAY_AT_STORE';
  onSelectOnline: () => void;
  onSelectStore: () => void;
  disabled?: boolean;
}) {
  const [segmentWidth, setSegmentWidth] = useState(0);
  const progress = useSharedValue(selected === 'PAY_AT_STORE' ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(selected === 'PAY_AT_STORE' ? 1 : 0, { damping: 16, stiffness: 180 });
  }, [selected, progress]);

  const innerWidth = segmentWidth > 0 ? segmentWidth - SEGMENT_PADDING * 2 : 0;
  const pillWidth = innerWidth > 0 ? (innerWidth - SEGMENT_GAP) / 2 : 0;
  const travel = pillWidth + SEGMENT_GAP;

  const indicatorStyle = useAnimatedStyle(() => ({
    width: pillWidth,
    borderColor: interpolateColor(progress.value, [0, 1], [C.accent, C.gold]),
    transform: [{ translateX: progress.value * travel }],
  }));

  const onlineTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [C.accent, C.secondary]),
  }));
  const storeTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [C.secondary, C.gold]),
  }));

  function selectOnline() {
    if (selected !== 'ONLINE') void Haptics.selectionAsync();
    onSelectOnline();
  }
  function selectStore() {
    if (selected !== 'PAY_AT_STORE') void Haptics.selectionAsync();
    onSelectStore();
  }

  return (
    <View
      style={styles.paymentMethodSegment}
      onLayout={(e) => setSegmentWidth(e.nativeEvent.layout.width)}
    >
      {pillWidth > 0 && <Reanimated.View style={[styles.segmentIndicator, indicatorStyle]} />}

      <Pressable style={styles.paymentChoice} onPress={selectOnline} disabled={disabled} hitSlop={4}>
        <Zap size={15} color={selected === 'ONLINE' ? C.accent : C.secondary} strokeWidth={2.2} />
        <Reanimated.Text style={[styles.paymentChoiceText, onlineTextStyle]}>Online</Reanimated.Text>
      </Pressable>

      <Pressable style={styles.paymentChoice} onPress={selectStore} disabled={disabled} hitSlop={4}>
        <Store size={15} color={selected === 'PAY_AT_STORE' ? C.gold : C.secondary} strokeWidth={2.2} />
        <Reanimated.Text style={[styles.paymentChoiceText, storeTextStyle]}>At store</Reanimated.Text>
      </Pressable>
    </View>
  );
}

// ── Activation sheet ──────────────────────────────────────────────────────────

export interface ActivationSheetProps {
  visible: boolean;
  onClose: () => void;
  card: CardDefinition;
  storeName: string | undefined;
  menuCategories: MenuCategory[];
  onSuccess: (sub: Subscription) => void;
}

export function ActivationSheet({
  visible,
  onClose,
  card,
  storeName,
  menuCategories,
  onSuccess,
}: ActivationSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sheetStep, setSheetStep] = useState<'summary' | 'payAtStoreInfo'>('summary');
  const [selectedMethod, setSelectedMethod] = useState<'ONLINE' | 'PAY_AT_STORE'>('ONLINE');
  const { mutateAsync: createPayment, isPending: creatingPayment } = useCreatePayment();
  const { mutateAsync: verifyPayment } = useVerifyPayment();
  const { mutateAsync: cancelPayment } = useCancelPayment();
  const { mutateAsync: validateCoupon, isPending: validatingCoupon } = useValidateCoupon();
  const busy = creatingPayment || finalizing;
  const router = useRouter();
  const addPayAtStoreSession = usePayAtStoreSessionStore((s) => s.addSession);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const shineAnim = useRef(new Animated.Value(-1)).current;
  const scrollRef = useRef<ScrollView>(null);

  const [showCouponInput, setShowCouponInput] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<ValidateCouponResponse | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setError(null);
      setShowCouponInput(false);
      setCouponCode('');
      setAppliedCoupon(null);
      setCouponError(null);
      setPayment(null);
      setCheckoutVisible(false);
      setFinalizing(false);
      setSheetStep('summary');
      setSelectedMethod('ONLINE');
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, slideAnim]);

  useEffect(() => {
    if (!visible) return;

    shineAnim.setValue(-1);
    const loop = Animated.loop(
      Animated.timing(shineAnim, {
        toValue: 1,
        duration: 2600,
        useNativeDriver: true,
      }),
    );
    loop.start();

    return () => loop.stop();
  }, [visible, shineAnim]);

  const shineTranslateX = shineAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-240, 240],
  });

  const hasBonus = card.bonusAmount > 0;
  const cardTheme = getCardColorTheme(card.name);
  const eligibleCategories = menuCategories.filter((cat) =>
    (card.categoryIds ?? []).includes(cat.id),
  );
  const itemCount = card.eligibleMenuItemIds?.length ?? 0;
  const payAmount = appliedCoupon ? appliedCoupon.finalAmount : card.cardPrice;

  async function handleApplyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    try {
      const result = await validateCoupon({ code, cardDefinitionId: card.id });
      setAppliedCoupon(result);
    } catch (err) {
      setAppliedCoupon(null);
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      console.log('❌ Coupon validate failed:', {
        status: axiosErr.response?.status,
        data: axiosErr.response?.data,
        message: axiosErr.message,
      });
      setCouponError(extractCouponError(err));
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError(null);
  }

  // Opens Razorpay checkout for a fresh gateway order. The subscription is
  // only ever minted server-side after handleCheckoutSuccess's verify call
  // is cryptographically confirmed — this call never activates anything.
  async function handlePay() {
    setError(null);
    try {
      const result = await createPayment({
        body: {
          cardDefinitionId: card.id,
          storeId: card.storeId,
          ...(appliedCoupon && { couponCode: appliedCoupon.code }),
        },
        idempotencyKey: `${card.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      if (result.status === 'SUCCESS' && result.subscriptionId) {
        // Idempotent replay of an already-completed payment — nothing left to pay.
        await finalizeSuccess(result.subscriptionId);
        return;
      }

      if (!result.gatewayOrderId || !result.gatewayKeyId) {
        setError('Could not start checkout. Please try again.');
        return;
      }

      setPayment(result);
      setCheckoutVisible(true);
    } catch (err) {
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      console.log('❌ Payment creation failed:', {
        status: axiosErr.response?.status,
        data: axiosErr.response?.data,
        message: axiosErr.message,
      });
      setError(extractApiError(err));
    }
  }

  // Creates a PAY_AT_STORE payment session and hands off to the dedicated waiting/status
  // screen, which owns the QR/code display, polling, and every terminal state from here.
  // Mirrors handlePay's create-time error handling; never opens Razorpay.
  async function handlePayAtStore() {
    setError(null);
    try {
      const result = await createPayment({
        body: {
          cardDefinitionId: card.id,
          storeId: card.storeId,
          paymentMethod: 'PAY_AT_STORE',
          ...(appliedCoupon && { couponCode: appliedCoupon.code }),
        },
        idempotencyKey: `${card.id}-pas-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      if (result.status === 'SUCCESS' && result.subscriptionId) {
        // Idempotent replay of an already-completed payment — nothing left to pay.
        await finalizeSuccess(result.subscriptionId);
        return;
      }

      if (!result.qrPayload || !result.verificationCode) {
        setError('Could not start in-store payment. Please try again.');
        return;
      }

      // qrPayload/verificationCode are returned ONLY on this create response — persist them
      // now, or they're unrecoverable if the app is killed before the waiting screen is seen.
      // Also makes the payment reachable again from the persistent tracker bar (see
      // PayAtStorePendingBar) if the user backs out of the waiting screen without cancelling.
      addPayAtStoreSession({
        paymentId: result.paymentId,
        cardDefinitionId: card.id,
        storeId: card.storeId,
        couponCode: appliedCoupon?.code,
        cardName: card.name,
        amount: result.amount,
        qrPayload: result.qrPayload,
        verificationCode: result.verificationCode,
        createdAtMs: Date.now(),
      });

      onClose();
      router.push({
        pathname: '/pay-at-store/[paymentId]',
        params: {
          paymentId: String(result.paymentId),
          cardDefinitionId: String(card.id),
          storeId: String(card.storeId),
          couponCode: appliedCoupon?.code ?? '',
          cardName: card.name,
          amount: String(result.amount),
          qrPayload: result.qrPayload,
          verificationCode: result.verificationCode,
        },
      } as never);
    } catch (err) {
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      console.log('❌ Pay-at-Store payment creation failed:', {
        status: axiosErr.response?.status,
        data: axiosErr.response?.data,
        message: axiosErr.message,
      });
      setError(extractApiError(err));
    }
  }

  async function finalizeSuccess(subscriptionId: number) {
    try {
      const sub = await subscriptionApi.getById(subscriptionId);
      onSuccess(sub);
    } catch {
      setError(
        'Payment succeeded but we couldn’t load your membership. Check My Cards — it should already be there.',
      );
    }
  }

  async function handleCheckoutSuccess(result: RazorpayCheckoutResult) {
    setCheckoutVisible(false);
    if (!payment) return;
    setFinalizing(true);
    try {
      const verified = await verifyPayment({
        paymentId: payment.paymentId,
        body: {
          gatewayOrderId: result.razorpay_order_id,
          gatewayPaymentId: result.razorpay_payment_id,
          gatewaySignature: result.razorpay_signature,
        },
      });
      if (verified.status === 'SUCCESS' && verified.subscriptionId) {
        await finalizeSuccess(verified.subscriptionId);
      } else {
        setError('Your payment is still being confirmed. Check My Cards in a moment.');
      }
    } catch (err) {
      console.log('❌ Payment verification failed:', err);
      setError(extractApiError(err));
    } finally {
      setFinalizing(false);
      setPayment(null);
    }
  }

  function handleCheckoutFailed(reason: string) {
    setCheckoutVisible(false);
    setError(reason);
    if (payment) void cancelPayment(payment.paymentId).catch(() => {});
    setPayment(null);
  }

  function handleCheckoutDismiss() {
    setCheckoutVisible(false);
    if (payment) void cancelPayment(payment.paymentId).catch(() => {});
    setPayment(null);
  }

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [60, 0],
  });

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={!busy ? onClose : undefined}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={!busy ? onClose : undefined}
        />

        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.sheetEyebrow}>MEMBERSHIP</Text>
              <Text style={styles.sheetTitle}>Activate Membership</Text>
            </View>
            {!busy && (
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
                <X size={18} color={C.secondary} strokeWidth={2.5} />
              </Pressable>
            )}
          </View>

          {/* Scrollable body */}
          <ScrollView
            ref={scrollRef}
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {sheetStep === 'payAtStoreInfo' ? (
              <FadeInView translateYFrom={10}>
                <PayAtStoreInfoCard
                  amount={payAmount}
                  busy={busy}
                  onConfirm={() => void handlePayAtStore()}
                  onBack={() => setSheetStep('summary')}
                />
              </FadeInView>
            ) : (
            <>
            {/* Mini card preview — same canonical color/gradient/text-contrast
                theme as My Cards, Card Details, Membership and Vendor Available Cards */}
            <FadeInView translateYFrom={12} delay={0}>
              <LinearGradient
                colors={cardTheme.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.miniCard}
              >
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.miniCardShine,
                    { transform: [{ translateX: shineTranslateX }, { rotate: '18deg' }] },
                  ]}
                >
                  <LinearGradient
                    colors={CARD_SHINE}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
                <Text style={[styles.miniCardStore, { color: cardTheme.textSecondary }]} numberOfLines={1}>
                  {storeName ?? `Store #${card.storeId}`}
                </Text>
                <Text style={[styles.miniCardName, { color: cardTheme.textPrimary }]} numberOfLines={2}>
                  {card.name}
                </Text>
                <View style={styles.miniCardRow}>
                  <View>
                    <Text style={[styles.miniCardMetaLabel, { color: cardTheme.textMuted }]}>Wallet Credit</Text>
                    <Text style={[styles.miniCardBalance, { color: cardTheme.textPrimary }]}>
                      {formatCardPrice(card.walletAmount)}
                    </Text>
                  </View>
                  {hasBonus && (
                    <View style={[styles.miniCardBonusPill, { backgroundColor: cardTheme.chipBg }]}>
                      <Text style={[styles.miniCardBonusText, { color: cardTheme.textPrimary }]}>
                        +{formatCardPrice(card.bonusAmount)} bonus
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[styles.miniCircle1, { backgroundColor: cardTheme.decor1 }]} pointerEvents="none" />
                <View style={[styles.miniCircle2, { backgroundColor: cardTheme.decor2 }]} pointerEvents="none" />
              </LinearGradient>
            </FadeInView>

            {/* Membership details */}
            <FadeInView translateYFrom={12} delay={70}>
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeading}>
                  <View style={styles.sectionHeadingRow}>
                    <View style={styles.sectionIconWrap}>
                      <Sparkles size={13} color={C.accent} strokeWidth={2.4} />
                    </View>
                    <View style={styles.sectionHeadingTextWrap}>
                      <Text style={styles.sectionTitle}>What you’re getting</Text>
                      <Text style={styles.sectionSubtitle}>
                        Your membership benefits and coverage
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.summaryCard}>
                  <SummaryRow
                    icon={CreditCard}
                    label="Membership price"
                    value={
                      appliedCoupon
                        ? `${formatCardPrice(card.cardPrice)}  →  ${formatCardPrice(appliedCoupon.finalAmount)}`
                        : formatCardPrice(card.cardPrice)
                    }
                    highlight
                  />

                  {appliedCoupon && (
                    <SummaryRow
                      icon={BadgePercent}
                      label="Coupon discount"
                      value={`-${formatCardPrice(appliedCoupon.discountApplied)}`}
                      isDiscount
                    />
                  )}

                  <SummaryRow
                    icon={Clock}
                    label="Validity"
                    value={`${card.validityInDays} days from activation`}
                  />

                  {eligibleCategories.length > 0 && (
                    <SummaryRow
                      icon={Layers}
                      label="Eligible categories"
                      value={eligibleCategories.map((c) => c.name).join(', ')}
                      wrap
                    />
                  )}

                  {itemCount > 0 ? (
                    <SummaryRow
                      icon={ShoppingBag}
                      label="Eligible items"
                      value={`${itemCount} items`}
                      isLast
                    />
                  ) : eligibleCategories.length > 0 ? (
                    <SummaryRow
                      icon={ShoppingBag}
                      label="Eligible items"
                      value="All items in eligible categories"
                      isLast
                    />
                  ) : (
                    <SummaryRow
                      icon={ShoppingBag}
                      label="Coverage"
                      value="All items at this store"
                      isLast
                    />
                  )}
                </View>
              </View>
            </FadeInView>

            {/* Coupon */}
            <FadeInView translateYFrom={12} delay={130}>
              {appliedCoupon ? (
                <View style={styles.couponApplied}>
                  <View style={styles.couponAppliedIcon}>
                    <Check size={14} color={DISCOUNT_GREEN} strokeWidth={3} />
                  </View>
                  <View style={styles.couponAppliedTextWrap}>
                    <Text style={styles.couponAppliedCode}>{appliedCoupon.code} applied</Text>
                    <Text style={styles.couponAppliedSavings}>
                      You saved {formatCardPrice(appliedCoupon.discountApplied)}
                    </Text>
                  </View>
                  <Pressable onPress={handleRemoveCoupon} hitSlop={10}>
                    <X size={16} color={C.muted} strokeWidth={2.5} />
                  </Pressable>
                </View>
              ) : showCouponInput ? (
                <View style={styles.couponInputCard}>
                  <View style={styles.couponInputRow}>
                    <TextInput
                      style={styles.couponInput}
                      value={couponCode}
                      onChangeText={(t) => {
                        setCouponCode(t);
                        if (couponError) setCouponError(null);
                      }}
                      onFocus={() => {
                        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
                      }}
                      placeholder="Enter coupon code"
                      placeholderTextColor={C.muted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!validatingCoupon}
                      returnKeyType="done"
                      onSubmitEditing={() => void handleApplyCoupon()}
                    />
                    <Pressable
                      style={[styles.couponApplyBtn, (!couponCode.trim() || validatingCoupon) && styles.couponApplyBtnDisabled]}
                      onPress={() => void handleApplyCoupon()}
                      disabled={!couponCode.trim() || validatingCoupon}
                    >
                      {validatingCoupon ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.couponApplyBtnText}>Apply</Text>
                      )}
                    </Pressable>
                  </View>
                  {couponError ? <Text style={styles.couponErrorText}>{couponError}</Text> : null}
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.couponToggle, pressed && styles.couponTogglePressed]}
                  onPress={() => {
                    setShowCouponInput(true);
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
                  }}
                >
                  <View style={styles.couponToggleIcon}>
                    <Tag size={14} color={C.accent} strokeWidth={2.2} />
                  </View>
                  <View style={styles.couponToggleTextWrap}>
                    <Text style={styles.couponToggleText}>Have a coupon code?</Text>
                    <Text style={styles.couponToggleSubtext}>Apply it before payment</Text>
                  </View>
                  <ChevronRight size={15} color={C.muted} strokeWidth={2.2} />
                </Pressable>
              )}
            </FadeInView>

            {/* Error */}
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}
            </>
            )}
          </ScrollView>

          {/* Compact payment footer */}
          {sheetStep === 'summary' && (
            <SafeAreaView edges={['bottom']} style={styles.sheetActions}>
              <FadeInView translateYFrom={16} delay={160}>
                <View style={styles.paymentFooter}>
                  <View style={styles.paymentFooterTop}>
                    <PaymentMethodSegment
                      selected={selectedMethod}
                      onSelectOnline={() => setSelectedMethod('ONLINE')}
                      onSelectStore={() => setSelectedMethod('PAY_AT_STORE')}
                      disabled={busy}
                    />

                    <View style={styles.footerTotal}>
                      <Text style={styles.footerTotalLabel}>TOTAL</Text>
                      <Text style={styles.footerTotalValue}>
                        {formatCardPrice(payAmount)}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.payBtn,
                      pressed && styles.payBtnPressed,
                      busy && styles.payBtnBusy,
                    ]}
                    onPress={() => {
                      if (busy) return;
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (selectedMethod === 'ONLINE') {
                        void handlePay();
                      } else {
                        setSheetStep('payAtStoreInfo');
                      }
                    }}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <>
                        <Text style={styles.payBtnText} numberOfLines={1}>
                          Continue
                        </Text>
                        <ChevronRight size={18} color="#FFF" strokeWidth={2.6} />
                      </>
                    )}
                  </Pressable>

                  <Text style={styles.secureHint}>
                    {selectedMethod === 'ONLINE'
                      ? 'UPI · Cards · Netbanking'
                      : 'Pay securely when you visit the store'}
                  </Text>

                  {!busy && (
                    <Pressable style={styles.cancelBtn} onPress={onClose}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                  )}
                </View>
              </FadeInView>
            </SafeAreaView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>

    {payment && (
      <RazorpayCheckout
        visible={checkoutVisible}
        keyId={payment.gatewayKeyId ?? ''}
        orderId={payment.gatewayOrderId ?? ''}
        amount={payment.amount}
        currency={payment.currency}
        name={card.name}
        description={storeName ? `${card.name} — ${storeName}` : card.name}
        onSuccess={(result) => void handleCheckoutSuccess(result)}
        onFailed={handleCheckoutFailed}
        onDismiss={handleCheckoutDismiss}
      />
    )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'flex-end',
  },

  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    height: '93%',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.18,
        shadowRadius: 28,
      },
      android: { elevation: 24 },
    }),
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 4,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 17,
    backgroundColor: C.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerTextWrap: { flex: 1 },
  sheetEyebrow: {
    fontSize: 9,
    fontFamily: ManropeWeights.bold,
    color: C.accent,
    letterSpacing: 1.45,
    marginBottom: 3,
  },
  sheetTitle: {
    fontSize: 21,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.6,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheetScroll: { flex: 1 },
  sheetContent: {
    paddingHorizontal: 22,
    paddingTop: 19,
    paddingBottom: 32,
    gap: 24,
  },

  miniCard: {
    minHeight: 184,
    borderRadius: 24,
    padding: 21,
    overflow: 'hidden',
    justifyContent: 'space-between',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.13,
        shadowRadius: 18,
      },
      android: { elevation: 5 },
    }),
  },
  miniCardShine: {
    position: 'absolute',
    width: 100,
    height: '180%',
    top: '-40%',
    left: '43%',
    opacity: 0.17,
  },
  miniCardStore: {
    fontSize: 9.5,
    fontFamily: ManropeWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.05,
  },
  miniCardName: {
    fontSize: 22,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.65,
    marginTop: 4,
  },
  miniCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  miniCardMetaLabel: {
    fontSize: 9,
    fontFamily: ManropeWeights.bold,
    letterSpacing: 0.8,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  miniCardBalance: {
    fontSize: 31,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -1.15,
  },
  miniCardBonusPill: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  miniCardBonusText: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.bold,
  },
  miniCircle1: {
    position: 'absolute',
    width: 155,
    height: 155,
    borderRadius: 78,
    top: -58,
    right: -45,
    opacity: 0.40,
  },
  miniCircle2: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    bottom: -17,
    right: 98,
    opacity: 0.26,
  },

  sectionBlock: { gap: 13 },
  sectionHeading: { paddingHorizontal: 1 },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeadingTextWrap: { flex: 1 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    marginTop: 4,
  },

  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
    }),
  },
  summaryRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    gap: 14,
  },
  summaryRowWrap: {
    alignItems: 'flex-start',
    minHeight: 72,
    paddingVertical: 16,
  },
  summaryRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  summaryIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    flex: 1,
    fontSize: 14,
    color: C.secondary,
    fontFamily: ManropeWeights.medium,
  },
  summaryValue: {
    fontSize: 14.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '59%',
    lineHeight: 21,
  },
  summaryValueAccent: {
    color: C.accent,
    fontFamily: ManropeWeights.bold,
  },
  summaryValueGold: { color: CC.gold },
  summaryValueDiscount: {
    color: DISCOUNT_GREEN,
    fontFamily: ManropeWeights.bold,
  },
  summaryValueWrap: {
    textAlign: 'right',
    fontFamily: ManropeWeights.regular,
    fontSize: 12.5,
    lineHeight: 18,
  },

  couponToggle: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 17,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  couponTogglePressed: { opacity: 0.75 },
  couponToggleIcon: {
    width: 37,
    height: 37,
    borderRadius: 13,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponToggleTextWrap: { flex: 1 },
  couponToggleText: {
    fontSize: 13.5,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
  },
  couponToggleSubtext: {
    fontSize: 10.5,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    marginTop: 2,
  },
  couponInputCard: {
    backgroundColor: C.surface,
    borderRadius: 17,
    padding: 13,
    gap: 9,
    borderWidth: 1,
    borderColor: C.border,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 9,
  },
  couponInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 13,
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.5,
    color: C.primary,
  },
  couponApplyBtn: {
    minWidth: 82,
    backgroundColor: C.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponApplyBtnDisabled: { opacity: 0.4 },
  couponApplyBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontFamily: ManropeWeights.bold,
  },
  couponErrorText: {
    fontSize: 12,
    color: C.accent,
    fontFamily: ManropeWeights.medium,
  },
  couponApplied: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: DISCOUNT_GREEN_SOFT,
    borderRadius: 17,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CDEBD8',
  },
  couponAppliedIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponAppliedTextWrap: { flex: 1 },
  couponAppliedCode: {
    fontSize: 13.5,
    fontFamily: ManropeWeights.bold,
    color: DISCOUNT_GREEN,
    letterSpacing: 0.25,
  },
  couponAppliedSavings: {
    fontFamily: ManropeWeights.regular,
    fontSize: 11.5,
    color: C.secondary,
    marginTop: 2,
  },

  errorBanner: {
    backgroundColor: '#FEF0EE',
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F8D5D0',
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  errorBannerText: {
    fontSize: 12.5,
    color: '#C0261A',
    fontFamily: ManropeWeights.medium,
    lineHeight: 18,
  },

  // Compact payment footer: visually secondary to membership information.
  sheetActions: {
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 8,
    paddingBottom: 1,
  },
  paymentFooter: {
    marginHorizontal: 18,
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  paymentFooterTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentMethodSegment: {
    width: 196,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SEGMENT_GAP,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: SEGMENT_PADDING,
    borderWidth: 1,
    borderColor: C.border,
  },
  segmentIndicator: {
    position: 'absolute',
    top: SEGMENT_PADDING,
    bottom: SEGMENT_PADDING,
    left: SEGMENT_PADDING,
    borderRadius: 9,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  paymentChoice: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 9,
  },
  paymentChoiceText: {
    fontSize: 11.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.secondary,
  },
  footerTotal: {
    alignItems: 'flex-end',
    marginRight: 2,
  },
  footerTotalLabel: {
    fontSize: 8,
    fontFamily: ManropeWeights.bold,
    letterSpacing: 1,
    color: C.muted,
  },
  footerTotalValue: {
    fontSize: 18,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.35,
    marginTop: 1,
  },
  payBtn: {
    minHeight: 47,
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.24,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  payBtnPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  payBtnBusy: { opacity: 0.82 },
  payBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: ManropeWeights.bold,
  },
  secureHint: {
    textAlign: 'center',
    fontSize: 9.5,
    color: C.muted,
    fontFamily: ManropeWeights.medium,
    marginTop: 6,
  },
  cancelBtn: {
    paddingTop: 5,
    paddingBottom: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: C.secondary,
    fontSize: 13,
    fontFamily: ManropeWeights.semiBold,
  },
});
