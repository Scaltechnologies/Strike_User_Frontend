import { storeApi } from '@/api/store.api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Hierarchical query key factory — used for targeted invalidation.
export const storeKeys = {
  all:    ['stores'] as const,
  list:   () => [...storeKeys.all, 'list'] as const,
  nearby: () => [...storeKeys.all, 'nearby'] as const,
  search: (query: string) => [...storeKeys.all, 'search', query] as const,
  detail: (id: string | number) => [...storeKeys.all, 'detail', String(id)] as const,
  menu:   (id: string | number) => [...storeKeys.all, 'menu', String(id)] as const,
  categories: () => [...storeKeys.all, 'categories'] as const,
  byCategory: (name: string) => [...storeKeys.all, 'byCategory', name] as const,
};

// Home screen category row — deduped across every store, rarely changes.
export function useStoreCategories() {
  return useQuery({
    queryKey: storeKeys.categories(),
    queryFn: storeApi.getCategories,
    staleTime: 10 * 60 * 1000,
  });
}

// Stores matching a tapped category chip — enabled only while one is selected.
export function useStoresByCategory(name: string | null) {
  return useQuery({
    queryKey: storeKeys.byCategory(name ?? ''),
    queryFn: () => storeApi.getStoresByCategory(name!),
    enabled: !!name,
    staleTime: 60 * 1000,
  });
}

// All stores — always loaded, no location dependency.
export function useAllStores() {
  return useQuery({
    queryKey: storeKeys.list(),
    queryFn: storeApi.getStores,
    staleTime: 3 * 60 * 1000,
  });
}

// Nearby stores — only enabled once the user's location has been saved
// to the backend (locationStatus === 'ready').
export function useNearbyStores(opts: { enabled: boolean }) {
  return useQuery({
    queryKey: storeKeys.nearby(),
    queryFn: async () => {
      console.log("🚀 Nearby query started");

      try {
        const result = await storeApi.getNearbyStores();
        console.log("✅ Nearby success:", result);
        return result;
      } catch (error) {
        console.log("❌ Nearby failed:", error);
        throw error;
      }
    },
    enabled: opts.enabled,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 400) return false;
      return failureCount < 2;
    },
  });
}

// Search — enabled once query reaches 2+ characters.
export function useSearchStores(query: string) {
  return useQuery({
    queryKey: storeKeys.search(query),
    queryFn: () => storeApi.searchStores(query),
    enabled: query.trim().length >= 2,
    staleTime: 30 * 1000,
  });
}

// Store detail — single store by id.
export function useStoreDetail(id: string | number) {
  return useQuery({
    queryKey: storeKeys.detail(id),
    queryFn: () => storeApi.getStoreById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Store menu — categories + items for a store.
export function useStoreMenu(id: string | number) {
  return useQuery({
    queryKey: storeKeys.menu(id),
    queryFn: () => storeApi.getStoreMenu(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

// Convenience hook for invalidating all store data (used in pull-to-refresh).
export function useInvalidateStores() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: storeKeys.all });
}
