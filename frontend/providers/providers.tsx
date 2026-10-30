'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactElement, type ReactNode } from 'react';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { SocketProvider } from './socket-provider';

export function Providers({ children }: { children: ReactNode }): ReactElement {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            // 5-minute cache before GC — avoids re-fetching data still in memory
            gcTime: 5 * 60 * 1000,
            // Window focus refetch causes a cascade of requests whenever the user
            // alt-tabs back to the dashboard — disable it; WS events keep data fresh.
            refetchOnWindowFocus: false,
            // 'offlineFirst' stops TanStack from pausing queries when it thinks the
            // network is unavailable (can misfire with a running backend on localhost).
            networkMode: 'offlineFirst',
            // Retry network failures and 5xx only. A 4xx answer will not change on
            // retry, and retrying a 429 (rate limited) only deepens the limit.
            retry: (failureCount, error: unknown) => {
              const status = (error as { status?: number } | null)?.status;
              if (status !== undefined && status >= 400 && status < 500) return false;
              return failureCount < 3;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Toasts wrap the socket provider: it shows live transport notices (MOD-40). */}
      <ToastProvider>
        <SocketProvider>
          {children}
          <ToastViewport />
        </SocketProvider>
      </ToastProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
