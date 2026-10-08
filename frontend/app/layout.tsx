import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/providers/providers';

export const metadata: Metadata = {
  title: 'AGAP Operations Center',
  description: 'AGAP Emergency Response and Incident Coordination Platform',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
