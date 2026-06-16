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
};
