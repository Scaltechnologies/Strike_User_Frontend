// Bridges app actions (purchase, redemption, etc.) to two things at once:
//   1. The custom in-app banner (visual, branded, works identically on iOS/Android/web)
//   2. A silent local OS notification whose only job is to trigger the system
//      default notification sound — shouldShowBanner/shouldShowList are off so
//      it never duplicates the in-app banner we already render ourselves.
//
// IMPORTANT: expo-notifications cannot even be *imported* on Android inside
// Expo Go — since SDK 53 it throws synchronously from a module-level side
// effect (DevicePushTokenAutoRegistration.fx.ts registers a push-token
// listener at import time, which calls a guard that throws on Android in
// Expo Go). We lazy-load the module with a dynamic import and only do so
// outside that specific environment, so the in-app banner still works
// everywhere and the OS sound is added on top wherever it's safe to do so
// (iOS Expo Go, and any platform in a development/production build).

import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import type * as NotificationsNamespace from 'expo-notifications';
import { useNotificationStore, type NotificationType } from '@/store/notificationStore';
import { useNotificationHistoryStore } from '@/store/notificationHistoryStore';

export interface NotifyOptions {
  title: string;
  message?: string;
  type?: NotificationType;
  duration?: number;
}

type NotificationsModule = typeof NotificationsNamespace;

const OS_NOTIFICATIONS_SUPPORTED = !(Platform.OS === 'android' && isRunningInExpoGo());

let modulePromise: Promise<NotificationsModule> | null = null;

function loadNotifications(): Promise<NotificationsModule> | null {
  if (!OS_NOTIFICATIONS_SUPPORTED) return null;
  if (!modulePromise) {
    modulePromise = import('expo-notifications');
  }
  return modulePromise;
}

let initialized = false;

export async function initNotifications() {
  if (initialized) return;
  initialized = true;

  const mod = await loadNotifications();
  if (!mod) return;

  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await mod.setNotificationChannelAsync('default', {
      name: 'Strike Alerts',
      importance: mod.AndroidImportance.HIGH,
    });
  }

  const { status } = await mod.getPermissionsAsync();
  if (status !== 'granted') {
    await mod.requestPermissionsAsync();
  }
}

// Current OS permission state for the Notifications settings toggle.
// Returns null on the Expo Go / Android combo where the module can't load at all —
// callers treat that the same as "no OS gate, in-app banners still work".
export async function getPermissionStatus(): Promise<{ status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean } | null> {
  const mod = await loadNotifications();
  if (!mod) return null;
  const { status, canAskAgain } = await mod.getPermissionsAsync();
  return { status, canAskAgain };
}

// Shows the OS permission dialog. canAskAgain === false means the user must
// go to system Settings (permanently denied on iOS, or exhausted prompts on Android).
export async function requestPermission(): Promise<{ status: string; canAskAgain: boolean } | null> {
  const mod = await loadNotifications();
  if (!mod) return null;
  const { status, canAskAgain } = await mod.requestPermissionsAsync();
  return { status, canAskAgain };
}

// Best-effort only: requires an EAS projectId configured in app.json, which
// this project does not have yet. Returns null rather than throwing so callers
// can treat backend push-token sync as optional, same as the location PATCH.
export async function getExpoPushToken(): Promise<string | null> {
  const mod = await loadNotifications();
  if (!mod) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  const { data } = await mod.getExpoPushTokenAsync({ projectId });
  return data;
}

// Fire-and-forget: shows the in-app banner immediately and, best-effort,
// plays the system default sound via a silent local notification.
export function notify({ title, message, type = 'info', duration = 3500 }: NotifyOptions) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  useNotificationStore.getState().push({ id, title, message, type, duration });
  useNotificationHistoryStore.getState().add({ title, message, type });

  const modPromise = loadNotifications();
  if (!modPromise) return;

  void modPromise
    .then((mod) =>
      mod.scheduleNotificationAsync({
        content: { title, body: message, sound: 'default' },
        trigger: null,
      }),
    )
    .catch(() => {
      // Sound is a nice-to-have — never let it block the in-app banner.
    });
}
