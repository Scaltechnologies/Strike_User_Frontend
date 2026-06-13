// Global app-level preferences store.
// Not persisted to secure storage (nothing sensitive here).
// Reset on every cold launch — that is intentional for permission states.

import { create } from 'zustand';

type LocationPermission = 'granted' | 'denied' | 'not-asked';

interface AppState {
  hasSeenOnboarding: boolean;
  notificationsEnabled: boolean;
  locationPermission: LocationPermission;
}

interface AppActions {
  setOnboardingSeen: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setLocationPermission: (status: LocationPermission) => void;
}

export const useAppStore = create<AppState & AppActions>()(
  (set) => ({
    hasSeenOnboarding: false,
    notificationsEnabled: false,
    locationPermission: 'not-asked',

    setOnboardingSeen: () => set({ hasSeenOnboarding: true }),
    setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
    setLocationPermission: (status) => set({ locationPermission: status }),
  }),
);
