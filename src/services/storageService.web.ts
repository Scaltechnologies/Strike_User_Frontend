// Web counterpart to storageService.ts — expo-secure-store has no web implementation
// (SecureStore.setItemAsync throws "is not a function" in a browser), so this mirrors the
// same interface using localStorage. Metro/Expo picks this file automatically on the web
// platform in place of storageService.ts, the same way other .web.ts/.web.tsx files in this
// codebase already override their native counterpart (see use-color-scheme.web.ts,
// animated-icon.web.tsx). Not as tamper-resistant as native SecureStore, but consistent with
// how any web app stores a session token — real protection is the backend's short-lived
// access token + refresh rotation, not where the token bytes sit client-side.
import { STORAGE_KEYS } from '@/constants/storage';

export interface StoredLocation {
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export interface RecentLocation {
  latitude: number;
  longitude: number;
  name: string | null;
  usedAt: string;
}

// See storageService.ts's StoredPayAtStoreSession for why this exists.
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

function getItem(key: string): Promise<string | null> {
  try {
    return Promise.resolve(window.localStorage.getItem(key));
  } catch {
    return Promise.resolve(null);
  }
}
function setItem(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore — e.g. storage disabled/full; matches SecureStore's fire-and-forget callers
  }
  return Promise.resolve();
}
function deleteItem(key: string): Promise<void> {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
  return Promise.resolve();
}

export const storageService = {
  // --- Access token ---
  getAccessToken(): Promise<string | null> {
    return getItem(STORAGE_KEYS.ACCESS_TOKEN);
  },
  setAccessToken(token: string): Promise<void> {
    return setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
  },

  // --- Refresh token ---
  getRefreshToken(): Promise<string | null> {
    return getItem(STORAGE_KEYS.REFRESH_TOKEN);
  },
  setRefreshToken(token: string): Promise<void> {
    return setItem(STORAGE_KEYS.REFRESH_TOKEN, token);
  },

  // --- User identity ---
  getUserId(): Promise<string | null> {
    return getItem(STORAGE_KEYS.USER_ID);
  },
  setUserId(userId: string): Promise<void> {
    return setItem(STORAGE_KEYS.USER_ID, userId);
  },

  // --- Bulk auth clear ---
  async clearAuth(): Promise<void> {
    await Promise.all([
      deleteItem(STORAGE_KEYS.ACCESS_TOKEN),
      deleteItem(STORAGE_KEYS.REFRESH_TOKEN),
      deleteItem(STORAGE_KEYS.USER_ID),
    ]);
  },

  // --- Onboarding flag ---
  async hasSeenOnboarding(): Promise<boolean> {
    const val = await getItem(STORAGE_KEYS.HAS_SEEN_ONBOARDING);
    return val === 'true';
  },
  markOnboardingComplete(): Promise<void> {
    return setItem(STORAGE_KEYS.HAS_SEEN_ONBOARDING, 'true');
  },

  // --- Location coords ---
  async getLocation(): Promise<StoredLocation | null> {
    const [lat, lng, updatedAt] = await Promise.all([
      getItem(STORAGE_KEYS.LOCATION_LAT),
      getItem(STORAGE_KEYS.LOCATION_LNG),
      getItem(STORAGE_KEYS.LOCATION_UPDATED_AT),
    ]);
    if (!lat || !lng) return null;
    return {
      latitude: Number(lat),
      longitude: Number(lng),
      updatedAt: updatedAt ?? new Date().toISOString(),
    };
  },
  async setLocation(latitude: number, longitude: number, updatedAt: string): Promise<void> {
    await Promise.all([
      setItem(STORAGE_KEYS.LOCATION_LAT, String(latitude)),
      setItem(STORAGE_KEYS.LOCATION_LNG, String(longitude)),
      setItem(STORAGE_KEYS.LOCATION_UPDATED_AT, updatedAt),
    ]);
  },
  async clearLocation(): Promise<void> {
    await Promise.all([
      deleteItem(STORAGE_KEYS.LOCATION_LAT),
      deleteItem(STORAGE_KEYS.LOCATION_LNG),
      deleteItem(STORAGE_KEYS.LOCATION_UPDATED_AT),
    ]);
  },

  // --- Location display name (reverse-geocoded locality) ---
  getLocationName(): Promise<string | null> {
    return getItem(STORAGE_KEYS.LOCATION_NAME);
  },
  setLocationName(name: string): Promise<void> {
    return setItem(STORAGE_KEYS.LOCATION_NAME, name);
  },

  // --- Recent location history (last MAX_HISTORY distinct named locations) ---
  async getLocationHistory(): Promise<RecentLocation[]> {
    const raw = await getItem(STORAGE_KEYS.LOCATION_HISTORY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as RecentLocation[];
    } catch {
      return [];
    }
  },
  async addToLocationHistory(entry: RecentLocation): Promise<void> {
    const history = await storageService.getLocationHistory();
    const deduped = history.filter(
      (h) =>
        h.name !== entry.name &&
        Math.abs(h.latitude - entry.latitude) > 0.01 &&
        Math.abs(h.longitude - entry.longitude) > 0.01,
    );
    const updated = [entry, ...deduped].slice(0, MAX_HISTORY);
    await setItem(STORAGE_KEYS.LOCATION_HISTORY, JSON.stringify(updated));
  },

  // --- Notifications toggle (device-local intent, synced to OS permission on read) ---
  async getNotificationsEnabled(): Promise<boolean> {
    const val = await getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
    return val === 'true';
  },
  setNotificationsEnabled(enabled: boolean): Promise<void> {
    return setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, String(enabled));
  },

  // --- Pay-at-Store in-flight sessions (see StoredPayAtStoreSession) — a list, since more
  // than one can be open at once (different cards). Keyed by paymentId. ---
  async getPayAtStoreSessions(): Promise<StoredPayAtStoreSession[]> {
    const raw = await getItem(STORAGE_KEYS.PAY_AT_STORE_SESSIONS);
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
    await setItem(STORAGE_KEYS.PAY_AT_STORE_SESSIONS, JSON.stringify([...deduped, session]));
  },
  async removePayAtStoreSession(paymentId: number): Promise<void> {
    const sessions = await storageService.getPayAtStoreSessions();
    const remaining = sessions.filter((s) => s.paymentId !== paymentId);
    await setItem(STORAGE_KEYS.PAY_AT_STORE_SESSIONS, JSON.stringify(remaining));
  },
  async clearAllPayAtStoreSessions(): Promise<void> {
    await deleteItem(STORAGE_KEYS.PAY_AT_STORE_SESSIONS);
  },
};
