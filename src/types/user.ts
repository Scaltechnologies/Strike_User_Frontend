// User Service DTOs — mirrors the strike-gateway /api/user/* contracts.

export type Gender = 'MALE' | 'FEMALE';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// Raw shape returned by user-service's GET/PUT /api/user/me and POST /api/user/me/avatar
// (UserProfileResponse.java) — field names differ from UserProfile above, so user.api.ts
// maps this onto UserProfile rather than trusting it directly.
export interface UserProfileDto {
  userId: number;
  name: string | null;
  email: string | null;
  gender: Gender | null;
  mobileNumber: string;
  profilePicUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileRequest {
  name?: string;
  email?: string;
  gender?: Gender;
}

export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
}

// Backend contract: notification-service's DeviceRegisterRequest
// (platform must be uppercase ANDROID|IOS|WEB).
export interface RegisterPushTokenRequest {
  platform: 'ANDROID' | 'IOS' | 'WEB';
  deviceToken: string;
}

// Backend contract: notification-service's PushDevice entity — returned as-is
// (no DTO wrapper) from POST/GET /api/notifications/me/devices. Only the
// fields this app actually reads are declared.
export interface PushDeviceDto {
  id: number;
  platform: string;
  deviceToken: string;
  active: boolean;
}

export interface UpdateLocationResponse {
  userId: number;
  name: string | null;
  email: string | null;
  mobileNumber: string;
  profilePicUrl: string | null;
  latitude: number;
  longitude: number;
  lastLocationAt: string;
  createdAt: string;
}
