// Persisted (on-device) notification history — every notify() call gets
// appended here so the bell icon has something real to show. Separate from
// notificationStore, which only holds the ephemeral in-app toast queue.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppNotification } from '@/types/notification';

const STORAGE_KEY = 'strike_notification_history';
const MAX_ITEMS = 100;

function persist(items: AppNotification[]) {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

interface NotificationHistoryState {
  items: AppNotification[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  add: (item: Pick<AppNotification, 'title' | 'message' | 'type'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationHistoryStore = create<NotificationHistoryState>()((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      set({ items: raw ? (JSON.parse(raw) as AppNotification[]) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  add: (item) => {
    const entry: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      read: false,
      ...item,
    };
    const items = [entry, ...get().items].slice(0, MAX_ITEMS);
    set({ items });
    persist(items);
  },

  markRead: (id) => {
    const items = get().items.map((n) => (n.id === id ? { ...n, read: true } : n));
    set({ items });
    persist(items);
  },

  markAllRead: () => {
    const items = get().items.map((n) => ({ ...n, read: true }));
    set({ items });
    persist(items);
  },

  clear: () => {
    set({ items: [] });
    void AsyncStorage.removeItem(STORAGE_KEY);
  },
}));
