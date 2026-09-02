import { DEFAULT_RADIUS_KM } from '@/constants/api';
import { storeApi } from '@/api/store.api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Rounded to ~1.1km grid cells (2 decimal places) — enough to bucket "the same
// neighborhood" together so React Query reuses results across the tiny GPS
// jitter a watcher can report, without going so coarse that a real move
// between areas silently keeps stale results under the same key.
function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

// Hierarchical query key factory — used for targeted invalidation.
export const storeKeys = {
  all:    ['stores'] as const,
  list:   () => [...storeKeys.all, 'list'] as const,
  nearby: () => [...storeKeys.all, 'nearby'] as const,
  search: (query: string, latitude?: number, longitude?: number, radiusKm?: number) =>
    [
      ...storeKeys.all,
      'search',
      query,
      latitude != null ? roundCoord(latitude) : null,
      longitude != null ? roundCoord(longitude) : null,
      latitude != null ? (radiusKm ?? DEFAULT_RADIUS_KM) : null,
    ] as const,
  detail: (id: string | number) => [...storeKeys.all, 'detail', String(id)] as const,
  menu:   (id: string | number) => [...storeKeys.all, 'menu', String(id)] as const,
  categories: () => [...storeKeys.all, 'categories'] as const,
  byCategory: (name: string) => [...storeKeys.all, 'byCategory', name] as const,
};

// Home screen category row — deduped across every store, rarely changes.
// The backend can still hand back the same category name more than once (e.g.
// contributed independently by two stores' menus), so dedupe defensively here
// too — otherwise CategoriesRow renders duplicate icons under a duplicate key.
export function useStoreCategories() {
  return useQuery({
    queryKey: storeKeys.categories(),
    queryFn: storeApi.getCategories,
    staleTime: 10 * 60 * 1000,
    select: (categories) => {
      const seen = new Set<string>();
      return categories.filter((cat) => {
        if (seen.has(cat.name)) return false;
        seen.add(cat.name);
        return true;
      });
    },
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
// to the backend (locationStatus === 'ready'). radiusKm is sent explicitly
// (rather than relying on the backend's own default) so it's a visible,
// adjustable contract value — see DEFAULT_RADIUS_KM.
export function useNearbyStores(opts: { enabled: boolean; radiusKm?: number }) {
  const radiusKm = opts.radiusKm ?? DEFAULT_RADIUS_KM;
  return useQuery({
    queryKey: storeKeys.nearby(),
    queryFn: () => storeApi.getNearbyStores(radiusKm),
    enabled: opts.enabled,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 400) return false;
      return failureCount < 2;
    },
  });
}

// Search — enabled once query reaches 2+ characters. Location-aware when
// latitude/longitude are supplied (results come back distance-filtered and
// nearest-first); falls back to a plain keyword search when location isn't
// available yet (permission skipped/denied, or GPS hasn't resolved) — the
// query key includes the (rounded) coordinates so a location change never
// serves stale results from a different area.
export function useSearchStores(query: string, latitude?: number, longitude?: number, radiusKm?: number) {
  const hasLocation = latitude != null && longitude != null;
  return useQuery({
    queryKey: storeKeys.search(query, latitude, longitude, radiusKm),
    queryFn: async () => {
      console.log('[Search]', { query, hasLocation, radiusKm: hasLocation ? (radiusKm ?? DEFAULT_RADIUS_KM) : null });
      const results = await storeApi.searchStores(
        query,
        hasLocation ? { latitude: latitude!, longitude: longitude!, radiusKm } : undefined,
      );
      console.log('[Search] Result count', results.length);
      return results;
    },
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
