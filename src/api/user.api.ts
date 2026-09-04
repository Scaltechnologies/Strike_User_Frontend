import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type {
  UpdateLocationRequest,
  UpdateLocationResponse,
  UserProfile,
  UserProfileDto,
  UpdateProfileRequest,
  RegisterPushTokenRequest,
  PushDeviceDto,
} from '@/types/user';

// user-service returns raw DTOs directly — no ApiSuccessResponse wrapper
// (same pattern as store.api.ts: getStores returns Store[] directly), but its
// field names (userId/mobileNumber/profilePicUrl) differ from the app's UserProfile
// shape (id/phone/avatarUrl), so every profile call maps through this first.
function toUserProfile(dto: UserProfileDto): UserProfile {
  return {
    id: String(dto.userId),
    name: dto.name ?? '',
    phone: dto.mobileNumber,
    email: dto.email,
    gender: dto.gender,
    avatarUrl: dto.profilePicUrl,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

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
    const { data } = await apiClient.get<UserProfileDto>(API_ENDPOINTS.USER.PROFILE);
    return toUserProfile(data);
  },

  // Backend only exposes PUT /api/user/me, not PATCH.
  updateProfile: async (updates: UpdateProfileRequest): Promise<UserProfile> => {
    const { data } = await apiClient.put<UserProfileDto>(API_ENDPOINTS.USER.PROFILE, updates);
    return toUserProfile(data);
  },

  uploadAvatar: async (uri: string, mimeType: string): Promise<UserProfile> => {
    const form = new FormData();
    form.append('file', { uri, type: mimeType, name: 'avatar.jpg' } as unknown as Blob);
    const { data } = await apiClient.post<UserProfileDto>(
      API_ENDPOINTS.USER.AVATAR,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return toUserProfile(data);
  },

  // Returns the backend's own PushDevice row (its numeric id in particular) —
  // callers that want to later disable this exact device (see logout in
  // profile.tsx) need it, since disable is by id, not by token.
  registerPushToken: async (token: string, platform: 'ios' | 'android'): Promise<PushDeviceDto> => {
    const { data } = await apiClient.post<PushDeviceDto>(API_ENDPOINTS.USER.PUSH_TOKEN, {
      platform: platform === 'ios' ? 'IOS' : 'ANDROID',
      deviceToken: token,
    } satisfies RegisterPushTokenRequest);
    return data;
  },

  // Soft-disables this device row so it stops receiving push after logout —
  // registerOrRefresh() flips it back to active (and reassigns ownership) the
  // next time any account registers the same token on this device.
  unregisterPushToken: async (deviceId: number): Promise<void> => {
    await apiClient.delete(API_ENDPOINTS.USER.PUSH_DEVICE_BY_ID(deviceId));
  },
};
