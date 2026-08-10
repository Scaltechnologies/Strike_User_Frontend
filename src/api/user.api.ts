import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type {
  UpdateLocationRequest,
  UpdateLocationResponse,
  UserProfile,
  UpdateProfileRequest,
  RegisterPushTokenRequest,
} from '@/types/user';

// user-service returns raw DTOs directly — no ApiSuccessResponse wrapper
// (same pattern as store.api.ts: getStores returns Store[] directly)
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

  getProfile: async (): Promise<UserProfile> => {
    const { data } = await apiClient.get<UserProfile>(API_ENDPOINTS.USER.PROFILE);
    return data;
  },

  updateProfile: async (updates: UpdateProfileRequest): Promise<UserProfile> => {
    const { data } = await apiClient.patch<UserProfile>(API_ENDPOINTS.USER.PROFILE, updates);
    return data;
  },

  uploadAvatar: async (uri: string, mimeType: string): Promise<UserProfile> => {
    const form = new FormData();
    form.append('file', { uri, type: mimeType, name: 'avatar.jpg' } as unknown as Blob);
    const { data } = await apiClient.post<UserProfile>(
      API_ENDPOINTS.USER.AVATAR,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data;
  },

  registerPushToken: async (token: string, platform: 'ios' | 'android'): Promise<void> => {
    await apiClient.post(API_ENDPOINTS.USER.PUSH_TOKEN, { token, platform } satisfies RegisterPushTokenRequest);
  },
};
