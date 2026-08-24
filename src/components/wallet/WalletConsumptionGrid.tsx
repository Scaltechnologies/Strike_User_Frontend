// Wallet Consumption Grid — a 6-column visual of wallet consumption %, one
// box per day of the card's validity (e.g. a ₹3000 / 30-day card → 30 boxes
// of ₹100 each; a 7-day card → 7 boxes). Box count comes from the call site
// (getSubscriptionValidityDays) — this component never invents a count of
// its own beyond the 30-box fallback for a missing/malformed prop. Matches
// the vendor app's WalletConsumptionGrid box-count logic so the same wallet
// reads as the same grid on both sides of a redemption.
//
// The cells' FILL is purely visual — driven only by the backend-provided
// consumptionPercentage (itself derived server-side from the purchase-time
// originalWalletAmount snapshot, never from CardDefinition.walletAmount or
// cardPrice — see SubscriptionResponse on card-service). When an optional
// `redemptions` list is passed in, each filled cell is additionally mapped
// to whichever redemption's cumulative amount caused it to fill (see
// mapRedemptionsToCells below) purely so a tap can open that redemption's
// detail — it never changes what the water level itself shows.
//
// Historical subscriptions purchased before originalWalletAmount existed have
// it (and consumedAmount/consumptionPercentage) as null — this component
// renders nothing for those rather than guessing.
//
// Water rises bottom→top per cell via a single shared Animated.Value driving
// per-cell translateY (native-driver transforms only), so the whole grid
// animates off one JS-thread tick regardless of cell count. The component
// only animates between two *actual* backend-confirmed percentages it has
// been given — a PENDING request never changes consumptionPercentage, so
// passing the live subscription value straight through naturally satisfies
// "no fill while pending" / "no fill on rejection" without any status
// branching here.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import { ManropeWeights } from '@/constants/theme';
import type { Redemption } from '@/types/redemption';

export interface WalletConsumptionGridProps {
  originalWalletAmount: number | null | undefined;
  walletBalance: number;
  consumedAmount: number | null | undefined;
  consumptionPercentage: number | null | undefined;
  // Box count — one per validity day at the call sites (via
  // getSubscriptionValidityDays). Defaults to 30 only as a fallback.
  totalCells?: number;
  // Optional — when provided, each filled cell is attributed to whichever
  // redemption(s) cumulative amount caused it to fill (see
  // mapRedemptionsToCells) — usually one, but a cell that sits right on the
  // boundary between two redemptions ends up attributed to both. Tapping
  // that cell fires onCellPress with all of them; the call site opens the
  // detail directly for a single one, or a chooser for more than one. Cells
  // with no attributable redemption (not yet filled, or a historical
  // subscription with no redemption rows) are not pressable.
  redemptions?: Redemption[];
  onCellPress?: (redemptions: Redemption[]) => void;
  // Fires once the grid has settled at its current percentage — immediately
  // on first mount (nothing to animate yet), or after the fill animation
  // finishes when the percentage changes. Lets a screen defer revealing
  // content until the water has actually finished moving.
  onSettled?: () => void;
}

// Attributes each cell to every redemption whose cumulative amount touched
// it, in chronological order — only APPROVED/COMPLETED redemptions actually
// deduct from the wallet, so those are the only ones considered. A
// redemption that fully spans one or more cells is the sole contributor to
// each; a cell that sits right on the boundary between two redemptions (one
// completed it, the next one's leading edge partially fills it) ends up
// with both. Cells beyond what's been consumed so far stay empty (not
// tappable).
function mapRedemptionsToCells(
  cellCount: number,
  cellValue: number,
  redemptions: Redemption[],
): Redemption[][] {
  const cells: Redemption[][] = Array.from({ length: cellCount }, () => []);
  if (cellValue <= 0) return cells;

  const consuming = redemptions
    .filter((r) => r.status === 'APPROVED' || r.status === 'COMPLETED')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let cumulative = 0;
  let cellIdx = 0;
  for (const r of consuming) {
    cumulative += r.totalAmount;
    while (cellIdx < cellCount && cumulative >= (cellIdx + 1) * cellValue - 0.01) {
      cells[cellIdx].push(r);
      cellIdx++;
    }
    if (cellIdx < cellCount && cumulative > cellIdx * cellValue) {
      cells[cellIdx].push(r);
    }
  }
  return cells;
}

const COLUMNS = 6;
const DEFAULT_TOTAL_CELLS = 30;
const CELL_GAP = 6;
const MAX_GRID_WIDTH = 380;

// Two-tone red for the water fill — matches the vendor app's own
// WalletConsumptionGrid palette (WATER.top for the fill, WATER.bottom for
// the "Used" stat) so the same wallet reads as the same grid on both sides
// of a redemption.
const WATER = {
  top:    '#E14A3B',
  bottom: '#A62A1F',
} as const;

const C = {
  primary:  '#1A1A1A',
  muted:    '#9BA3AF',
  border:   '#E5E7EB',
  cellBg:   '#F3F4F6',
  success:  '#16A34A',
} as const;

function fmt(n: number): string {
  const v = Math.round(n * 100) / 100;
  return v % 1 === 0 ? `₹${v}` : `₹${v.toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '')}%`;
}

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// One water cell. `fillAnim` is the single shared 0–100 Animated.Value for
// the whole grid; each cell just interpolates the slice of that range it
// owns, so there's exactly one JS-driven animation for all 30 cells.
function Cell({ index, totalCells, size, fillAnim, reduceMotion, redemptions, onPress }: {
  index: number;
  totalCells: number;
  size: number;
  fillAnim: Animated.Value;
  reduceMotion: boolean;
  redemptions: Redemption[];
  onPress?: (redemptions: Redemption[]) => void;
}) {
  const cellStartPct = (index / totalCells) * 100;
  const cellEndPct   = ((index + 1) / totalCells) * 100;
  const tappable = redemptions.length > 0 && !!onPress;

  const translateY = fillAnim.interpolate({
    inputRange:  [cellStartPct, cellEndPct],
    outputRange: [size, 0],
    extrapolate: 'clamp',
  });

  // The tick only pops in once THIS cell is completely full — derived from
  // the same translateY (0 = full) rather than a second fillAnim
  // interpolation, so it can never show on a still-filling cell.
  const checkOpacity = translateY.interpolate({
    inputRange:  [0, size * 0.15],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const checkScale = translateY.interpolate({
    inputRange:  [0, size * 0.15],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });

  // Wave: a small horizontal shimmer at the water surface, purely decorative,
  // looping independently of the fill level — never used to derive data.
  const wave = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wave, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(wave, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, wave]);

  const waveTranslateX = wave.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.16, size * 0.16] });

  // A slow "breathing" glow on every tappable cell's border — always on, no
  // storage flag, no one-shot timer to silently expire. Staggered by column
  // so the grid reads as a gentle wave rather than every box pulsing in
  // lockstep. Opacity-only (no scale/position) so it's cheap even across a
  // full 30+ cell grid and never overlaps neighboring cells.
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!tappable || reduceMotion) return;
    const stagger = (index % COLUMNS) * 110;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(stagger),
        Animated.timing(glow, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 950, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.delay(1400 - stagger),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [tappable, reduceMotion, glow, index]);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.95] });

  const content = (
    <View style={[styles.cell, { width: size, height: size }]}>
      <Animated.View style={[styles.waterFill, { height: size, transform: [{ translateY }] }]}>
        {!reduceMotion && (
          <Animated.View
            style={[styles.waveStrip, { width: size * 1.5, transform: [{ translateX: waveTranslateX }] }]}
          />
        )}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.cellCheck, { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}
      >
        <Check size={Math.max(12, size * 0.5)} color="#FFFFFF" strokeWidth={3.4} style={styles.checkShine} />
      </Animated.View>
      {tappable && (
        <Animated.View pointerEvents="none" style={[styles.cellGlow, { opacity: glowOpacity }]} />
      )}
    </View>
  );

  if (!tappable) return content;

  return (
    <Pressable
      onPress={() => onPress!(redemptions)}
      hitSlop={2}
      style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export function WalletConsumptionGrid({
  originalWalletAmount,
  walletBalance,
  consumedAmount,
  consumptionPercentage,
  totalCells = DEFAULT_TOTAL_CELLS,
  redemptions,
  onCellPress,
  onSettled,
}: WalletConsumptionGridProps) {
  const cellCount = Math.max(1, Math.round(totalCells));
  const rows = Math.ceil(cellCount / COLUMNS);
  const [gridWidth, setGridWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = AccessibilityInfo.isReduceMotionEnabled;
    if (typeof check !== 'function') return;
    check().then((v) => {
      if (!cancelled) setReduceMotion(!!v);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const target = consumptionPercentage ?? 0;
  const fillAnim = useRef(new Animated.Value(target)).current;
  const prevTargetRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (consumptionPercentage == null) return;

    if (!mountedRef.current) {
      // First paint — show the actual current state directly, no climb-from-
      // zero theatrics for a value that was already true before this screen opened.
      mountedRef.current = true;
      prevTargetRef.current = target;
      fillAnim.setValue(target);
      onSettled?.();
      return;
    }

    if (prevTargetRef.current === target) return; // no real change — nothing to animate
    prevTargetRef.current = target;

    if (reduceMotion) {
      fillAnim.setValue(target);
      onSettled?.();
      return;
    }

    Animated.timing(fillAnim, {
      toValue: target,
      duration: 2500,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      onSettled?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, consumptionPercentage, reduceMotion]);

  // Historical subscription predating the originalWalletAmount snapshot —
  // hide the grid entirely rather than guess.
  if (originalWalletAmount == null || consumptionPercentage == null) return null;

  const usedAmount = consumedAmount ?? Math.max(originalWalletAmount - walletBalance, 0);
  const cellValue = originalWalletAmount / cellCount;
  const filledCells = Math.round((target / 100) * cellCount);
  const cellRedemptions = redemptions ? mapRedemptionsToCells(cellCount, cellValue, redemptions) : null;
  const hasTappableCells = !!cellRedemptions?.some((c) => c.length > 0) && !!onCellPress;

  const cellSize = gridWidth > 0
    ? Math.floor((gridWidth - (COLUMNS - 1) * CELL_GAP) / COLUMNS)
    : 0;
  const gridPixelWidth  = cellSize * COLUMNS + CELL_GAP * (COLUMNS - 1);
  const gridPixelHeight = cellSize * rows + CELL_GAP * (rows - 1);

  function handleLayout(e: LayoutChangeEvent) {
    setGridWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.card}>
      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatBlock label="ORIGINAL"  value={fmt(originalWalletAmount)} />
        <StatBlock label="USED"      value={fmt(usedAmount)} color={WATER.bottom} />
        <StatBlock label="REMAINING" value={fmt(walletBalance)} color={C.success} />
        <StatBlock label="USAGE"     value={fmtPct(consumptionPercentage)} />
      </View>

      {/* Always-there tap cue — a small chip, no dismiss, nothing hidden
          behind a "seen it once" flag that could quietly never show again. */}
      {hasTappableCells && (
        <View style={styles.tapChip}>
          <Sparkles size={13} color={WATER.top} strokeWidth={2.2} />
          <Text style={styles.tapChipText}>Tap a filled box to see what you redeemed</Text>
        </View>
      )}

      {/* Grid */}
      <View style={styles.gridOuter} onLayout={handleLayout}>
        {cellSize > 0 && (
          <View style={{ width: gridPixelWidth }}>
            <View style={[styles.grid, { width: gridPixelWidth, height: gridPixelHeight }]}>
              {Array.from({ length: cellCount }, (_, i) => (
                <Cell
                  key={i}
                  index={i}
                  totalCells={cellCount}
                  size={cellSize}
                  fillAnim={fillAnim}
                  reduceMotion={reduceMotion}
                  redemptions={cellRedemptions?.[i] ?? []}
                  onPress={onCellPress}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {cellSize > 0 && (
        <Text style={styles.legendText}>
          {filledCells} of {cellCount} boxes used · each box ≈ {fmt(cellValue)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.cellBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  statBlock: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statLabel: {
    fontSize: 9, color: C.muted, fontFamily: ManropeWeights.bold,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4,
  },
  statValue: {
    fontSize: 14, color: C.primary, fontFamily: ManropeWeights.extraBold, letterSpacing: -0.2,
  },

  tapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    alignSelf: 'center',
    backgroundColor: '#FDEDEB',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  tapChipText: {
    fontSize: 12,
    color: WATER.bottom,
    fontFamily: ManropeWeights.semiBold,
    letterSpacing: -0.1,
  },

  gridOuter: { alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: MAX_GRID_WIDTH, marginTop: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CELL_GAP,
  },

  cell: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.cellBg,
    overflow: 'hidden',
  },
  waterFill: {
    position: 'absolute',
    left: 0, right: 0, top: 0,
    backgroundColor: WATER.top,
  },
  waveStrip: {
    position: 'absolute',
    top: -3,
    left: '-25%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.40)',
  },

  cellCheck: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkShine: {
    ...Platform.select({
      ios: { shadowColor: '#FFFFFF', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8 },
      android: {},
    }),
  },
  cellGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  legendText: {
    fontSize: 11.5, color: C.muted, textAlign: 'center',
    marginTop: 12, fontFamily: ManropeWeights.medium,
  },
});
