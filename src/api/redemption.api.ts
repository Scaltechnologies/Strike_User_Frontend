import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { Redemption, RedemptionRequest } from '@/types/redemption';

export const redemptionApi = {
  // User-initiated: POST /api/redemptions/request
  request: async (body: RedemptionRequest): Promise<Redemption> => {
    const { data } = await apiClient.post<ApiSuccessResponse<Redemption>>(
      API_ENDPOINTS.REDEMPTIONS.REQUEST,
      body,
    );
    return data.data;
  },

  getById: async (id: number | string): Promise<Redemption> => {
    const { data } = await apiClient.get<ApiSuccessResponse<Redemption>>(
      API_ENDPOINTS.REDEMPTIONS.DETAIL(id),
    );
    return data.data;
  },

  getBySubscription: async (subscriptionId: number | string): Promise<Redemption[]> => {
    const { data } = await apiClient.get<ApiSuccessResponse<{ content: Redemption[] }>>(
      API_ENDPOINTS.REDEMPTIONS.BY_SUBSCRIPTION(subscriptionId),
    );
    return Array.isArray(data.data?.content) ? data.data.content : [];
  },

  getByUser: async (userId: number | string): Promise<Redemption[]> => {
    const { data } = await apiClient.get<ApiSuccessResponse<{ content: Redemption[] }>>(
      API_ENDPOINTS.REDEMPTIONS.BY_USER(userId),
    );
    return Array.isArray(data.data?.content) ? data.data.content : [];
  },

  // Vendor: GET /api/redemptions/store/{storeId}/queue
  getStoreQueue: async (storeId: number | string): Promise<Redemption[]> => {
    const { data } = await apiClient.get<ApiSuccessResponse<Redemption[]>>(
      API_ENDPOINTS.REDEMPTIONS.STORE_QUEUE(storeId),
    );
    return Array.isArray(data.data) ? data.data : [];
  },

  // Vendor: POST /api/redemptions/{id}/approve
  approve: async (id: number | string): Promise<Redemption> => {
    const { data } = await apiClient.post<ApiSuccessResponse<Redemption>>(
      API_ENDPOINTS.REDEMPTIONS.APPROVE(id),
    );
    return data.data;
  },

  // Vendor: POST /api/redemptions/{id}/reject
  reject: async (id: number | string, reason?: string): Promise<Redemption> => {
    const { data } = await apiClient.post<ApiSuccessResponse<Redemption>>(
      API_ENDPOINTS.REDEMPTIONS.REJECT(id),
      reason ? { reason } : undefined,
    );
    return data.data;
  },
};
