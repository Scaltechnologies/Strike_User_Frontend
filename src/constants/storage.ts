// Keys used with expo-secure-store.
// All auth tokens live in the secure enclave; never in AsyncStorage.

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strike_access_token',
  REFRESH_TOKEN: 'strike_refresh_token',
  USER_ID: 'strike_user_id',
  HAS_SEEN_ONBOARDING: 'strike_onboarding_complete',
  LOCATION_LAT: 'strike_location_lat',
  LOCATION_LNG: 'strike_location_lng',
  LOCATION_UPDATED_AT: 'strike_location_updated_at',
  LOCATION_NAME: 'strike_location_name',
  LOCATION_HISTORY: 'strike_location_history',
  NOTIFICATIONS_ENABLED: 'strike_notifications_enabled',
  // Superseded by PAY_AT_STORE_SESSIONS (a list — a user can have concurrent Pay-at-Store
  // payments open for different cards) — kept only so any leftover value from an earlier
  // build doesn't linger under an active-looking key name; nothing reads/writes it anymore.
  PAY_AT_STORE_SESSION: 'strike_pay_at_store_session',
  PAY_AT_STORE_SESSIONS: 'strike_pay_at_store_sessions',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
