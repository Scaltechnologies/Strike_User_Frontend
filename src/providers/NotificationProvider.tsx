// Sets up the OS notification handler/channel/permissions once on mount and
// renders the global in-app banner above the rest of the app.

import { useEffect } from 'react';
import { NotificationBanner } from '@/components/notifications/NotificationBanner';
import { initNotifications } from '@/services/notificationService';

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  useEffect(() => {
    void initNotifications();
  }, []);

  return (
    <>
      {children}
      <NotificationBanner />
    </>
  );
}
