// Bridges app actions (purchase, redemption, etc.) to two things at once:
//   1. The custom in-app banner (visual, branded, works identically on iOS/Android/web)
//   2. A silent local OS notification whose only job is to trigger the dedicated
//      Strike notification chime (assets/sounds/notify.wav, bundled via the
//      expo-notifications config plugin — see NOTIFICATION_SOUND below) —
//      shouldShowBanner/shouldShowList are off so it never duplicates the
//      in-app banner we already render ourselves.
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
import { router } from 'expo-router';
import type * as NotificationsNamespace from 'expo-notifications';
import {
  getMessaging,
  getToken as getFcmDeviceToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  getInitialNotification,
} from '@react-native-firebase/messaging';
import { userApi } from '@/api/user.api';
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

// Bundled via the expo-notifications config plugin (see app.json's "sounds" array,
// pointing at assets/sounds/notify.wav) — same filename is used for the Android
// channel's sound, local notify()'s sound, and must match what notification-service
// puts in the FCM payload's android.notification.sound / apns.payload.aps.sound so
// background/killed-state pushes play the same dedicated chime, not the OS default.
const NOTIFICATION_SOUND = 'notify.wav';

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
      sound: NOTIFICATION_SOUND,
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

// The FCM device registration token — what notification-service's PushDevice
// row/FirebaseProvider actually sends to (see backend: FirebaseProvider now
// talks to FCM HTTP v1 via the Admin SDK, targeting this exact token type).
// Best-effort: never throws, so callers can treat backend push-token sync as
// optional, same as the location PATCH.
export async function getFcmToken(): Promise<string | null> {
  try {
    return await getFcmDeviceToken(getMessaging());
  } catch {
    return null;
  }
}

// The package doesn't re-export RemoteMessage itself — pull it out of
// onMessage's own listener signature instead of reaching into a deep/unstable subpath.
type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0];

// Routes a tapped push notification using its `data.deepLink` field — the
// key name notification-service's EventNotificationServiceImpl already sends
// for every event type (redemption processed/rejected, subscription
// purchased, vendor status, low balance, etc: see NotificationServiceImpl),
// so this needs no backend changes to work. No-op if the field is absent.
function routeFromMessage(message: RemoteMessage) {
  const deepLink = message.data?.deepLink;
  if (typeof deepLink === 'string' && deepLink.length > 0) {
    router.push(deepLink as never);
  }
}

let remoteMessagingInitialized = false;

// Sets up remote (server-sent) push handling: a message that arrives while
// the app is foregrounded is shown through the same in-app banner as any
// other in-app notify() call (FCM/APNs don't auto-display a system
// notification while foregrounded, so without this the user would see
// nothing at all); a message tapped from the background or from a cold start
// (app was killed) navigates via routeFromMessage. Call once, e.g. from
// NotificationProvider.
export async function initRemoteMessaging() {
  if (remoteMessagingInitialized) return;
  remoteMessagingInitialized = true;

  const messaging = getMessaging();

  onMessage(messaging, (message) => {
    const title = message.notification?.title;
    if (!title) return; // data-only message with nothing to show
    notify({ title, message: message.notification?.body });
  });

  onNotificationOpenedApp(messaging, routeFromMessage);

  // FCM tokens rotate (app reinstall, restore, OS-level cache clear, etc). Without this, a
  // rotated token silently leaves the previously-registered one stale server-side — same
  // failure mode as never registering in the first place, just later and harder to notice.
  onTokenRefresh(messaging, (token) => {
    void userApi.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android').catch(() => {});
  });

  const initialMessage = await getInitialNotification(messaging);
  if (initialMessage) routeFromMessage(initialMessage);
}

// Fire-and-forget: shows the in-app banner immediately and, best-effort,
// plays the dedicated Strike chime via a silent local notification.
export function notify({ title, message, type = 'info', duration = 3500 }: NotifyOptions) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  useNotificationStore.getState().push({ id, title, message, type, duration });
  useNotificationHistoryStore.getState().add({ title, message, type });

  const modPromise = loadNotifications();
  if (!modPromise) return;

  void modPromise
    .then((mod) =>
      mod.scheduleNotificationAsync({
        content: { title, body: message, sound: NOTIFICATION_SOUND },
        trigger: null,
      }),
    )
    .catch(() => {
      // Sound is a nice-to-have — never let it block the in-app banner.
    });
}
