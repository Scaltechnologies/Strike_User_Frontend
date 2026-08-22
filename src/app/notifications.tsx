import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, XCircle } from 'lucide-react-native';

import { useNotificationHistory } from '@/hooks/useNotificationHistory';
import type { AppNotification } from '@/types/notification';
import type { NotificationType } from '@/store/notificationStore';
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

const TYPE_CONFIG: Record<NotificationType, { color: string; soft: string; Icon: typeof Bell }> = {
  success: { color: '#1C7A3C', soft: '#EAF7EF', Icon: CheckCircle2 },
  error:   { color: '#C0261A', soft: '#FEF0EE', Icon: XCircle },
  warning: { color: '#946200', soft: '#FFF5E0', Icon: AlertTriangle },
  info:    { color: '#0369A1', soft: '#EFF6FF', Icon: Bell },
};

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

// ── Top bar ─────────────────────────────────────────────────────────────────────

function TopBar({
  onBack,
  showMarkAllRead,
  onMarkAllRead,
}: {
  onBack: () => void;
  showMarkAllRead: boolean;
  onMarkAllRead: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable style={styles.backBtn} onPress={onBack} hitSlop={12}>
        <ArrowLeft size={20} color={C.primary} strokeWidth={2} />
      </Pressable>
      <Text style={styles.topBarTitle}>Notifications</Text>
      {showMarkAllRead ? (
        <Pressable style={styles.markAllBtn} onPress={onMarkAllRead} hitSlop={10}>
          <Text style={styles.markAllBtnText}>Mark all read</Text>
        </Pressable>
      ) : (
        <View style={styles.topBarSpacer} />
      )}
    </View>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const { color, soft, Icon } = TYPE_CONFIG[item.type];

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !item.read && styles.rowUnread,
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
          {!item.read && <View style={styles.unreadDot} />}
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

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead } = useNotificationHistory();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <TopBar
        onBack={() => router.back()}
        showMarkAllRead={unreadCount > 0}
        onMarkAllRead={markAllRead}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.listEmptyContent : styles.listContent}
        renderItem={({ item }) => (
          <NotificationRow item={item} onPress={() => markRead(item.id)} />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />
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

  // ── Empty state ──
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
});
