// Keys used with expo-secure-store.
// All auth tokens live in the secure enclave; never in AsyncStorage.

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strike_access_token',
  REFRESH_TOKEN: 'strike_refresh_token',
  USER_ID: 'strike_user_id',
  HAS_SEEN_ONBOARDING: 'strike_onboarding_complete',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
