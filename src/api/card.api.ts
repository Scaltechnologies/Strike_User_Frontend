import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { CardDefinition } from '@/types/card';

export const cardApi = {
  getByStore: async (storeId: string | number): Promise<CardDefinition[]> => {
    const { data } = await apiClient.get<ApiSuccessResponse<CardDefinition[]>>(
      API_ENDPOINTS.CARDS.BY_STORE(storeId),
    );
    return data.data;
  },

  getById: async (id: string | number): Promise<CardDefinition> => {
    const { data } = await apiClient.get<ApiSuccessResponse<CardDefinition>>(
      API_ENDPOINTS.CARDS.BY_ID(id),
    );
    return data.data;
  },

  // GET /api/cards/new-arrivals — active cards created in the last 3 days,
  // newest first. Eligibility is entirely server-computed; the app never
  // decides expiry itself.
  getNewArrivals: async (limit = 10): Promise<CardDefinition[]> => {
    const { data } = await apiClient.get<ApiSuccessResponse<CardDefinition[]>>(
      API_ENDPOINTS.CARDS.NEW_ARRIVALS,
      { params: { limit } },
    );
    return data.data;
  },

  // GET /api/cards/lowest-price-by-stores?storeIds=1,2,3 — cheapest active card
  // per store, batched. Backs "Starting from ₹X" on the home screen's store
  // list. Stores with no active card are simply absent from the response.
  getLowestPricesByStores: async (storeIds: (string | number)[]): Promise<Record<number, number>> => {
    if (storeIds.length === 0) return {};
    const { data } = await apiClient.get<ApiSuccessResponse<Record<string, number>>>(
      API_ENDPOINTS.CARDS.LOWEST_PRICE_BY_STORES,
      { params: { storeIds: storeIds.join(',') } },
    );
    const byId: Record<number, number> = {};
    for (const [storeId, price] of Object.entries(data.data ?? {})) {
      byId[Number(storeId)] = price;
    }
    return byId;
  },
};
