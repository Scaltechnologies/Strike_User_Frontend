import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  EligibleMenu,
  PurchaseSubscriptionRequest,
  Subscription,
  SubscriptionPage,
} from '@/types/subscription';

export const subscriptionApi = {
  // Returns active subscriptions only; server auto-expires stale ones.
  getMyActive: async (): Promise<Subscription[]> => {
    const { data } = await apiClient.get<ApiSuccessResponse<Subscription[]>>(
      API_ENDPOINTS.SUBSCRIPTIONS.MY_ACTIVE,
    );
    return data.data;
  },

  getMy: async (params?: { page?: number; size?: number }): Promise<SubscriptionPage> => {
    const { data } = await apiClient.get<ApiSuccessResponse<SubscriptionPage>>(
      API_ENDPOINTS.SUBSCRIPTIONS.MY,
      { params },
    );
    return data.data;
  },

  getById: async (id: string | number): Promise<Subscription> => {
    const { data } = await apiClient.get<ApiSuccessResponse<Subscription>>(
      API_ENDPOINTS.SUBSCRIPTIONS.DETAIL(id),
    );
    return data.data;
  },

  // Returns eligible menu for redemption. Subscription must be ACTIVE.
  getEligibleMenu: async (id: string | number): Promise<EligibleMenu> => {
    const { data } = await apiClient.get<ApiSuccessResponse<EligibleMenu>>(
      API_ENDPOINTS.SUBSCRIPTIONS.MENU(id),
    );
    return data.data;
  },

  purchase: async (body: PurchaseSubscriptionRequest): Promise<Subscription> => {
    const { data } = await apiClient.post<ApiSuccessResponse<Subscription>>(
      API_ENDPOINTS.SUBSCRIPTIONS.PURCHASE,
      body,
    );
    return data.data;
  },

  cancel: async (id: string | number): Promise<Subscription> => {
    const { data } = await apiClient.patch<ApiSuccessResponse<Subscription>>(
      API_ENDPOINTS.SUBSCRIPTIONS.CANCEL(id),
    );
    return data.data;
  },
};
