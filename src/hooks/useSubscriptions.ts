import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subscriptionApi } from '@/api/subscription.api';
import type { PurchaseSubscriptionRequest } from '@/types/subscription';

export const subscriptionKeys = {
  all:       ['subscriptions'] as const,
  myActive:  () => [...subscriptionKeys.all, 'my', 'active'] as const,
  my:        (page = 0) => [...subscriptionKeys.all, 'my', 'list', page] as const,
  detail:    (id: string | number) => [...subscriptionKeys.all, 'detail', String(id)] as const,
  menu:      (id: string | number) => [...subscriptionKeys.all, 'menu', String(id)] as const,
};

export function useMyActiveSubscriptions() {
  return useQuery({
    queryKey: subscriptionKeys.myActive(),
    queryFn:  subscriptionApi.getMyActive,
    staleTime: 2 * 60 * 1000,
  });
}

export function useMySubscriptions(page = 0) {
  return useQuery({
    queryKey: subscriptionKeys.my(page),
    queryFn:  () => subscriptionApi.getMy({ page, size: 20 }),
    staleTime: 2 * 60 * 1000,
  });
}

export function useSubscriptionDetail(id: string | number | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.detail(id ?? ''),
    queryFn:  () => subscriptionApi.getById(id!),
    enabled:  !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useEligibleMenu(id: string | number | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.menu(id ?? ''),
    queryFn:  () => subscriptionApi.getEligibleMenu(id!),
    enabled:  !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionRequest) => subscriptionApi.purchase(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}
