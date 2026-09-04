import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@/constants/storage';

// 'gps' — the active-tracking device location (watchPositionAsync).
// 'manual' — the user explicitly chose this via Set Location (search or
// history); GPS tracking is paused while a manual location is active so it
// can't silently overwrite the user's deliberate choice. See useLocation.ts.
export type LocationSource = 'gps' | 'manual';

export interface StoredLocation {
  latitude: number;
  longitude: number;
  updatedAt: string;
  source: LocationSource;
}

export interface RecentLocation {
  latitude: number;
  longitude: number;
  name: string | null;
  usedAt: string;
}

// An in-flight Pay-at-Store checkout. qrPayload/verificationCode are captured here because the
// backend returns them ONLY on the create response — never again by any GET — so this is the
// only place they exist once the create-response object itself is gone (app killed, screen
// unmounted). cardDefinitionId/storeId/couponCode are captured too because they're needed to
// build a fresh POST /api/payments call on retry (PAY_AT_STORE always creates a brand-new
// Payment, never resurrects one).
//
// Multiple of these can be open at once — the backend only dedupes PAY_AT_STORE creation per
// (userId, cardDefinitionId), so a user can have concurrent open payments for different cards.
export interface StoredPayAtStoreSession {
  paymentId: number;
  cardDefinitionId: number;
  storeId: number;
  couponCode?: string;
  cardName: string;
  amount: number;
  qrPayload: string;
  verificationCode: string;
  createdAtMs: number;
}

const MAX_HISTORY = 3;

export const storageService = {
  // --- Access token ---
  getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
  },
  setAccessToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, token);
  },

  // --- Refresh token ---
  getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.REFRESH_TOKEN);
  },
  setRefreshToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, token);
  },

  // --- User identity ---
  getUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.USER_ID);
  },
  setUserId(userId: string): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.USER_ID, userId);
  },

  // --- Bulk auth clear ---
  async clearAuth(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(STORAGE_KEYS.USER_ID),
    ]);
  },

  // --- Onboarding flag ---
  async hasSeenOnboarding(): Promise<boolean> {
    const val = await SecureStore.getItemAsync(STORAGE_KEYS.HAS_SEEN_ONBOARDING);
    return val === 'true';
  },
  markOnboardingComplete(): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.HAS_SEEN_ONBOARDING, 'true');
  },

  // --- Location coords ---
  async getLocation(): Promise<StoredLocation | null> {
    const [lat, lng, updatedAt, source] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEYS.LOCATION_LAT),
      SecureStore.getItemAsync(STORAGE_KEYS.LOCATION_LNG),
      SecureStore.getItemAsync(STORAGE_KEYS.LOCATION_UPDATED_AT),
      SecureStore.getItemAsync(STORAGE_KEYS.LOCATION_SOURCE),
    ]);
    if (!lat || !lng) return null;
    return {
      latitude: Number(lat),
      longitude: Number(lng),
      updatedAt: updatedAt ?? new Date().toISOString(),
      // Installs from before LOCATION_SOURCE existed have no stored value —
      // 'gps' matches their only-ever-possible source at the time.
      source: source === 'manual' ? 'manual' : 'gps',
    };
  },
  async setLocation(latitude: number, longitude: number, updatedAt: string, source: LocationSource): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEYS.LOCATION_LAT, String(latitude)),
      SecureStore.setItemAsync(STORAGE_KEYS.LOCATION_LNG, String(longitude)),
      SecureStore.setItemAsync(STORAGE_KEYS.LOCATION_UPDATED_AT, updatedAt),
      SecureStore.setItemAsync(STORAGE_KEYS.LOCATION_SOURCE, source),
    ]);
  },
  async clearLocation(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEYS.LOCATION_LAT),
      SecureStore.deleteItemAsync(STORAGE_KEYS.LOCATION_LNG),
      SecureStore.deleteItemAsync(STORAGE_KEYS.LOCATION_UPDATED_AT),
      SecureStore.deleteItemAsync(STORAGE_KEYS.LOCATION_SOURCE),
    ]);
  },

  // --- Location display name (reverse-geocoded locality) ---
  getLocationName(): Promise<string | null> {
    return SecureStore.getItemAsync(STORAGE_KEYS.LOCATION_NAME);
  },
  setLocationName(name: string): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.LOCATION_NAME, name);
  },

  // --- Recent location history (last MAX_HISTORY distinct named locations) ---
  async getLocationHistory(): Promise<RecentLocation[]> {
    const raw = await SecureStore.getItemAsync(STORAGE_KEYS.LOCATION_HISTORY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as RecentLocation[];
    } catch {
      return [];
    }
  },
  async addToLocationHistory(entry: RecentLocation): Promise<void> {
    const history = await storageService.getLocationHistory();
    // Remove duplicate (same name or very close coords within ~0.01 degree)
    const deduped = history.filter(
      (h) =>
        h.name !== entry.name &&
        Math.abs(h.latitude - entry.latitude) > 0.01 &&
        Math.abs(h.longitude - entry.longitude) > 0.01,
    );
    const updated = [entry, ...deduped].slice(0, MAX_HISTORY);
    await SecureStore.setItemAsync(STORAGE_KEYS.LOCATION_HISTORY, JSON.stringify(updated));
  },

  // --- Notifications toggle (device-local intent, synced to OS permission on read) ---
  // Defaults to true (opt-out) when the user has never touched this setting — most
  // people never go looking for a notifications toggle to turn it on themselves, so a
  // fresh install should already be getting redemption/subscription alerts rather than
  // silently missing them until someone finds Settings. Once set explicitly (either
  // direction, via setNotificationsEnabled), that stored value always wins.
  async getNotificationsEnabled(): Promise<boolean> {
    const val = await SecureStore.getItemAsync(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
    return val === null ? true : val === 'true';
  },
  setNotificationsEnabled(enabled: boolean): Promise<void> {
    return SecureStore.setItemAsync(STORAGE_KEYS.NOTIFICATIONS_ENABLED, String(enabled));
  },

  // --- Pay-at-Store in-flight sessions (see StoredPayAtStoreSession) — a list, since more
  // than one can be open at once (different cards). Keyed by paymentId. ---
  async getPayAtStoreSessions(): Promise<StoredPayAtStoreSession[]> {
    const raw = await SecureStore.getItemAsync(STORAGE_KEYS.PAY_AT_STORE_SESSIONS);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as StoredPayAtStoreSession[]) : [];
    } catch {
      return [];
    }
  },
  async addPayAtStoreSession(session: StoredPayAtStoreSession): Promise<void> {
    const sessions = await storageService.getPayAtStoreSessions();
    const deduped = sessions.filter((s) => s.paymentId !== session.paymentId);
    await SecureStore.setItemAsync(STORAGE_KEYS.PAY_AT_STORE_SESSIONS, JSON.stringify([...deduped, session]));
  },
  async removePayAtStoreSession(paymentId: number): Promise<void> {
    const sessions = await storageService.getPayAtStoreSessions();
    const remaining = sessions.filter((s) => s.paymentId !== paymentId);
    await SecureStore.setItemAsync(STORAGE_KEYS.PAY_AT_STORE_SESSIONS, JSON.stringify(remaining));
  },
  async clearAllPayAtStoreSessions(): Promise<void> {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.PAY_AT_STORE_SESSIONS);
  },
};
