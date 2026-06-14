import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { UpdateLocationRequest, UpdateLocationResponse } from '@/types/user';

export const userApi = {
  // PATCH /api/user/me/location — saves GPS coords so the backend can
  // compute distances for /api/user/stores/nearby/me
  updateLocation: async (latitude: number, longitude: number): Promise<UpdateLocationResponse> => {
    const { data } = await apiClient.patch<UpdateLocationResponse>(
      API_ENDPOINTS.USER.LOCATION,
      { latitude, longitude } satisfies UpdateLocationRequest,
    );
    return data;
  },
};
