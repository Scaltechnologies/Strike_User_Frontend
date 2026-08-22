import { useNotificationHistoryStore } from '@/store/notificationHistoryStore';

export function useNotificationHistory() {
  const items = useNotificationHistoryStore((s) => s.items);
  const markRead = useNotificationHistoryStore((s) => s.markRead);
  const markAllRead = useNotificationHistoryStore((s) => s.markAllRead);
  const clear = useNotificationHistoryStore((s) => s.clear);

  const unreadCount = items.reduce((n, item) => n + (item.read ? 0 : 1), 0);

  return { items, unreadCount, markRead, markAllRead, clear };
}
