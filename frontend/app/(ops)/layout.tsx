import type { ReactNode, JSX } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';

/** Ops shell — wraps all Operations Center routes with Sidebar + Topbar. */
export default function OpsLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-agap-pearl">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
