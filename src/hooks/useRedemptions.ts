import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { redemptionApi } from '@/api/redemption.api';
import type { RedemptionRequest } from '@/types/redemption';

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
    },
  });
}
