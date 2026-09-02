import { API_ENDPOINTS, DEFAULT_RADIUS_KM } from '@/constants/api';
import type { CategorySummary, MenuCategory, Store } from '@/types/store';
import { apiClient } from './client';

export const storeApi = {
  // GET /api/user/stores — full catalogue, no location required
  // user-service returns raw List<StoreResponse> (no ApiSuccessResponse wrapper)
  getStores: async (): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.LIST);
    return Array.isArray(data) ? data : [];
  },

  // GET /api/user/stores/search?q=…&lat=&lng=&radiusKm= — debounced text search.
  // lat/lng/radiusKm are optional — when the caller has a known location, results
  // come back distance-filtered and nearest-first with distanceKm populated;
  // omitted (no location permission/fix yet), this is a plain keyword search.
  searchStores: async (
    query: string,
    location?: { latitude: number; longitude: number; radiusKm?: number },
  ): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.SEARCH, {
      params: {
        q: query,
        ...(location && { lat: location.latitude, lng: location.longitude, radiusKm: location.radiusKm ?? DEFAULT_RADIUS_KM }),
      },
    });
    return Array.isArray(data) ? data : [];
  },

  // GET /api/user/stores/nearby/me?radiusKm=… — backend uses the user's saved location
  getNearbyStores: async (radiusKm: number = DEFAULT_RADIUS_KM): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.NEARBY, {
      params: { radiusKm },
    });
    return Array.isArray(data) ? data : [];
  },

  // GET /api/user/stores/{id}
  getStoreById: async (storeId: string | number): Promise<Store> => {
    const { data } = await apiClient.get<Store>(API_ENDPOINTS.USER_STORES.DETAIL(storeId));
    return data;
  },

  // GET /api/user/stores/{id}/menu → list of categories each containing their items
  getStoreMenu: async (storeId: string | number): Promise<MenuCategory[]> => {
    const { data } = await apiClient.get<MenuCategory[]>(API_ENDPOINTS.USER_STORES.MENU(storeId));
    return Array.isArray(data) ? data : [];
  },

  // GET /api/user/stores/categories — distinct category names deduped across
  // every store's menu, for the home screen's category row.
  getCategories: async (): Promise<CategorySummary[]> => {
    const { data } = await apiClient.get<CategorySummary[]>(API_ENDPOINTS.USER_STORES.CATEGORIES);
    return Array.isArray(data) ? data : [];
  },

  // GET /api/user/stores/by-category?name=… — stores whose MENU has a category
  // matching this name (fuzzy-matched server-side). Distinct from searchStores'
  // `category` param, which filters on each store's single business-level tag.
  getStoresByCategory: async (name: string): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.BY_CATEGORY, {
      params: { name },
    });
    return Array.isArray(data) ? data : [];
  },
};
