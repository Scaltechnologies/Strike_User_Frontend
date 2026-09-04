import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { CreatePaymentRequest, PaymentMode, PaymentResponse, VerifyPaymentRequest } from '@/types/payment';

export const paymentApi = {
  getMode: async (): Promise<PaymentMode> => {
    const { data } = await apiClient.get<ApiSuccessResponse<{ paymentMode: PaymentMode }>>(
      API_ENDPOINTS.PAYMENTS.MODE,
    );
    return data.data.paymentMode;
  },

  // Idempotency-Key prevents a double-tap (or a network retry) from opening
  // two separate gateway orders for the same checkout attempt.
  create: async (body: CreatePaymentRequest, idempotencyKey: string): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.CREATE,
      body,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data.data;
  },

  get: async (id: number): Promise<PaymentResponse> => {
    const { data } = await apiClient.get<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.DETAIL(id),
    );
    return data.data;
  },

  verify: async (id: number, body: VerifyPaymentRequest): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.VERIFY(id),
      body,
    );
    return data.data;
  },

  // Best-effort cleanup when the user backs out of checkout before it
  // resolves — moves the session to a terminal state so a retry isn't
  // blocked by the backend's in-progress-payment dedupe window.
  cancel: async (id: number): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.CANCEL(id),
    );
    return data.data;
  },
};
