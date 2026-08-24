import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { NotificationPage } from '@/types/notification';

// notification-service's self-service inbox — no ApiSuccessResponse wrapper,
// raw JSON body (see types/notification.ts). Identity is resolved server-side
// from the JWT; nothing here ever sends a userId.
export const notificationApi = {
  getInbox: async (page = 0, size = 30): Promise<NotificationPage> => {
    const { data } = await apiClient.get<NotificationPage>(API_ENDPOINTS.NOTIFICATIONS.INBOX, {
      params: { page, size },
    });
    return data;
  },

  getUnreadCount: async (): Promise<number> => {
    const { data } = await apiClient.get<{ unreadCount: number }>(
      API_ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT,
    );
    return data.unreadCount;
  },

  markRead: async (id: number): Promise<void> => {
    await apiClient.patch(API_ENDPOINTS.NOTIFICATIONS.READ(id));
  },

  markAllRead: async (): Promise<number> => {
    const { data } = await apiClient.patch<{ updated: number }>(
      API_ENDPOINTS.NOTIFICATIONS.READ_ALL,
    );
    return data.updated;
  },
};
