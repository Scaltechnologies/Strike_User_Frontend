// Sets up the OS notification handler/channel/permissions once on mount and
// renders the global in-app banner above the rest of the app.

import { useEffect } from 'react';
import { NotificationBanner } from '@/components/notifications/NotificationBanner';
import { initNotifications, initRemoteMessaging } from '@/services/notificationService';
import { useNotificationHistoryStore } from '@/store/notificationHistoryStore';

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  useEffect(() => {
    void initNotifications();
    void initRemoteMessaging();
    void useNotificationHistoryStore.getState().hydrate();
  }, []);

  return (
    <>
      {children}
      <NotificationBanner />
    </>
  );
}
