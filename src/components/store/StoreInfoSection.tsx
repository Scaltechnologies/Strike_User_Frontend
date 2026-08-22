import { memo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react-native';
import { C } from './theme';
import { ManropeWeights } from '@/constants/theme';
import { isStoreOpenNow } from '@/utils/storeTiming';
import type { Store, StoreTiming } from '@/types/store';

// ── Timing helpers ────────────────────────────────────────────────────────────

const DAY_ORDER = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
] as const;

const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu',
  FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

const JS_TO_JAVA = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
];

function todayKey(): string {
  return JS_TO_JAVA[new Date().getDay()];
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

interface TodayStatus {
  label: string;
  hours: string | null;
  color: string;
  bg: string;
}

function getTodayStatus(store: Store): TodayStatus | null {
  const today = todayKey();
  const t = store.timings.find((x) => x.dayOfWeek === today);
  if (!t) return null;
  if (t.isClosed) {
    return { label: 'Closed Today', hours: null, color: C.dangerText, bg: C.dangerBg };
  }
  if (t.openTime && t.closeTime) {
    const openNow = isStoreOpenNow(store);
    return {
      label: openNow ? 'Open Now' : 'Closed Now',
      hours: `${fmtTime(t.openTime)} – ${fmtTime(t.closeTime)}`,
      color: openNow ? C.successText : C.dangerText,
      bg: openNow ? C.successBg : C.dangerBg,
    };
  }
  return null;
}

// ── Full week table ───────────────────────────────────────────────────────────

function WeekTable({ timings }: { timings: StoreTiming[] }) {
  const today = todayKey();
  const sorted = [...timings].sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.dayOfWeek as (typeof DAY_ORDER)[number]) -
      DAY_ORDER.indexOf(b.dayOfWeek as (typeof DAY_ORDER)[number]),
  );

  return (
    <View style={styles.weekTable}>
      {sorted.map((t) => {
        const isToday = t.dayOfWeek === today;
        let timeStr: string;
        if (t.isClosed) timeStr = 'Closed';
        else if (t.openTime && t.closeTime) {
          timeStr = `${fmtTime(t.openTime)} – ${fmtTime(t.closeTime)}`;
        } else {
          timeStr = '—';
        }

        return (
          <View
            key={t.id}
            style={[styles.weekRow, isToday && styles.weekRowToday]}
          >
            <Text style={[styles.weekDay, isToday && styles.weekDayToday]}>
              {DAY_SHORT[t.dayOfWeek] ?? t.dayOfWeek}
            </Text>
            <Text
              style={[
                styles.weekTime,
                t.isClosed && styles.weekTimeClosed,
                isToday && styles.weekTimeToday,
              ]}
            >
              {timeStr}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  store: Store;
}

export const StoreInfoSection = memo(function StoreInfoSection({ store }: Props) {
  const [weekExpanded, setWeekExpanded] = useState(false);

  const hasTimings = store.timings.length > 0;
  const hasDesc    = !!store.description;
  // Phone and email intentionally omitted — vendor-internal, not customer-facing.

  const todayStatus = hasTimings ? getTodayStatus(store) : null;

  return (
    <View style={styles.card}>
      {/* ── Timings — always shown; falls back to a static "not available"
          row instead of vanishing when the vendor hasn't set hours. ──────── */}
      <View style={styles.section}>
        {hasTimings ? (
          <Pressable
            style={({ pressed }) => [styles.timingRow, pressed && styles.timingRowPressed]}
            onPress={() => setWeekExpanded((v) => !v)}
            hitSlop={6}
          >
            <View style={styles.timingIconWrap}>
              <Clock size={16} color={C.accent} strokeWidth={2} />
            </View>
            <View style={styles.timingBody}>
              {todayStatus ? (
                <>
                  <View style={[styles.statusPill, { backgroundColor: todayStatus.bg }]}>
                    <View style={[styles.statusDot, { backgroundColor: todayStatus.color }]} />
                    <Text style={[styles.statusPillText, { color: todayStatus.color }]}>
                      {todayStatus.label}
                    </Text>
                  </View>
                  {todayStatus.hours ? (
                    <Text style={styles.todayHours}>{todayStatus.hours}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.todayLabel}>Store hours</Text>
                  <Text style={styles.todayHours}>Tap to view the weekly schedule</Text>
                </>
              )}
            </View>
            <View style={styles.chevronBadge}>
              {weekExpanded
                ? <ChevronUp  size={16} color={C.accent} strokeWidth={2.4} />
                : <ChevronDown size={16} color={C.accent} strokeWidth={2.4} />
              }
            </View>
          </Pressable>
        ) : (
          <View style={styles.timingRow}>
            <View style={styles.timingIconWrap}>
              <Clock size={16} color={C.muted} strokeWidth={2} />
            </View>
            <View style={styles.timingBody}>
              <Text style={styles.todayLabel}>Store hours</Text>
              <Text style={styles.todayHours}>Hours not available</Text>
            </View>
          </View>
        )}

        {weekExpanded ? <WeekTable timings={store.timings} /> : null}
      </View>
      {hasDesc ? <View style={styles.divider} /> : null}

      {/* ── Description ──────────────────────────────────────────────────── */}
      {hasDesc ? (
        <View style={styles.section}>
          <Text style={styles.desc}>{store.description}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: 20,
  },

  // Timings
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
  },
  timingRowPressed: {
    backgroundColor: C.bg,
  },
  timingIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  timingBody: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  todayLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.1,
  },
  todayHours: {
    fontSize: 12.5,
    color: C.secondary,
    lineHeight: 17,
    fontFamily: ManropeWeights.regular,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    letterSpacing: -0.1,
  },
  chevronBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // Week table
  weekTable: {
    marginTop: 16,
    gap: 3,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  weekRowToday: {
    backgroundColor: C.accentSoft,
  },
  weekDay: {
    fontSize: 12.5,
    fontFamily: ManropeWeights.medium,
    color: C.muted,
    width: 40,
  },
  weekDayToday: {
    color: C.accentDeep,
    fontFamily: ManropeWeights.bold,
  },
  weekTime: {
    fontFamily: ManropeWeights.regular, fontSize: 12.5,
    color: C.secondary,
  },
  weekTimeClosed: {
    color: C.muted,
  },
  weekTimeToday: {
    color: C.accentDeep,
    fontFamily: ManropeWeights.semiBold,
  },

  // Description
  desc: {
    fontFamily: ManropeWeights.regular, fontSize: 13.5,
    color: C.secondary,
    lineHeight: 21,
  },
});
