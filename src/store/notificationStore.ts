// In-app notification banner queue. Kept separate from appStore since banners
// are ephemeral UI state, not persisted app state.

import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface NotificationBannerItem {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  duration: number;
}

interface NotificationState {
  queue: NotificationBannerItem[];
  push: (item: NotificationBannerItem) => void;
  dismiss: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  queue: [],
  push: (item) => set((s) => ({ queue: [...s.queue, item] })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((n) => n.id !== id) })),
}));
