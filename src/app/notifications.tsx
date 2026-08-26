// Notification center — 100% backend-driven (GET /api/notifications/me).
// Read/unread state, icons, and tap-navigation all come from the real
// notification-service inbox row, not any client-side history.

import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft, Bell, RefreshCw } from 'lucide-react-native';

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationInbox,
} from '@/hooks/useNotificationInbox';
import { getNotificationDisplay } from '@/constants/notificationDisplay';
import type { NotificationDto } from '@/types/notification';
import { ManropeWeights } from '@/constants/theme';

// ── Design tokens — matches settings/notifications.tsx ──────────────────────────

const C = {
  accent:     '#D63527',
  accentSoft: '#FEF2EF',
  bg:         '#F2F2F7',
  surface:    '#FFFFFF',
  border:     '#E8E8ED',
  divider:    '#F0F0F5',
  primary:    '#0D0D0D',
  secondary:  '#5C5C5C',
  muted:      '#AEAEB2',
} as const;

// ── Relative time ─────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Date grouping (Today / Yesterday / Earlier) ─────────────────────────────────

type Row = { kind: 'header'; label: string } | { kind: 'item'; item: NotificationDto };

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function groupByDate(items: NotificationDto[]): Row[] {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const rows: Row[] = [];
  let currentLabel: string | null = null;

  for (const item of items) {
    const createdAt = new Date(item.createdAt);
    const label = isSameLocalDay(createdAt, now)
      ? 'Today'
      : isSameLocalDay(createdAt, yesterday)
        ? 'Yesterday'
        : 'Earlier';

    if (label !== currentLabel) {
      rows.push({ kind: 'header', label });
      currentLabel = label;
    }
    rows.push({ kind: 'item', item });
  }
  return rows;
}

// ── Top bar ─────────────────────────────────────────────────────────────────────

function TopBar({
  onBack,
  showMarkAllRead,
  onMarkAllRead,
  markingAll,
}: {
  onBack: () => void;
  showMarkAllRead: boolean;
  onMarkAllRead: () => void;
  markingAll: boolean;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Notifications</Text>
      {showMarkAllRead ? (
        <Pressable style={styles.markAllBtn} onPress={onMarkAllRead} hitSlop={10} disabled={markingAll}>
          {markingAll ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={styles.markAllBtnText}>Mark all read</Text>
          )}
        </Pressable>
      ) : (
        <View style={styles.topBarSpacer} />
      )}
    </View>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeaderWrap}>
      <Text style={styles.sectionHeaderText}>{label}</Text>
    </View>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onPress,
}: {
  item: NotificationDto;
  onPress: () => void;
}) {
  const { Icon, color, soft } = getNotificationDisplay(item.type);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !item.isRead && styles.rowUnread,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: soft }]}>
        <Icon size={18} color={color} strokeWidth={2} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          {!item.isRead && <View style={styles.unreadDot} />}
        </View>
        {item.message ? (
          <Text style={styles.rowMessage} numberOfLines={2}>{item.message}</Text>
        ) : null}
        <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Bell size={26} color={C.accent} strokeWidth={1.6} />
      </View>
      <Text style={styles.emptyTitle}>No Notifications Yet</Text>
      <Text style={styles.emptySub}>
        Updates about your redemptions, subscriptions, and offers will show up here.
      </Text>
    </View>
  );
}

// ── Error state ────────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconWrap, { backgroundColor: '#FEF0EE' }]}>
        <AlertCircle size={26} color={C.accent} strokeWidth={1.6} />
      </View>
      <Text style={styles.emptyTitle}>Couldn&apos;t load notifications</Text>
      <Text style={styles.emptySub}>Check your connection and try again.</Text>
      <Pressable style={styles.retryBtn} onPress={onRetry} hitSlop={8}>
        <RefreshCw size={13} color={C.accent} strokeWidth={2} />
        <Text style={styles.retryBtnText}>Try again</Text>
      </Pressable>
    </View>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <View style={[styles.row, { opacity: 0.6 }]}>
      <View style={[styles.iconWrap, { backgroundColor: C.bg }]} />
      <View style={styles.rowBody}>
        <View style={{ height: 13, width: '55%', backgroundColor: C.bg, borderRadius: 4 }} />
        <View style={{ height: 11, width: '80%', backgroundColor: C.bg, borderRadius: 4, marginTop: 6 }} />
      </View>
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useNotificationInbox();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead, isPending: markingAll } = useMarkAllNotificationsRead();

  const items = useMemo(() => data?.content ?? [], [data]);
  const unreadCount = items.reduce((n, item) => n + (item.isRead ? 0 : 1), 0);
  const rows = useMemo(() => groupByDate(items), [items]);

  const handlePress = (item: NotificationDto) => {
    // Best-effort — a transient network failure here must never block
    // navigating to the notification's destination, and never touches any
    // notification other than the one tapped.
    if (!item.isRead) markRead(item.id);

    const display = getNotificationDisplay(item.type);
    const destination = item.actionUrl && item.actionUrl.length > 0 ? item.actionUrl : display.route;
    try {
      router.push(destination as never);
    } catch {
      // Malformed/unroutable destination — land somewhere safe instead of crashing.
      router.push('/notifications' as never);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar
        onBack={() => router.back()}
        showMarkAllRead={unreadCount > 0}
        onMarkAllRead={() => markAllRead()}
        markingAll={markingAll}
      />

      {isLoading ? (
        <View style={styles.listContent}>
          <RowSkeleton />
          <View style={{ height: 10 }} />
          <RowSkeleton />
          <View style={{ height: 10 }} />
          <RowSkeleton />
        </View>
      ) : isError && items.length === 0 ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row, i) => (row.kind === 'header' ? `h-${row.label}-${i}` : `n-${row.item.id}`)}
          contentContainerStyle={items.length === 0 ? styles.listEmptyContent : styles.listContent}
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <SectionHeader label={row.label} />
            ) : (
              <NotificationRow item={row.item} onPress={() => handlePress(row.item)} />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<EmptyState />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  topBarSpacer: { width: 36 },
  markAllBtn: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    minWidth: 36,
    alignItems: 'flex-end',
  },
  markAllBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.accent,
  },

  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  listEmptyContent: { flexGrow: 1 },
  separator: { height: 10 },

  // ── Section header ──
  sectionHeaderWrap: {
    paddingTop: 6,
    paddingBottom: 2,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // ── Row ──
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  rowUnread: {
    backgroundColor: C.accentSoft,
    borderColor: 'rgba(214,53,39,0.18)',
  },
  rowPressed: { opacity: 0.7 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    letterSpacing: -0.2,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
    flexShrink: 0,
  },
  rowMessage: {
    fontSize: 12.5,
    color: C.secondary,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    lineHeight: 18,
  },
  rowTime: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '500',
    fontFamily: ManropeWeights.medium,
    marginTop: 2,
  },

  // ── Empty / error state ──
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: C.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.primary,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  emptySub: {
    fontSize: 14,
    color: C.secondary,
    textAlign: 'center',
    lineHeight: 21,
    fontFamily: ManropeWeights.regular,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.accentSoft,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: ManropeWeights.bold,
    color: C.accent,
  },
});
