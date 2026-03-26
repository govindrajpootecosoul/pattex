import { QueryClient } from '@tanstack/react-query';

// Global QueryClient used to cache API GET requests.
// We keep the defaults aligned with the "frontend caching" guidance.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 0,
    },
  },
});

