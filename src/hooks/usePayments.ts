import { useMutation, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '@/api/payment.api';
import { subscriptionKeys } from '@/hooks/useSubscriptions';
import type { CreatePaymentRequest, VerifyPaymentRequest } from '@/types/payment';

export function useCreatePayment() {
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreatePaymentRequest; idempotencyKey: string }) =>
      paymentApi.create(body, idempotencyKey),
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, body }: { paymentId: number; body: VerifyPaymentRequest }) =>
      paymentApi.verify(paymentId, body),
    onSuccess: (payment) => {
      if (payment.status === 'SUCCESS') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      }
    },
  });
}

export function useCancelPayment() {
  return useMutation({
    mutationFn: (paymentId: number) => paymentApi.cancel(paymentId),
  });
}
