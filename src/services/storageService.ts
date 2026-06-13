// Thin wrapper around expo-secure-store.
// All auth tokens are stored in the OS secure enclave (Keychain / Keystore).
// Never use AsyncStorage for tokens.

import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@/constants/storage';

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

  // --- Bulk auth clear (on logout or refresh failure) ---
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
};
