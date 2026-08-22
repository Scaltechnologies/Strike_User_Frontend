// Tracks the device-local instant a redemption request was submitted, keyed
// by redemption id. redemption-service's `createdAt` carries no timezone
// marker, so parsing it is inherently ambiguous (naive local vs UTC) — for a
// redemption submitted THIS session we already know the true moment for
// certain (the device clock at submit time), so that's preferred over
// parsing the server string. See getRedemptionCreatedAtMs in useRedemptions.ts.

import { create } from 'zustand';

interface LocalRedemptionTimesState {
  times: Record<number, number>;
  record: (redemptionId: number, atMs?: number) => void;
}

export const useLocalRedemptionTimesStore = create<LocalRedemptionTimesState>()((set) => ({
  times: {},
  record: (redemptionId, atMs = Date.now()) =>
    set((s) => ({ times: { ...s.times, [redemptionId]: atMs } })),
}));
