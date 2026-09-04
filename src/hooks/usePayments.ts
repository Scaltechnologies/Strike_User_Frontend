import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { paymentApi } from '@/api/payment.api';
import { subscriptionKeys } from '@/hooks/useSubscriptions';
import type { CreatePaymentRequest, PaymentStatus, VerifyPaymentRequest } from '@/types/payment';

export const paymentKeys = {
  all: ['payments'] as const,
  mode: ['payments', 'mode'] as const,
  detail: (id: number | string) => [...paymentKeys.all, 'detail', String(id)] as const,
};

// Backs the ActivationSheet payment-method picker — a short staleTime (rather than relying on
// mount-only fetches) so a mode change from the admin panel shows up on the next time someone
// opens checkout without requiring an app restart, while still not refetching on every render.
export function usePaymentMode() {
  return useQuery({
    queryKey: paymentKeys.mode,
    queryFn: paymentApi.getMode,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

const POLLABLE_STATUSES: PaymentStatus[] = [
  'CREATED',
  'PENDING',
  'PROCESSING',
  'AWAITING_VENDOR_CONFIRMATION',
];

// The user is actively watching the QR/code screen for the first couple of
// minutes — poll quickly. After that the Pay-at-Store session can sit open
// for hours (backend TTL), so back off to avoid hammering the API.
const FAST_POLL_MS = 4_000;
const SLOW_POLL_MS = 15_000;
const FAST_WINDOW_MS = 2 * 60 * 1000;

// Polls GET /api/payments/{id} while the payment is open, stops once it
// reaches a terminal status. Background-pause and foreground-refetch come
// for free from the app-wide focusManager wiring in QueryProvider.tsx (same
// as usePendingRedemptions) — no AppState listener needed here.
export function usePayment(paymentId: number | undefined, opts?: { enabled?: boolean }) {
  const startedAtRef = useRef(0);
  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);
  return useQuery({
    queryKey: paymentKeys.detail(paymentId ?? ''),
    queryFn: () => paymentApi.get(paymentId!),
    enabled: !!paymentId && (opts?.enabled ?? true),
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && !POLLABLE_STATUSES.includes(data.status)) return false;
      return Date.now() - startedAtRef.current < FAST_WINDOW_MS ? FAST_POLL_MS : SLOW_POLL_MS;
    },
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreatePaymentRequest; idempotencyKey: string }) =>
      paymentApi.create(body, idempotencyKey),
    onSuccess: (payment) => {
      queryClient.setQueryData(paymentKeys.detail(payment.paymentId), payment);
    },
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, body }: { paymentId: number; body: VerifyPaymentRequest }) =>
      paymentApi.verify(paymentId, body),
    onSuccess: (payment) => {
      queryClient.setQueryData(paymentKeys.detail(payment.paymentId), payment);
      if (payment.status === 'SUCCESS') {
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.myActive() });
        void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      }
    },
  });
}

export function useCancelPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: number) => paymentApi.cancel(paymentId),
    onSuccess: (payment) => {
      queryClient.setQueryData(paymentKeys.detail(payment.paymentId), payment);
    },
  });
}
