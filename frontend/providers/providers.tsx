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
