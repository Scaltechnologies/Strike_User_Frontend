import { create } from 'zustand';

export type LocationPermission = 'granted' | 'denied' | 'blocked' | 'not-asked';

// Fine-grained status drives the home screen UI: what to show and which
// action buttons are active at any given moment.
export type LocationStatus =
  | 'idle'        // not yet initialized
  | 'checking'    // reading current OS permission state
  | 'requesting'  // system permission dialog is open
  | 'detecting'   // GPS acquisition in progress
  | 'updating'    // PATCHing location to backend
  | 'ready'       // coords available, nearby stores can load
  | 'denied'      // user said "Don't Allow" (can still ask again)
  | 'blocked'     // permanently denied — must open Settings
  | 'error';      // GPS failed (timeout, hardware error, etc.)

export interface Coords {
  latitude: number;
  longitude: number;
}

// Mirrors LocationPermission/LocationStatus — same idle → checking/requesting →
// ready|denied|blocked shape drives the Notifications settings screen.
export type NotificationPermission = 'granted' | 'denied' | 'blocked' | 'not-asked';
export type NotificationStatus =
  | 'idle'
  | 'checking'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'blocked'
  | 'error';

interface AppState {
  hasSeenOnboarding: boolean;
  notificationsEnabled: boolean;
  notificationPermission: NotificationPermission;
  notificationStatus: NotificationStatus;
  locationPermission: LocationPermission;
  locationStatus: LocationStatus;
  coords: Coords | null;
  locationUpdatedAt: string | null;
  locationName: string | null;  // reverse-geocoded locality name
}

interface AppActions {
  setOnboardingSeen: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationPermission: (status: NotificationPermission) => void;
  setNotificationStatus: (status: NotificationStatus) => void;
  setLocationPermission: (status: LocationPermission) => void;
  setLocationStatus: (status: LocationStatus) => void;
  setCoords: (coords: Coords | null, updatedAt?: string) => void;
  setLocationName: (name: string | null) => void;
  resetLocation: () => void;
}

export const useAppStore = create<AppState & AppActions>()(
  (set) => ({
    hasSeenOnboarding: false,
    notificationsEnabled: false,
    notificationPermission: 'not-asked',
    notificationStatus: 'idle',
    locationPermission: 'not-asked',
    locationStatus: 'idle',
    coords: null,
    locationUpdatedAt: null,
    locationName: null,

    setOnboardingSeen: () => set({ hasSeenOnboarding: true }),
    setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
    setNotificationPermission: (status) => set({ notificationPermission: status }),
    setNotificationStatus: (status) => set({ notificationStatus: status }),
    setLocationPermission: (status) => set({ locationPermission: status }),
    setLocationStatus: (status) => set({ locationStatus: status }),
    setCoords: (coords, updatedAt) =>
      set({ coords, locationUpdatedAt: updatedAt ?? new Date().toISOString() }),
    setLocationName: (name) => set({ locationName: name }),
    resetLocation: () =>
      set({
        locationStatus: 'idle',
        locationPermission: 'not-asked',
        coords: null,
        locationUpdatedAt: null,
        locationName: null,
      }),
  }),
);
