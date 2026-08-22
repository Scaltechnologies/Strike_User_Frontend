import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { Banner } from '@/types/banner';

export const bannerApi = {
  // GET /api/banners/active — PROVISIONAL path, see constants/api.ts.
  // Assumed to return a raw array (unwrapped), matching user-service's other
  // list endpoints (store.api.ts) rather than the ApiSuccessResponse-wrapped
  // shape card-service/subscription-service use.
  getActive: async (): Promise<Banner[]> => {
    const { data } = await apiClient.get<Banner[]>(API_ENDPOINTS.BANNERS.ACTIVE);
    return Array.isArray(data) ? data : [];
  },
};
