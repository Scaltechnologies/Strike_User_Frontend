import type { NotificationType } from '@/store/notificationStore';

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
}
