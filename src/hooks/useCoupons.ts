import { useMutation, useQuery } from '@tanstack/react-query';
import { couponApi } from '@/api/coupon.api';

export function useValidateCoupon() {
  return useMutation({
    mutationFn: ({ code, cardDefinitionId }: { code: string; cardDefinitionId: number }) =>
      couponApi.validate(code, cardDefinitionId),
  });
}

// Browsable coupons for a card — powers the "available coupons" dropdown in the
// activation sheet. Best-effort on the server (empty list on failure), so this
// never blocks checkout the way validate's error path can.
export function useAvailableCoupons(cardDefinitionId: number | undefined) {
  return useQuery({
    queryKey: ['coupons', 'available', cardDefinitionId ?? ''],
    queryFn: () => couponApi.listAvailable(cardDefinitionId!),
    enabled: !!cardDefinitionId,
    staleTime: 60 * 1000,
  });
}
