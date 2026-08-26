// Reactive mirror of storageService's persisted Pay-at-Store sessions — same pairing pattern as
// authStore (in-memory zustand state is the source of truth at runtime; SecureStore is the
// durable backing store, written fire-and-forget). Exists so a persistent tracker bar (see
// PayAtStorePendingBar) can show/hide/update live from anywhere in the app — a plain SecureStore
// read only tells you the state at one point in time, not when it changes.
//
// Holds a LIST, not a single session: the backend never merges or replaces Pay-at-Store payments
// across cards (each purchase gets its own independent row — see PaymentServiceImpl#
// createPayAtStorePayment), so a user can have several concurrent open payments for different
// cards, and each must stay independently trackable rather than the newest silently replacing
// the last.
import { create } from 'zustand';
import { storageService, type StoredPayAtStoreSession } from '@/services/storageService';

interface PayAtStoreSessionState {
  sessions: StoredPayAtStoreSession[];
  // True once the store has synced with SecureStore at least once (via hydrate(), or
  // implicitly via addSession/removeSession/clearAll). Guards hydrate() from clobbering
  // sessions that were just added synchronously but whose SecureStore write is still in flight.
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addSession: (session: StoredPayAtStoreSession) => void;
  removeSession: (paymentId: number) => void;
  clearAll: () => void;
}

export const usePayAtStoreSessionStore = create<PayAtStoreSessionState>()((set, get) => ({
  sessions: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const diskSessions = await storageService.getPayAtStoreSessions();
    // Merge rather than replace — an addSession/removeSession call may have already run (and
    // flipped `hydrated` to true) while this read was in flight. Discarding this read in that
    // case would silently drop whatever was already persisted from a prior app session instead
    // of merging it in, making an older still-open request invisible until the app restarts even
    // though it was never actually lost from disk.
    set((state) => {
      const knownIds = new Set(state.sessions.map((s) => s.paymentId));
      const fromDisk = diskSessions.filter((s) => !knownIds.has(s.paymentId));
      return { sessions: [...state.sessions, ...fromDisk], hydrated: true };
    });
  },

  addSession: (session) => {
    set((state) => ({
      sessions: [...state.sessions.filter((s) => s.paymentId !== session.paymentId), session],
      hydrated: true,
    }));
    void storageService.addPayAtStoreSession(session);
  },

  removeSession: (paymentId) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.paymentId !== paymentId),
      hydrated: true,
    }));
    void storageService.removePayAtStoreSession(paymentId);
  },

  clearAll: () => {
    set({ sessions: [], hydrated: true });
    void storageService.clearAllPayAtStoreSessions();
  },
}));
