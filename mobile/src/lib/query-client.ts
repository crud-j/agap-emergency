import { QueryClient } from '@tanstack/react-query';

/**
 * The app's one query cache. Here rather than in the root layout so the auth store can clear it:
 * most keys aren't per account, so nothing cached may outlive the session it belongs to.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 3 retries with exponential backoff (1 s → 2 s → 4 s) so brief backend
      // startup windows don't permanently strand queries in error state.
      retry: 3,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      staleTime: 30_000,
    },
  },
});
