// Auth Service DTOs — mirrors the strike-gateway /api/auth/* contracts.

export interface SendOtpRequest {
  mobileNumber: string;
}

export interface SendOtpResponse {
  message: string;
  expiresIn: number; // seconds until OTP expires
}

export interface VerifyOtpRequest {
  mobileNumber: string;
  otp: string;
}

export interface VerifyOtpResponse {
  token: string;
  refreshToken: string;
  userId: number;
  newUser: boolean;
  message: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}
