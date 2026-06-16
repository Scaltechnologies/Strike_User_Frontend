import { memo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react-native';
import { C } from './theme';
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
}

function getTodayStatus(timings: StoreTiming[]): TodayStatus | null {
  const today = todayKey();
  const t = timings.find((x) => x.dayOfWeek === today);
  if (!t) return null;
  if (t.isClosed) {
    return { label: 'Closed Today', hours: null, color: C.dangerText };
  }
  if (t.openTime && t.closeTime) {
    return {
      label: 'Open Today',
      hours: `${fmtTime(t.openTime)} – ${fmtTime(t.closeTime)}`,
      color: C.successText,
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

  if (!hasTimings && !hasDesc) return null;

  const todayStatus = hasTimings ? getTodayStatus(store.timings) : null;

  return (
    <View style={styles.card}>
      {/* ── Timings ──────────────────────────────────────────────────────── */}
      {hasTimings ? (
        <>
          <View style={styles.section}>
            <View style={styles.timingRow}>
              <Clock size={15} color={C.secondary} strokeWidth={1.8} style={styles.timingIcon} />
              <View style={styles.timingBody}>
                {todayStatus ? (
                  <>
                    <Text style={[styles.todayLabel, { color: todayStatus.color }]}>
                      {todayStatus.label}
                    </Text>
                    {todayStatus.hours ? (
                      <Text style={styles.todayHours}>{todayStatus.hours}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.todayLabel}>Store hours</Text>
                )}
              </View>
              <Pressable
                style={styles.allHoursBtn}
                onPress={() => setWeekExpanded((v) => !v)}
                hitSlop={10}
              >
                <Text style={styles.allHoursText}>
                  {weekExpanded ? 'Less' : 'All hours'}
                </Text>
                {weekExpanded
                  ? <ChevronUp  size={12} color={C.accent} strokeWidth={2.5} />
                  : <ChevronDown size={12} color={C.accent} strokeWidth={2.5} />
                }
              </Pressable>
            </View>

            {weekExpanded ? <WeekTable timings={store.timings} /> : null}
          </View>
          {hasDesc ? <View style={styles.divider} /> : null}
        </>
      ) : null}

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
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: 16,
  },

  // Timings
  timingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  timingIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  timingBody: {
    flex: 1,
    gap: 3,
  },
  todayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
  },
  todayHours: {
    fontSize: 13,
    color: C.secondary,
    lineHeight: 19,
  },
  allHoursBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
    marginTop: 2,
  },
  allHoursText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.accent,
  },

  // Week table
  weekTable: {
    marginTop: 12,
    gap: 2,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 2,
    borderRadius: 6,
  },
  weekRowToday: {
    backgroundColor: '#F7F7FA',
    paddingHorizontal: 6,
  },
  weekDay: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
    width: 34,
  },
  weekDayToday: {
    color: C.primary,
    fontWeight: '700',
  },
  weekTime: {
    fontSize: 12,
    color: C.secondary,
  },
  weekTimeClosed: {
    color: C.muted,
  },
  weekTimeToday: {
    color: C.primary,
    fontWeight: '600',
  },

  // Description
  desc: {
    fontSize: 13,
    color: C.secondary,
    lineHeight: 20,
  },
});
