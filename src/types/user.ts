// User Service DTOs — mirrors the strike-gateway /api/user/* contracts.

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

export interface UpdateProfileRequest {
  name?: string;
  email?: string;
}

export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
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
