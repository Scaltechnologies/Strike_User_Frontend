import { useQuery } from '@tanstack/react-query';
import { cardApi } from '@/api/card.api';

export const cardKeys = {
  all:     ['cards'] as const,
  byStore: (storeId: string | number) => [...cardKeys.all, 'store', String(storeId)] as const,
  byId:    (id: string | number)      => [...cardKeys.all, 'detail', String(id)] as const,
  lowestPriceByStores: (storeIds: (string | number)[]) =>
    [...cardKeys.all, 'lowestPriceByStores', ...storeIds.map(String).sort()] as const,
};

export function useStoreCards(storeId: string | number | undefined) {
  return useQuery({
    queryKey: cardKeys.byStore(storeId ?? ''),
    queryFn:  () => cardApi.getByStore(storeId!),
    enabled:  !!storeId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCardDetail(id: string | number | undefined) {
  return useQuery({
    queryKey: cardKeys.byId(id ?? ''),
    queryFn:  () => cardApi.getById(id!),
    enabled:  !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Cheapest active card per store, batched — for "Starting from ₹X" on a store
// list. Pass every store id currently on screen; empty/unmounted while none.
export function useLowestCardPricesByStores(storeIds: (string | number)[]) {
  return useQuery({
    queryKey: cardKeys.lowestPriceByStores(storeIds),
    queryFn:  () => cardApi.getLowestPricesByStores(storeIds),
    enabled:  storeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
