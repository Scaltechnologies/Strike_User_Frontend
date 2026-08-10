import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { ValidateCouponResponse } from '@/types/coupon';

export const couponApi = {
  validate: async (code: string, cardDefinitionId: number): Promise<ValidateCouponResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<ValidateCouponResponse>>(
      API_ENDPOINTS.COUPONS.VALIDATE,
      { code, cardDefinitionId },
    );
    return data.data;
  },
};
