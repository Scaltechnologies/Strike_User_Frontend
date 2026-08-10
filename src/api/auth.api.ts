import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type {
  FirebaseVerifyRequest,
  SendOtpRequest,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@/types/auth';

export const authApi = {
  // Exchanges a verified Firebase ID token for the app's own JWT/refresh token pair.
  // Currently unused — see sendOtp/verifyOtp below.
  verifyFirebaseToken: async (idToken: string): Promise<VerifyOtpResponse> => {
    const { data } = await apiClient.post<VerifyOtpResponse>(
      API_ENDPOINTS.AUTH.FIREBASE_VERIFY,
      { idToken } satisfies FirebaseVerifyRequest,
    );
    return data;
  },

  // TEMPORARY — legacy mock-OTP flow. See constants/api.ts.
  sendOtp: async (mobileNumber: string): Promise<void> => {
    await apiClient.post(
      API_ENDPOINTS.AUTH.SEND_OTP,
      { mobileNumber } satisfies SendOtpRequest,
    );
  },

  // TEMPORARY — legacy mock-OTP flow. See constants/api.ts.
  verifyOtp: async (mobileNumber: string, otp: string): Promise<VerifyOtpResponse> => {
    const { data } = await apiClient.post<VerifyOtpResponse>(
      API_ENDPOINTS.AUTH.VERIFY_OTP,
      { mobileNumber, otp } satisfies VerifyOtpRequest,
    );
    return data;
  },
};
