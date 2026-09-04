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
import { useAuthStore } from '@/store/authStore';
import { queryClient } from '@/providers/QueryProvider';
import { notificationInboxKeys } from '@/hooks/useNotificationInbox';
import { getNotificationDisplay } from '@/constants/notificationDisplay';
import { storageService } from '@/services/storageService';
import { useNotificationStore, type NotificationType } from '@/store/notificationStore';

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

// This run's backend PushDevice row id, once known — needed only to disable
// the row on logout (DELETE is by id, not by token). Deliberately in-memory
// only, not persisted: if the process is killed before a logout happens,
// there's nothing to disable anyway (no session survives that), and the next
// registration (app relaunch, toggle, token refresh) repopulates it.
let currentDeviceId: number | null = null;

// Single place that actually calls the backend device-registration endpoint —
// every trigger (manual toggle, token refresh, auto-sync on login) goes
// through this so currentDeviceId is never set in only one of them. Silent on
// failure, same best-effort contract as getFcmToken/the location PATCH.
async function registerToken(token: string): Promise<void> {
  try {
    const device = await userApi.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    currentDeviceId = device.id;
  } catch {
    // best-effort
  }
}

// Fetches the current FCM token and registers it — the shared primitive
// behind both the manual "enable notifications" toggle (useNotifications.ts)
// and syncPushTokenIfEnabled() below. Best-effort, same as getFcmToken.
export async function registerCurrentDeviceToken(): Promise<void> {
  const token = await getFcmToken();
  if (!token) return;
  await registerToken(token);
}

// Called once per authenticated session start (see AuthProvider) — registers
// this device's current token against the now-signed-in user, but only while
// the local notifications toggle is on (persisted, defaults to true on a
// fresh install — see storageService.getNotificationsEnabled). Respects an
// explicit switch-off exactly like it used to respect a never-opted-in
// install. Never triggers an OS permission prompt itself (that's
// NotificationProvider's initNotifications(), run once at app launch) — this
// just keeps an already-granted registration pointed at whichever account is
// currently signed in (a fresh login, or a different account signing in on
// the same device, both need the backend's recipientId/recipientType on this
// token's row updated to match).
export async function syncPushTokenIfEnabled(): Promise<void> {
  try {
    const enabled = await storageService.getNotificationsEnabled();
    if (!enabled) return;
    await registerCurrentDeviceToken();
  } catch {
    // best-effort
  }
}

// Best-effort logout cleanup — disables the current device row (if this
// session ever learned its id) so it stops receiving push for the account
// that's signing out. Must be called BEFORE authStore.clearAuth() wipes the
// bearer token, since the DELETE needs to authenticate as the outgoing user.
export async function disableCurrentDevice(): Promise<void> {
  if (currentDeviceId == null) return;
  const id = currentDeviceId;
  currentDeviceId = null;
  try {
    await userApi.unregisterPushToken(id);
  } catch {
    // best-effort — a stale row left active is a minor annoyance (silently
    // dropped once the token is next reassigned), never worth blocking logout.
  }
}

// The package doesn't re-export RemoteMessage itself — pull it out of
// onMessage's own listener signature instead of reaching into a deep/unstable subpath.
type RemoteMessage = Parameters<Parameters<typeof onMessage>[1]>[0];

// Resolves where a push notification should navigate to. Prefers
// `data.deepLink` — the field notification-service's EventNotificationServiceImpl
// sends whenever the triggering event has one (redemption/subscription/etc —
// see NotificationServiceImpl). Falls back to a type-based destination (same
// mapping the in-app notification list uses) for the event types that don't
// carry a deepLink today (payments, coupons, banner-published), using
// `data.type` — also always sent alongside deepLink. If neither field is
// present or usable, falls back to the Notifications screen rather than
// silently doing nothing, per the same "never strand the user" rule as a
// malformed in-app notification's actionUrl.
function resolveDestination(message: RemoteMessage): string {
  const deepLink = message.data?.deepLink;
  if (typeof deepLink === 'string' && deepLink.length > 0) return deepLink;
  const type = message.data?.type;
  return getNotificationDisplay(typeof type === 'string' ? type : null).route;
}

// A cold-start tap (app was fully terminated) resolves getInitialNotification()
// before AuthProvider has necessarily finished restoring the session — routing
// there immediately would race the route guard's own redirect and lose the
// notification's destination (guard wins, since it re-runs on every auth/segment
// change). So a cold-start destination is parked here instead of navigated to
// directly; AuthProvider consumes it once bootstrap has settled and the guard
// has placed the user on a route they're actually allowed to be on. A tap while
// the app was merely backgrounded (onNotificationOpenedApp, not this) has no
// such race — the session is already resolved — so that path still navigates
// immediately.
let pendingDeepLink: string | null = null;

export function consumePendingDeepLink(): string | null {
  const link = pendingDeepLink;
  pendingDeepLink = null;
  return link;
}

// Covers the ordering where getInitialNotification() resolves AFTER
// AuthProvider's own bootstrap has already settled (its route-guard effect
// won't spontaneously re-run just because pendingDeepLink changed — plain
// module state isn't a React dependency) — checked the instant the pending
// link is set. The reverse ordering (auth still bootstrapping when this
// resolves) is covered by AuthProvider consuming it at the end of its own
// guard effect once isBootstrapping flips false, which is guaranteed to run.
function tryFlushPendingDeepLinkIfAuthReady() {
  if (!pendingDeepLink) return;
  const { isBootstrapping, isAuthenticated } = useAuthStore.getState();
  if (isBootstrapping || !isAuthenticated) return;
  const link = consumePendingDeepLink();
  if (link) router.push(link as never);
}

function routeFromMessage(message: RemoteMessage) {
  router.push(resolveDestination(message) as never);
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
    if (title) notify({ title, message: message.notification?.body });

    // The backend already persisted this event's InAppNotification row before
    // FCM ever fired (dispatchInApp/dispatchPush run independently off the
    // same business event) — refetch instead of guessing at optimistic state,
    // so the inbox/badge reflect the real row (right type/id/actionUrl) the
    // moment it arrives, with no polling involved.
    void queryClient.invalidateQueries({ queryKey: notificationInboxKeys.all });
  });

  onNotificationOpenedApp(messaging, routeFromMessage);

  // FCM tokens rotate (app reinstall, restore, OS-level cache clear, etc). Without this, a
  // rotated token silently leaves the previously-registered one stale server-side — same
  // failure mode as never registering in the first place, just later and harder to notice.
  onTokenRefresh(messaging, (token) => {
    void registerToken(token);
  });

  const initialMessage = await getInitialNotification(messaging);
  if (initialMessage) {
    pendingDeepLink = resolveDestination(initialMessage);
    tryFlushPendingDeepLinkIfAuthReady();
  }
}

// Fire-and-forget: shows the in-app banner immediately and, best-effort,
// plays the dedicated Strike chime via a silent local notification. Purely a
// live UI cue — NOT the notification history's source of truth, which is
// always the backend inbox (see useNotificationInbox.ts /
// app/notifications.tsx); this can fire for purely client-side confirmations
// that have no backend row at all (e.g. checkout's immediate "Payment
// Successful" toast), so it deliberately doesn't persist anything itself.
export function notify({ title, message, type = 'info', duration = 3500 }: NotifyOptions) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  useNotificationStore.getState().push({ id, title, message, type, duration });

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
