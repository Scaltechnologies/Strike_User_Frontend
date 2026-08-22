import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { redemptionApi } from '@/api/redemption.api';
import { useAuthStore } from '@/store/authStore';
import { useLocalRedemptionTimesStore } from '@/store/localRedemptionTimes';
import { subscriptionKeys } from './useSubscriptions';
import type { Redemption, RedemptionRequest } from '@/types/redemption';

// redemption-service now returns createdAt with an explicit trailing 'Z'
// (its JVM runs in UTC), so `new Date(redemption.createdAt)` parses correctly.
// For a redemption submitted THIS session we still prefer the locally-recorded
// submit instant when available — it's exact, and shields against any
// redemption loaded from a server response that predates this fix.
export function getRedemptionCreatedAtMs(redemption: Pick<Redemption, 'id' | 'createdAt'>): number {
  const local = useLocalRedemptionTimesStore.getState().times[redemption.id];
  if (local != null) return local;
  return new Date(redemption.createdAt).getTime();
}

export const redemptionKeys = {
  all:            ['redemptions'] as const,
  detail:         (id: number | string) =>
    [...redemptionKeys.all, 'detail', String(id)] as const,
  bySubscription: (subId: number | string) =>
    [...redemptionKeys.all, 'subscription', String(subId)] as const,
  byUser:         (userId: string) =>
    [...redemptionKeys.all, 'user', userId] as const,
};

// Per-subscription redemption history — used by subscription detail screen.
export function useSubscriptionRedemptions(subscriptionId: number | string | undefined) {
  return useQuery({
    queryKey: redemptionKeys.bySubscription(subscriptionId ?? ''),
    queryFn:  () => redemptionApi.getBySubscription(subscriptionId!),
    enabled:  !!subscriptionId,
    staleTime: 30 * 1000,
  });
}

// All redemptions for the authenticated user — used by the History tab.
export function useUserRedemptions(userId: string | null | undefined) {
  return useQuery({
    queryKey: redemptionKeys.byUser(userId ?? ''),
    queryFn:  () => redemptionApi.getByUser(userId!),
    enabled:  !!userId,
    staleTime: 30 * 1000,
  });
}

// Single redemption — used by pending screen (polling) and approved/rejected screens.
export function useRedemptionDetail(id: number | string | undefined) {
  return useQuery({
    queryKey: redemptionKeys.detail(id ?? ''),
    queryFn:  () => redemptionApi.getById(id!),
    enabled:  !!id,
    staleTime: 0, // always re-fetch — pending redemptions change status at any moment
  });
}

// User-initiated redemption request mutation.
export function useRequestRedemption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RedemptionRequest) => redemptionApi.request(body),
    onSuccess: (redemption) => {
      // Cache the new redemption immediately so the pending screen has it.
      queryClient.setQueryData(
        redemptionKeys.detail(redemption.id),
        redemption,
      );
      // Record the true submit instant from the device clock — see
      // getRedemptionCreatedAtMs — so "Xm ago" is guaranteed correct for
      // this request regardless of how the server formats createdAt.
      useLocalRedemptionTimesStore.getState().record(redemption.id);
      // Refresh the user's redemption list so the persistent tracking bar
      // (usePendingRedemptions, mounted on every tab) picks up the new
      // PENDING request immediately instead of waiting for its next poll.
      const { userId } = useAuthStore.getState();
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: redemptionKeys.byUser(userId) });
      }
    },
  });
}

// User-initiated cancel of a PENDING redemption — lets the user withdraw a
// request (e.g. an item turned out unavailable) instead of waiting out the
// vendor's response window before they can submit a new one.
export function useCancelRedemption() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.userId);
  return useMutation({
    mutationFn: (id: number | string) => redemptionApi.cancel(id),
    onSuccess: (redemption) => {
      queryClient.setQueryData(redemptionKeys.detail(redemption.id), redemption);
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: redemptionKeys.byUser(userId) });
      }
      void queryClient.invalidateQueries({ queryKey: redemptionKeys.bySubscription(redemption.subscriptionId) });
    },
  });
}

// Live-tracked PENDING redemptions for the persistent "track your request"
// bar (shown across all tabs, mirrors a food-delivery-app order tracker).
// Polls every 5s only while something is actually pending — idle otherwise —
// so it catches an approval/rejection promptly without polling forever.
export function usePendingRedemptions(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: redemptionKeys.byUser(userId ?? ''),
    queryFn: () => redemptionApi.getByUser(userId!),
    enabled: !!userId,
    staleTime: 0,
    refetchInterval: (q) => {
      const data = q.state.data as Redemption[] | undefined;
      return data?.some((r) => r.status === 'PENDING') ? 5000 : false;
    },
  });

  const pending = useMemo(
    () =>
      (query.data ?? [])
        .filter((r) => r.status === 'PENDING')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [query.data],
  );

  // pending.tsx invalidates the subscription/wallet caches when a redemption
  // resolves, but only while that screen is actually mounted — if the user
  // backs out to Home before the vendor acts, nothing else on the client
  // catches the eventual approval, so the wallet balance shown elsewhere goes
  // silently stale. This hook, however, is mounted globally (PendingRedemptionBar
  // lives in the tabs layout) and already polls every 5s while anything is
  // PENDING, so it's the one place guaranteed to observe every transition —
  // diff each poll against the previous one and invalidate on any PENDING →
  // terminal change, regardless of which screen (if any) is on screen.
  const previouslyPendingIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    const all = query.data ?? [];
    const nowPendingIds = new Set(all.filter((r) => r.status === 'PENDING').map((r) => r.id));

    for (const r of all) {
      if (previouslyPendingIds.current.has(r.id) && r.status !== 'PENDING') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail(r.subscriptionId) });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.my(0) });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.menu(r.subscriptionId) });
        void queryClient.invalidateQueries({ queryKey: redemptionKeys.bySubscription(r.subscriptionId) });
      }
    }

    previouslyPendingIds.current = nowPendingIds;
  }, [query.data, queryClient]);

  return { pending };
}
