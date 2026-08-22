import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft, Minus, Plus, ShoppingBag } from 'lucide-react-native';
import { useEligibleMenu, useSubscriptionDetail } from '@/hooks/useSubscriptions';
import { useStoreDetail } from '@/hooks/useStores';
import { useRequestRedemption } from '@/hooks/useRedemptions';
import { notify } from '@/services/notificationService';
import { isSubscriptionRedeemable } from '@/utils/subscription';
import { ManropeWeights } from '@/constants/theme';
import type { EligibleCategory, EligibleMenuItem } from '@/types/subscription';

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
  success:     '#34C759',
  skeleton:    '#E5E5EA',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
}

// ── Top bar ────────────────────────────────────────────────────────────────────

function TopBar({ title, subtitle, onBack }: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <View style={styles.topBarCenter}>
        <Text style={styles.topBarTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={styles.topBarSub} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.topBarSpacer} />
    </View>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonBone({ style }: { style?: object }) {
  return <View style={[styles.skBone, style]} />;
}

function SelectSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar title="Select Items" onBack={onBack} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {[0, 1].map((g) => (
          <View key={g} style={styles.categoryGroup}>
            <SkeletonBone style={{ width: 90, height: 11, marginBottom: 12 }} />
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.itemRow, i < 2 && styles.itemRowBorder]}>
                <View style={[styles.skBone, { width: 8, height: 8, borderRadius: 4 }]} />
                <SkeletonBone style={{ flex: 1, height: 13 }} />
                <SkeletonBone style={{ width: 44, height: 13 }} />
                <SkeletonBone style={{ width: 88, height: 32, borderRadius: 10 }} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Item row ───────────────────────────────────────────────────────────────────

interface ItemRowProps {
  item:     EligibleMenuItem;
  quantity: number;
  isLast:   boolean;
  onInc:    () => void;
  onDec:    () => void;
}

function ItemRow({ item, quantity, isLast, onInc, onDec }: ItemRowProps) {
  const isVeg      = item.itemType === 'VEG';
  const isSelected = quantity > 0;
  const dotColor   = isVeg ? C.success : C.accent;

  return (
    <View style={[styles.itemRow, !isLast && styles.itemRowBorder, isSelected && styles.itemRowSelected]}>
      {isSelected ? <View style={styles.itemSelectedBar} /> : null}

      {/* Veg/non-veg indicator — FSSAI-style square outline + dot */}
      <View style={[styles.vegBox, { borderColor: dotColor }]}>
        <View style={[styles.vegDot, { backgroundColor: dotColor }]} />
      </View>

      {/* Name + price (+ live subtotal once selected) */}
      <View style={styles.itemBody}>
        <Text style={[styles.itemName, isSelected && styles.itemNameSelected]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.itemPriceRow}>
          <Text style={styles.itemPrice}>{fmt(item.price)}</Text>
          {isSelected ? (
            <Text style={styles.itemSubtotal}>· {quantity} × = {fmt(item.price * quantity)}</Text>
          ) : null}
        </View>
      </View>

      {/* Add pill (unselected) ↔ stepper (selected) — the classic food-app pattern */}
      {isSelected ? (
        <View style={styles.stepper}>
          <Pressable
            style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
            onPress={onDec}
            hitSlop={8}
          >
            <Minus size={14} color={C.accent} strokeWidth={2.5} />
          </Pressable>

          <Text style={styles.stepperQty}>{quantity}</Text>

          <Pressable
            style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
            onPress={onInc}
            hitSlop={8}
            disabled={quantity >= 10}
          >
            <Plus size={14} color={quantity >= 10 ? C.muted : C.accent} strokeWidth={2.5} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={onInc}
          hitSlop={8}
        >
          <Plus size={14} color={C.accent} strokeWidth={2.5} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Category section ───────────────────────────────────────────────────────────

interface CategorySectionProps {
  category:  EligibleCategory;
  quantities: Map<number, number>;
  onInc:     (itemId: number) => void;
  onDec:     (itemId: number) => void;
}

function CategorySection({ category, quantities, onInc, onDec }: CategorySectionProps) {
  if (category.items.length === 0) return null;

  return (
    <View style={styles.categoryGroup}>
      <View style={styles.categoryLabelRow}>
        <Text style={styles.categoryLabel}>{category.categoryName}</Text>
        <Text style={styles.categoryCount}>{category.items.length}</Text>
      </View>
      <View style={styles.categoryCard}>
        {category.items.map((item, idx) => (
          <ItemRow
            key={item.itemId}
            item={item}
            quantity={quantities.get(item.itemId) ?? 0}
            isLast={idx === category.items.length - 1}
            onInc={() => onInc(item.itemId)}
            onDec={() => onDec(item.itemId)}
          />
        ))}
      </View>
    </View>
  );
}

// ── Empty menu state ───────────────────────────────────────────────────────────

function EmptyMenu({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.emptyCenter}>
      <ShoppingBag size={36} color={C.muted} strokeWidth={1.4} />
      <Text style={styles.emptyTitle}>No Items Available</Text>
      <Text style={styles.emptySub}>
        No eligible items are configured for this membership right now.
      </Text>
      <Pressable style={styles.retryBtn} onPress={onBack}>
        <Text style={styles.retryBtnText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

function BlockedState({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.emptyCenter}>
      <AlertCircle size={36} color={C.muted} strokeWidth={1.4} />
      <Text style={styles.emptyTitle}>Membership Not Active</Text>
      <Text style={styles.emptySub}>
        This membership has expired or is no longer active and can't be redeemed.
      </Text>
      <Pressable style={styles.retryBtn} onPress={onBack}>
        <Text style={styles.retryBtnText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SelectItemsScreen() {
  const { subId } = useLocalSearchParams<{ subId: string }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();

  const [quantities, setQuantities] = useState<Map<number, number>>(new Map());
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The sticky bar's height varies (the balance meter only shows once items
  // are selected) — measure it instead of guessing a fixed padding, so the
  // last row never ends up hidden behind it.
  const [barHeight, setBarHeight] = useState(0);

  const { data: sub, isLoading: subLoading }            = useSubscriptionDetail(subId ?? '');
  const { data: store }                               = useStoreDetail(sub?.storeId ?? 0);
  const { data: eligibleMenu, isLoading: menuLoading } = useEligibleMenu(subId ?? '');

  const { mutate: requestRedemption, isPending: isSubmitting } = useRequestRedemption();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const handleInc = useCallback((itemId: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      const cur  = next.get(itemId) ?? 0;
      if (cur < 10) next.set(itemId, cur + 1);
      return next;
    });
    setSubmitError(null);
  }, []);

  const handleDec = useCallback((itemId: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      const cur  = next.get(itemId) ?? 0;
      if (cur > 0) next.set(itemId, cur - 1);
      return next;
    });
  }, []);

  const eligibleCategories: EligibleCategory[] = eligibleMenu?.categories ?? [];

  // Derived selection summary
  const { totalItems, totalValue, selectedItems } = useMemo(() => {
    const allItems = eligibleCategories.flatMap((c) => c.items);
    let   items      = 0;
    let   value      = 0;
    const sel: { menuItemId: number; quantity: number }[] = [];

    for (const item of allItems) {
      const qty = quantities.get(item.itemId) ?? 0;
      if (qty > 0) {
        items += qty;
        value += item.price * qty;
        sel.push({ menuItemId: item.itemId, quantity: qty });
      }
    }
    return { totalItems: items, totalValue: value, selectedItems: sel };
  }, [quantities, eligibleCategories]);

  const hasSelection = totalItems > 0;
  const redeemable = sub != null && isSubscriptionRedeemable(sub);
  const insufficientBalance = sub != null && hasSelection && totalValue > sub.walletBalance;

  const handleSubmit = useCallback(() => {
    if (!sub || !hasSelection || !redeemable || totalValue > sub.walletBalance) return;
    setSubmitError(null);

    requestRedemption(
      { subscriptionId: sub.id, storeId: sub.storeId, items: selectedItems },
      {
        onSuccess: (redemption) => {
          notify({
            type: 'info',
            title: 'Redemption Requested',
            message: 'Waiting for the store to approve your request.',
          });
          router.push({
            pathname: '/subscriptions/pending' as never,
            params: {
              redemptionId: String(redemption.id),
              subId:        String(sub.id),
            },
          } as never);
        },
        onError: (err) => {
          const axiosErr = err as {
            response?: { data?: { message?: string; errors?: Record<string, string> } };
            code?: string;
          };
          if (!axiosErr.response) {
            // Network timeout: server may have received the request even though we got no response.
            // Tell the user to check the pending screen before retrying to avoid duplicates.
            setSubmitError(
              'Could not confirm your request. Check your membership for a pending request before trying again.',
            );
            return;
          }
          const res = axiosErr.response.data;
          const detail = res?.errors ? ' — ' + Object.values(res.errors).join(', ') : '';
          setSubmitError((res?.message ?? 'Failed to submit request. Please try again.') + detail);
        },
      },
    );
  }, [sub, hasSelection, redeemable, totalValue, selectedItems, requestRedemption, router]);

  const isLoading = subLoading || menuLoading;

  if (isLoading) return <SelectSkeleton onBack={handleBack} />;

  if (sub && !redeemable) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <TopBar
          title="Select Items"
          subtitle={store?.name ?? sub?.cardName}
          onBack={handleBack}
        />
        <BlockedState onBack={handleBack} />
      </SafeAreaView>
    );
  }

  const categories = eligibleCategories;
  const hasItems   = categories.length > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar
        title="Select Items"
        subtitle={store?.name ?? sub?.cardName}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {hasItems ? (
          categories.map((cat) => (
            <CategorySection
              key={cat.categoryId}
              category={cat}
              quantities={quantities}
              onInc={handleInc}
              onDec={handleDec}
            />
          ))
        ) : (
          <EmptyMenu onBack={handleBack} />
        )}

        {/* Error message */}
        {insufficientBalance ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={14} color={C.accent} strokeWidth={2} />
            <Text style={styles.errorBannerText}>
              Selected items total {fmt(totalValue)}, which exceeds your remaining balance
              of {fmt(sub!.walletBalance)}.
            </Text>
          </View>
        ) : submitError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={14} color={C.accent} strokeWidth={2} />
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        ) : null}

        <View style={{ height: (barHeight || 120) + 16 }} />
      </ScrollView>

      {/* ── Sticky summary + CTA ─────────────────────────────────────────────── */}
      {hasItems ? (
        <View
          style={[styles.stickyBar, { paddingBottom: insets.bottom + 16 }]}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        >
          {/* Wallet balance meter — how much of the membership this selection uses */}
          {hasSelection && sub ? (
            <View style={styles.balanceMeter}>
              <View style={styles.balanceMeterTrack}>
                <View
                  style={[
                    styles.balanceMeterFill,
                    { width: `${Math.min((totalValue / Math.max(sub.walletBalance, 1)) * 100, 100)}%` },
                    insufficientBalance && styles.balanceMeterFillDanger,
                  ]}
                />
              </View>
              <Text style={[styles.balanceMeterText, insufficientBalance && styles.balanceMeterTextDanger]}>
                {fmt(totalValue)} of {fmt(sub.walletBalance)} balance
              </Text>
            </View>
          ) : null}

          {/* Summary */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryItemCount}>
              {hasSelection
                ? `${totalItems} item${totalItems > 1 ? 's' : ''} selected`
                : 'No items selected'}
            </Text>
            {hasSelection ? (
              <Text style={styles.summaryValueRight}>{fmt(totalValue)}</Text>
            ) : null}
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              (!hasSelection || insufficientBalance) && styles.ctaBtnDisabled,
              pressed && hasSelection && !insufficientBalance && styles.ctaBtnPressed,
            ]}
            onPress={handleSubmit}
            disabled={!hasSelection || insufficientBalance || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={[styles.ctaBtnText, (!hasSelection || insufficientBalance) && styles.ctaBtnTextDisabled]}>
                {!hasSelection
                  ? 'Select at Least One Item'
                  : insufficientBalance
                  ? 'Insufficient Balance'
                  : 'Request Redemption'}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
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
    minHeight: 56,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 3 },
    }),
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.bg,
    justifyContent: 'center', alignItems: 'center',
  },
  topBarCenter: { flex: 1, alignItems: 'center', gap: 2 },
  topBarTitle: {
    fontSize: 16, fontFamily: ManropeWeights.semiBold,
    color: C.primary, letterSpacing: -0.2,
  },
  topBarSub: {
    fontSize: 11, color: C.muted, fontFamily: ManropeWeights.medium,
  },
  topBarSpacer: { width: 36 },

  scroll:        { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 16 },

  // ── Category group ─────────────────────────────────────────────────────────
  categoryGroup: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  categoryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  categoryLabel: {
    fontSize: 11,
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  categoryCount: {
    fontSize: 10.5,
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    backgroundColor: C.surface,
    minWidth: 18,
    textAlign: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  categoryCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },

  // ── Item row ───────────────────────────────────────────────────────────────
  itemRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: C.surface,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  itemRowSelected: {
    backgroundColor: C.accentSoft,
  },
  itemSelectedBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: C.accent,
  },
  vegBox: {
    width: 15, height: 15,
    borderWidth: 1.5, borderRadius: 3,
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  vegDot: {
    width: 7, height: 7, borderRadius: 3.5,
  },
  itemBody: { flex: 1, gap: 3 },
  itemName: {
    fontSize: 14, fontFamily: ManropeWeights.medium, color: C.secondary, lineHeight: 20,
  },
  itemNameSelected: {
    color: C.primary, fontFamily: ManropeWeights.semiBold,
  },
  itemPriceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  itemPrice: {
    fontSize: 12, color: C.muted, fontFamily: ManropeWeights.medium,
  },
  itemSubtotal: {
    fontSize: 12, color: C.accent, fontFamily: ManropeWeights.semiBold,
  },

  // ── Add pill (unselected state) ───────────────────────────────────────────
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.accent,
    flexShrink: 0,
  },
  addBtnPressed: {
    backgroundColor: C.accentSoft,
  },
  addBtnText: {
    fontSize: 13, fontFamily: ManropeWeights.bold, color: C.accent, letterSpacing: 0.2,
  },

  // ── Stepper (selected state) ──────────────────────────────────────────────
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.accent,
    overflow: 'hidden',
    flexShrink: 0,
  },
  stepperBtn: {
    width: 32, height: 32,
    justifyContent: 'center', alignItems: 'center',
  },
  stepperBtnPressed: { opacity: 0.6, backgroundColor: C.accentSoft },
  stepperQty: {
    width: 26, textAlign: 'center',
    fontSize: 15, fontFamily: ManropeWeights.bold,
    color: C.accent,
  },

  // ── Empty state ────────────────────────────────────────────────────────────
  emptyCenter: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, paddingVertical: 60, gap: 10,
  },
  emptyTitle: {
    fontSize: 17, fontFamily: ManropeWeights.bold, color: C.primary, marginTop: 8,
  },
  emptySub: {
    fontFamily: ManropeWeights.regular, fontSize: 14, color: C.secondary, textAlign: 'center', lineHeight: 21,
  },
  retryBtn: {
    marginTop: 12, backgroundColor: C.accent,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 22,
  },
  retryBtnText: { color: '#FFF', fontSize: 14, fontFamily: ManropeWeights.bold },

  // ── Error banner ───────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2EF',
    borderRadius: 12, marginHorizontal: 16, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#FACCBE',
  },
  errorBannerText: {
    flex: 1, fontSize: 13, color: C.accent,
    lineHeight: 19, fontFamily: ManropeWeights.medium,
  },

  // ── Sticky bar ─────────────────────────────────────────────────────────────
  stickyBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: C.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 12 },
    }),
  },
  // Wallet balance meter
  balanceMeter: { gap: 5 },
  balanceMeterTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: C.bg, overflow: 'hidden',
  },
  balanceMeterFill: {
    height: '100%', borderRadius: 3,
    backgroundColor: C.success,
  },
  balanceMeterFillDanger: {
    backgroundColor: C.accent,
  },
  balanceMeterText: {
    fontSize: 11.5, fontFamily: ManropeWeights.medium, color: C.muted,
  },
  balanceMeterTextDanger: {
    color: C.accent, fontFamily: ManropeWeights.semiBold,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryItemCount: {
    fontSize: 13, fontFamily: ManropeWeights.semiBold, color: C.secondary,
  },
  summaryValueRight: {
    fontSize: 20, fontFamily: ManropeWeights.extraBold, color: C.primary, letterSpacing: -0.5,
  },

  // CTA button
  ctaBtn: {
    backgroundColor: C.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  ctaBtnDisabled: {
    backgroundColor: C.skeleton,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaBtnPressed: { opacity: 0.88 },
  ctaBtnText: {
    color: '#FFF', fontSize: 16, fontFamily: ManropeWeights.bold, letterSpacing: -0.2,
  },
  ctaBtnTextDisabled: { color: C.muted },

  // ── Skeleton ───────────────────────────────────────────────────────────────
  skBone: {
    height: 13, width: '100%', borderRadius: 7, backgroundColor: C.skeleton,
  },
});
