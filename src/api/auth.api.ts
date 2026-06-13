import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
} from '@/types/auth';

export const authApi = {
  sendOtp: async (phone: string): Promise<SendOtpResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<SendOtpResponse>>(
      API_ENDPOINTS.AUTH.SEND_OTP,
      { mobileNumber: phone } satisfies SendOtpRequest,
    );
    return data.data;
  },

  verifyOtp: async (phone: string, otp: string): Promise<VerifyOtpResponse> => {
    const { data } = await apiClient.post<VerifyOtpResponse>(
      API_ENDPOINTS.AUTH.VERIFY_OTP,
      { mobileNumber: phone, otp } satisfies VerifyOtpRequest,
    );
    return data;
  },
};
