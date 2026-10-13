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
            retry: (failureCount, error: unknown) => {
              const e = error as { status?: number } | null;
              if (e?.status === 401 || e?.status === 403) return false;
              return failureCount < 3;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <ToastProvider>
          {children}
          <ToastViewport />
        </ToastProvider>
      </SocketProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
