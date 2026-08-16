import { apiClient } from './client';
import { API_ENDPOINTS } from '@/constants/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { CreatePaymentRequest, PaymentResponse, VerifyPaymentRequest } from '@/types/payment';

export const paymentApi = {
  // Idempotency-Key prevents a double-tap (or a retried request after a slow/
  // dropped response) from opening two payment sessions for the same purchase.
  create: async (body: CreatePaymentRequest, idempotencyKey: string): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.CREATE,
      body,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return data.data;
  },

  getById: async (id: string | number): Promise<PaymentResponse> => {
    const { data } = await apiClient.get<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.DETAIL(id),
    );
    return data.data;
  },

  verify: async (id: string | number, body: VerifyPaymentRequest): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.VERIFY(id),
      body,
    );
    return data.data;
  },

  // User backed out of checkout. The backend reconciles with the gateway before
  // trusting this — a real charge that landed anyway still resolves to SUCCESS.
  cancel: async (id: string | number): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.CANCEL(id),
    );
    return data.data;
  },

  // Only valid once the payment has reached a terminal non-SUCCESS state.
  // Opens a brand-new gateway attempt under the same Payment.
  retry: async (id: string | number): Promise<PaymentResponse> => {
    const { data } = await apiClient.post<ApiSuccessResponse<PaymentResponse>>(
      API_ENDPOINTS.PAYMENTS.RETRY(id),
    );
    return data.data;
  },
};
