import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { Store } from '@/types/store';

export const storeApi = {
  // GET /api/user/stores — full catalogue, no location required
  getStores: async (): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.LIST);
    return data;
  },

  // GET /api/user/stores/search?query=… — debounced text search
  searchStores: async (query: string): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.SEARCH, {
      params: { q: query },
    });
    return data;
  },

  // GET /api/user/stores/nearby/me — backend uses the user's saved location
  getNearbyStores: async (): Promise<Store[]> => {
    const { data } = await apiClient.get<Store[]>(API_ENDPOINTS.USER_STORES.NEARBY);
    return data;
  },
};
