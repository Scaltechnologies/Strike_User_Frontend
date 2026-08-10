import { useMutation } from '@tanstack/react-query';
import { couponApi } from '@/api/coupon.api';

export function useValidateCoupon() {
  return useMutation({
    mutationFn: ({ code, cardDefinitionId }: { code: string; cardDefinitionId: number }) =>
      couponApi.validate(code, cardDefinitionId),
  });
}
