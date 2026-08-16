// Auth Zustand store.
//
// In-memory state is the single source of truth at runtime.
// Persistence to expo-secure-store is fire-and-forget (void) — the store
// never awaits it so synchronous callers (e.g. the axios interceptor) get
// the updated token immediately from getState().

import { create } from 'zustand';

import { queryClient } from '@/providers/QueryProvider';
import { storageService } from '@/services/storageService';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  // true until bootstrapAuth() resolves; prevents routing before hydration.
  isBootstrapping: boolean;
}

interface AuthActions {
  // Called after OTP verification — sets tokens in memory + persists.
  setTokens: (accessToken: string, refreshToken: string, userId?: string) => void;
  setUserId: (userId: string) => void;
  // Clears in-memory state + wipes secure storage. Called on logout or
  // refresh failure. AuthProvider reacts to isAuthenticated → false and
  // navigates the user to login.
  clearAuth: () => void;
  // Reads from secure storage on app launch to rehydrate auth state.
  bootstrapAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  (set) => ({
    token: null,
    refreshToken: null,
    userId: null,
    isAuthenticated: false,
    isBootstrapping: true,

    setTokens: (accessToken, refreshToken, userId) => {
      set((prev) => ({
        token: accessToken,
        refreshToken,
        userId: userId ?? prev.userId,
        isAuthenticated: true,
      }));
      void storageService.setAccessToken(accessToken);
      void storageService.setRefreshToken(refreshToken);
      if (userId) void storageService.setUserId(userId);
    },

    setUserId: (userId) => {
      set({ userId });
      void storageService.setUserId(userId);
    },

    clearAuth: () => {
      set({
        token: null,
        refreshToken: null,
        userId: null,
        isAuthenticated: false,
      });
      void storageService.clearAuth();
      // Without this, every cached query (subscriptions, cards, profile, redemption history,
      // ledger transactions...) stays in memory keyed by endpoint only, not by user — so the
      // next account to log in on this device would see the previous account's data rendered
      // immediately from cache, correct or not depending on whether/when each query happened
      // to refetch. This is the single choke point both explicit "Sign out" and a failed silent
      // token refresh go through, so it covers both ways a session actually ends.
      queryClient.clear();
    },

    bootstrapAuth: async () => {
      try {
        const [token, refreshToken, userId] = await Promise.all([
          storageService.getAccessToken(),
          storageService.getRefreshToken(),
          storageService.getUserId(),
        ]);

        if (token && refreshToken) {
          set({ token, refreshToken, userId, isAuthenticated: true });
        }
      } catch {
        // Secure store read failed — treat as unauthenticated.
      } finally {
        set({ isBootstrapping: false });
      }
    },
  }),
);
