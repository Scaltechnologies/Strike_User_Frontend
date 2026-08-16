import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '@/api/payment.api';
import { subscriptionKeys } from './useSubscriptions';
import type { CreatePaymentRequest, PaymentStatus, VerifyPaymentRequest } from '@/types/payment';
import { isPaymentTerminal } from '@/types/payment';

export const paymentKeys = {
  all:    ['payments'] as const,
  detail: (id: string | number) => [...paymentKeys.all, 'detail', String(id)] as const,
};

export function useCreatePayment() {
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreatePaymentRequest; idempotencyKey: string }) =>
      paymentApi.create(body, idempotencyKey),
  });
}

// Polls while the payment is still open — mirrors the redemption pending-screen
// pattern (server is the source of truth; the app just watches for it to
// resolve to a terminal status via reconciliation/webhook).
export function usePayment(id: string | number | undefined, options?: { poll?: boolean }) {
  return useQuery({
    queryKey: paymentKeys.detail(id ?? ''),
    queryFn: () => paymentApi.getById(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      if (!options?.poll) return false;
      const status = query.state.data?.status as PaymentStatus | undefined;
      if (status && isPaymentTerminal(status)) return false;
      return 4000;
    },
  });
}

export function useVerifyPayment(paymentId: string | number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyPaymentRequest) => paymentApi.verify(paymentId!, body),
    onSuccess: (data) => {
      if (paymentId) queryClient.setQueryData(paymentKeys.detail(paymentId), data);
      if (data.status === 'SUCCESS') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      }
    },
  });
}

export function useCancelPayment(paymentId: string | number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => paymentApi.cancel(paymentId!),
    onSuccess: (data) => {
      if (paymentId) queryClient.setQueryData(paymentKeys.detail(paymentId), data);
      if (data.status === 'SUCCESS') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      }
    },
  });
}

export function useRetryPayment(paymentId: string | number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => paymentApi.retry(paymentId!),
    onSuccess: (data) => {
      if (paymentId) queryClient.setQueryData(paymentKeys.detail(paymentId), data);
    },
  });
}
