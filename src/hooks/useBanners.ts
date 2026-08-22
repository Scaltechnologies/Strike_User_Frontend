import { useQuery } from '@tanstack/react-query';
import { bannerApi } from '@/api/banner.api';

export function useActiveBanners() {
  return useQuery({
    queryKey: ['banners', 'active'],
    queryFn: bannerApi.getActive,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
