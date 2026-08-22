import { useEffect, useRef, useState } from 'react';
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
import { Check, ChevronDown, Info, Tag, X } from 'lucide-react-native';
import { subscriptionApi } from '@/api/subscription.api';
import { useCreatePayment, useVerifyPayment, useCancelPayment } from '@/hooks/usePayments';
import { useValidateCoupon } from '@/hooks/useCoupons';
import { RazorpayCheckout } from './RazorpayCheckout';
import { cardBgColor, formatCardPrice, CC } from './theme';
import { ManropeWeights } from '@/constants/theme';
import type { CardDefinition } from '@/types/card';
import type { MenuCategory } from '@/types/store';
import type { Subscription } from '@/types/subscription';
import type { ValidateCouponResponse } from '@/types/coupon';
import type { PaymentResponse, RazorpayCheckoutResult } from '@/types/payment';

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
  label,
  value,
  highlight,
  isGold,
  isDiscount,
  isLast,
  wrap,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  isGold?: boolean;
  isDiscount?: boolean;
  isLast?: boolean;
  wrap?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, !isLast && styles.summaryRowBorder, wrap && styles.summaryRowWrap]}>
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
  const { mutateAsync: createPayment, isPending: creatingPayment } = useCreatePayment();
  const { mutateAsync: verifyPayment } = useVerifyPayment();
  const { mutateAsync: cancelPayment } = useCancelPayment();
  const { mutateAsync: validateCoupon, isPending: validatingCoupon } = useValidateCoupon();
  const busy = creatingPayment || finalizing;
  const slideAnim = useRef(new Animated.Value(0)).current;
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

  const hasBonus = card.bonusAmount > 0;
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
            <Text style={styles.sheetTitle}>Activate Membership</Text>
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
            {/* Mini card preview */}
            <View style={[styles.miniCard, { backgroundColor: cardBgColor(card.name) }]}>
              <Text style={styles.miniCardStore} numberOfLines={1}>
                {storeName ?? `Store #${card.storeId}`}
              </Text>
              <Text style={styles.miniCardName} numberOfLines={2}>
                {card.name}
              </Text>
              <View style={styles.miniCardRow}>
                <View>
                  <Text style={styles.miniCardMetaLabel}>Wallet Credit</Text>
                  <Text style={styles.miniCardBalance}>
                    {formatCardPrice(card.walletAmount)}
                  </Text>
                </View>
                {hasBonus && (
                  <View style={styles.miniCardBonusPill}>
                    <Text style={styles.miniCardBonusText}>
                      +{formatCardPrice(card.bonusAmount)} bonus
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.miniCircle1} pointerEvents="none" />
              <View style={styles.miniCircle2} pointerEvents="none" />
            </View>

            {/* Summary card */}
            <View style={styles.summaryCard}>
              <SummaryRow
                label="Membership Price"
                value={
                  appliedCoupon
                    ? `${formatCardPrice(card.cardPrice)}  →  ${formatCardPrice(appliedCoupon.finalAmount)}`
                    : formatCardPrice(card.cardPrice)
                }
              />
              {appliedCoupon && (
                <SummaryRow
                  label="Coupon Discount"
                  value={`-${formatCardPrice(appliedCoupon.discountApplied)}`}
                  isDiscount
                />
              )}
              <SummaryRow
                label="Wallet Credit"
                value={formatCardPrice(card.walletAmount)}
                highlight
              />
              {hasBonus && (
                <SummaryRow
                  label="Bonus Credit"
                  value={`+${formatCardPrice(card.bonusAmount)}`}
                  isGold
                />
              )}
              <SummaryRow
                label="Validity"
                value={`${card.validityInDays} days from activation`}
              />
              {eligibleCategories.length > 0 && (
                <SummaryRow
                  label="Eligible Categories"
                  value={eligibleCategories.map((c) => c.name).join(', ')}
                  wrap
                />
              )}
              {itemCount > 0 ? (
                <SummaryRow
                  label="Eligible Items"
                  value={`${itemCount} items`}
                  isLast
                />
              ) : eligibleCategories.length > 0 ? (
                <SummaryRow
                  label="Eligible Items"
                  value="All items in eligible categories"
                  isLast
                />
              ) : (
                <SummaryRow
                  label="Coverage"
                  value="All items at this store"
                  isLast
                />
              )}
            </View>

            {/* Coupon */}
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
                style={styles.couponToggle}
                onPress={() => {
                  setShowCouponInput(true);
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
                }}
              >
                <Tag size={14} color={C.accent} strokeWidth={2.2} />
                <Text style={styles.couponToggleText}>Have a coupon code?</Text>
                <ChevronDown size={14} color={C.muted} strokeWidth={2.2} />
              </Pressable>
            )}

            {/* Terms note */}
            <View style={styles.termsNote}>
              <Info size={13} color={C.muted} strokeWidth={2} />
              <Text style={styles.termsText}>
                You are about to pay {formatCardPrice(payAmount)} for this
                membership. Your wallet will be loaded with{' '}
                {formatCardPrice(card.walletAmount)} valid for{' '}
                {card.validityInDays} days.
              </Text>
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Action buttons */}
          <SafeAreaView edges={['bottom']} style={styles.sheetActions}>
            <Pressable
              style={[styles.activateBtn, busy && styles.activateBtnLoading]}
              onPress={() => void handlePay()}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.activateBtnText}>Pay {formatCardPrice(payAmount)}</Text>
              )}
            </Pressable>
            {!busy && (
              <Pressable style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            )}
          </SafeAreaView>
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
    backgroundColor: 'rgba(0,0,0,0.60)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 24 },
    }),
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  // Header
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Scrollable body
  sheetScroll: { flexGrow: 0 },
  sheetContent: { padding: 20, gap: 14 },

  // Mini card
  miniCard: {
    borderRadius: 18,
    padding: 20,
    overflow: 'hidden',
    gap: 6,
  },
  miniCardStore: {
    fontSize: 11,
    fontFamily: ManropeWeights.semiBold,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  miniCardName: {
    fontSize: 19,
    fontFamily: ManropeWeights.bold,
    color: '#FFF',
    letterSpacing: -0.4,
  },
  miniCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  miniCardMetaLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.40)',
    fontFamily: ManropeWeights.medium,
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  miniCardBalance: {
    fontSize: 30,
    fontFamily: ManropeWeights.bold,
    color: '#FFF',
    letterSpacing: -1,
  },
  miniCardBonusPill: {
    backgroundColor: 'rgba(201,151,58,0.22)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  miniCardBonusText: {
    fontSize: 12,
    fontFamily: ManropeWeights.semiBold,
    color: '#FFD580',
  },
  miniCircle1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    top: -30,
    right: -30,
  },
  miniCircle2: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: 8,
    right: 80,
  },

  // Summary
  summaryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  summaryRowWrap: { alignItems: 'flex-start', paddingVertical: 12 },
  summaryRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 14,
    color: C.secondary,
    fontFamily: ManropeWeights.medium,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '55%',
  },
  summaryValueAccent: { color: C.accent },
  summaryValueGold: { color: CC.gold },
  summaryValueDiscount: { color: DISCOUNT_GREEN },
  summaryValueWrap: { textAlign: 'right', fontFamily: ManropeWeights.regular, fontSize: 13 },

  // Coupon
  couponToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  couponToggleText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: ManropeWeights.semiBold,
    color: C.primary,
  },
  couponInputCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: 0.5,
    color: C.primary,
  },
  couponApplyBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponApplyBtnDisabled: { opacity: 0.4 },
  couponApplyBtnText: {
    color: '#FFF',
    fontSize: 13.5,
    fontFamily: ManropeWeights.bold,
  },
  couponErrorText: {
    fontSize: 12,
    color: C.accent,
    fontFamily: ManropeWeights.medium,
  },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: DISCOUNT_GREEN_SOFT,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  couponAppliedIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponAppliedTextWrap: { flex: 1 },
  couponAppliedCode: {
    fontSize: 13.5,
    fontFamily: ManropeWeights.bold,
    color: DISCOUNT_GREEN,
    letterSpacing: 0.3,
  },
  couponAppliedSavings: {
    fontFamily: ManropeWeights.regular, fontSize: 12,
    color: C.secondary,
    marginTop: 1,
  },

  // Terms
  termsNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
  },
  termsText: {
    flex: 1,
    fontFamily: ManropeWeights.regular, fontSize: 12,
    color: C.secondary,
    lineHeight: 18,
  },

  // Error
  errorBanner: {
    backgroundColor: '#FEF0EE',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#C0261A',
    fontFamily: ManropeWeights.medium,
    lineHeight: 18,
  },

  // Actions
  sheetActions: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  activateBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: C.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.40,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  activateBtnLoading: { opacity: 0.80 },
  activateBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.2,
  },
  cancelBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: C.secondary,
    fontSize: 15,
    fontFamily: ManropeWeights.semiBold,
  },
});
