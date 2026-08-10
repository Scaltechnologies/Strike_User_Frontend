// Maintenance-mode Zustand store.
//
// Two things can flip this on:
//   1. The startup check in MaintenanceProvider (GET API_ENDPOINTS.APP.STATUS).
//   2. Any API call mid-session getting a 503 from the backend (see the
//      response interceptor in api/client.ts) — e.g. an admin enables
//      maintenance mode while the user already has the app open.
// Both funnel into this single source of truth so the root layout only
// needs to read `isMaintenance` once.

import { create } from 'zustand';

const DEFAULT_MESSAGE = "App is in maintenance, we'll be back soon.";

interface MaintenanceState {
  isMaintenance: boolean;
  message: string;
}

interface MaintenanceActions {
  setMaintenance: (on: boolean, message?: string) => void;
}

export const useMaintenanceStore = create<MaintenanceState & MaintenanceActions>()(
  (set) => ({
    isMaintenance: false,
    message: DEFAULT_MESSAGE,

    setMaintenance: (on, message) =>
      set({ isMaintenance: on, message: message?.trim() || DEFAULT_MESSAGE }),
  }),
);
