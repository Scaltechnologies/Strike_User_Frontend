// Orchestrates the Notifications settings toggle: OS permission state,
// device-local persisted intent, and best-effort push-token backend sync.
// Mirrors useLocation.ts's permission → status → backend-PATCH shape.

import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';

import { useAppStore } from '@/store/appStore';
import { userApi } from '@/api/user.api';
import { storageService } from '@/services/storageService';
import * as notificationService from '@/services/notificationService';

export function useNotifications() {
  const {
    notificationsEnabled,
    notificationPermission,
    notificationStatus,
    setNotificationsEnabled,
    setNotificationPermission,
    setNotificationStatus,
  } = useAppStore();

  // Best-effort — a failed/unavailable push token must never undo the toggle
  // the user already switched on.
  const syncPushToken = useCallback(async () => {
    try {
      const token = await notificationService.getFcmToken();
      if (token) {
        await userApi.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
      }
    } catch {
      // Silent — same best-effort pattern as useLocation's backend PATCH.
    }
  }, []);

  // Called once on screen mount. Reads the stored intent + current OS permission
  // so the toggle reflects reality even if permission was changed from OS Settings.
  //
  // IMPORTANT: getPermissionStatus() returns null when the notifications module
  // can't even be loaded (Android + Expo Go, see notificationService.ts). That is
  // NOT the same as "denied" — the in-app banner still works there with no OS
  // gate at all — so it must fall through to trusting the stored intent, not
  // force the toggle back to false on every screen visit.
  const initNotificationSettings = useCallback(async () => {
    setNotificationStatus('checking');
    const [stored, perm] = await Promise.all([
      storageService.getNotificationsEnabled(),
      notificationService.getPermissionStatus(),
    ]);

    if (perm?.status === 'denied') {
      const nextPermission = perm.canAskAgain ? 'denied' : 'blocked';
      setNotificationPermission(nextPermission);
      setNotificationsEnabled(false);
      setNotificationStatus(nextPermission);
      return;
    }

    // 'granted', 'undetermined' (never asked), or perm === null (module unavailable).
    setNotificationPermission(perm?.status === 'granted' || perm === null ? 'granted' : 'not-asked');
    setNotificationsEnabled(stored);
    setNotificationStatus(stored ? 'ready' : 'idle');

    // Re-registering here (not just in enable()) matters because a stored "on" from a previous
    // install doesn't mean a token was ever registered against *this* build/device — e.g. a dev
    // client rebuild that adds/changes the FCM native module leaves the toggle already on with
    // no way to notice nothing actually got (re-)registered. Cheap and idempotent either way.
    if (stored && (perm?.status === 'granted' || perm === null)) {
      void syncPushToken();
    }
  }, [setNotificationPermission, setNotificationsEnabled, setNotificationStatus, syncPushToken]);

  // Toggled ON: request OS permission if needed, then best-effort register the push token.
  const enable = useCallback(async () => {
    setNotificationStatus('requesting');

    const perm = await notificationService.getPermissionStatus();

    // Module unavailable (Android + Expo Go) — there's no OS permission to gate
    // on; the in-app banner already works unconditionally, so just flip it on.
    if (perm === null) {
      setNotificationPermission('granted');
      setNotificationsEnabled(true);
      setNotificationStatus('ready');
      void storageService.setNotificationsEnabled(true);
      return;
    }

    let granted = perm.status === 'granted';

    if (!granted) {
      const result = await notificationService.requestPermission();
      if (!result) {
        // Module became unavailable between the two calls — same fallback as above.
        setNotificationPermission('granted');
        setNotificationsEnabled(true);
        setNotificationStatus('ready');
        void storageService.setNotificationsEnabled(true);
        return;
      }
      granted = result.status === 'granted';
      if (!granted) {
        const nextPermission = result.canAskAgain ? 'denied' : 'blocked';
        setNotificationPermission(nextPermission);
        setNotificationStatus(nextPermission);
        return;
      }
    }

    setNotificationPermission('granted');
    setNotificationsEnabled(true);
    setNotificationStatus('ready');
    void storageService.setNotificationsEnabled(true);
    void syncPushToken();
  }, [setNotificationPermission, setNotificationsEnabled, setNotificationStatus, syncPushToken]);

  // Toggled OFF: local-only — there is no backend unregister endpoint yet.
  const disable = useCallback(() => {
    setNotificationsEnabled(false);
    setNotificationStatus('idle');
    void storageService.setNotificationsEnabled(false);
  }, [setNotificationsEnabled, setNotificationStatus]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return {
    enabled: notificationsEnabled,
    permission: notificationPermission,
    status: notificationStatus,
    initNotificationSettings,
    enable,
    disable,
    openSettings,
  };
}
