'use client';

import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useAuthUser } from '@/lib/use-auth';
import { canOpen, landingForRole } from '@/lib/role-access';

/**
 * Shows "Not available for your role" in place of a console page the signed-in role
 * cannot use (a bookmark, a typed URL, an old link), instead of a page that 403s or
 * renders empty data. Navigation only; the backend enforces every permission.
 */
export function RouteGuard({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const user = useAuthUser();

  // AuthGate renders nothing below it until the session is restored.
  if (!user || canOpen(user.role, pathname)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-agap-surface">
        <Lock size={28} className="text-agap-textSub" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-agap-textMain">Not available for your role</h1>
        <p className="mt-1 max-w-sm text-sm text-agap-textSub">
          This page is not part of your workspace. Use the sidebar, or go back to your start page.
        </p>
      </div>
      <Link
        href={landingForRole(user.role)}
        className="rounded-lg bg-[#126247] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F543D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
      >
        Go to my start page
      </Link>
    </div>
  );
}
