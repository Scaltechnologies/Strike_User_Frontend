// TanStack Query client + provider.
//
// The QueryClient is created once at module level so it survives re-renders
// of the provider. Per-feature staleTime and cache TTLs are set here as
// defaults; individual queries can override them.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Exported (not just used internally) so authStore.clearAuth() can wipe every cached query on
// logout — see the comment there for why that matters: query keys like ['subscriptions','my',
// 'active'] or ['profile'] aren't scoped by user id, so without this a second account signing in
// on the same device would see the first account's cached data until each query happened to
// naturally refetch (which, within its staleTime window, might not happen at all).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5 minutes before data is considered stale. Feature-specific screens
      // that need fresher data (e.g. eligible menu) set staleTime: 0.
      staleTime: 5 * 60 * 1000,
      // Retry failed requests twice with exponential back-off (max 30 s).
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
    mutations: {
      // Never auto-retry mutations — let the UI surface the error immediately.
      retry: 0,
    },
  },
});

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
