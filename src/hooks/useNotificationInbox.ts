// Backend-driven notification center — GET /api/notifications/me is the only
// source of truth for both the inbox list and the unread bell badge. Kept
// separate from useNotifications.ts, which owns OS permission/toggle state,
// not inbox content.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '@/api/notification.api';

export const notificationInboxKeys = {
  all:         ['notifications'] as const,
  inbox:       (page: number, size: number) => [...notificationInboxKeys.all, 'inbox', page, size] as const,
  unreadCount: () => [...notificationInboxKeys.all, 'unreadCount'] as const,
};

// One page is enough for "what's happened recently" — the realistic size for
// a notification center on this app. page/size are already threaded through
// notification.api.ts so paginating further is a small extension, not a
// rewrite, if ever needed.
const INBOX_PAGE_SIZE = 30;

export function useNotificationInbox() {
  return useQuery({
    queryKey: notificationInboxKeys.inbox(0, INBOX_PAGE_SIZE),
    queryFn:  () => notificationApi.getInbox(0, INBOX_PAGE_SIZE),
    staleTime: 30 * 1000,
  });
}

// Bell badge. Short staleTime because this is the one number expected to
// feel live — but the actual "live" trigger is FCM (see notificationService.ts's
// onMessage handler invalidating notificationInboxKeys.all directly), not
// polling; staleTime here only governs ordinary refetch-on-focus/mount.
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationInboxKeys.unreadCount(),
    queryFn:  notificationApi.getUnreadCount,
    staleTime: 30 * 1000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationApi.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationInboxKeys.all });
    },
    // Failures are handled by the caller (best-effort — see notifications.tsx):
    // a transient network error marking one notification read must never
    // block navigating to its destination.
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationInboxKeys.all });
    },
  });
}
