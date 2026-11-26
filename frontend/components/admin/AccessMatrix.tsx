'use client';

import type { JSX, ReactNode } from 'react';
import { Check, Info, Minus, Smartphone } from 'lucide-react';
import { ACCESS_PAGES, ACCESS_ROLES, canOpen } from '@/lib/role-access';
import { cn } from '@/lib/utils';

/**
 * MOD-47, read-only: which web console role may open which page. Built from the same
 * route rules the console applies on every navigation (lib/role-access.ts), so it can't
 * drift from what people actually see. The API checks every request again on the server.
 */
export function AccessMatrix(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Note icon={Info} tone="info">
          <span className="font-semibold">Read-only.</span> Access is set in the code, and the server checks it again on every
          request. To give someone more access, change their role in Users &amp; Accounts.
        </Note>
        <Note icon={Smartphone} tone="muted">
          Citizens, guests and responders use the AGAP mobile app, not this console, so they are not listed here.
        </Note>
      </div>

      <div className="overflow-hidden rounded-2xl border border-agap-track/60 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <caption className="sr-only">Pages each web console role can open</caption>
            <thead>
              <tr className="border-b border-agap-track/50 bg-agap-surface/70">
                <th scope="col" className="sticky left-0 z-10 bg-agap-surface/95 px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-agap-textSub">
                  Page
                </th>
                {ACCESS_ROLES.map(({ role, label }) => (
                  <th key={role} scope="col" className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-agap-textSub">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            {ACCESS_PAGES.map(({ area, pages }) => (
              <tbody key={area}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={ACCESS_ROLES.length + 1}
                    className="border-b border-agap-track/40 bg-white px-5 pb-1.5 pt-4 text-left text-[11px] font-bold uppercase tracking-widest text-agap-green"
                  >
                    {area}
                  </th>
                </tr>
                {pages.map((page) => (
                  <tr key={page.href} className="border-b border-agap-track/25 transition-colors last:border-0 hover:bg-agap-surface/50">
                    <th scope="row" className="sticky left-0 bg-white px-5 py-2.5 text-left font-normal">
                      <span className="block font-medium text-agap-textMain">{page.label}</span>
                      <code className="text-[11px] text-agap-textSub">{page.href}</code>
                    </th>
                    {ACCESS_ROLES.map(({ role, label }) => {
                      const open = canOpen(role, page.href);
                      return (
                        <td key={role} className="px-3 py-2.5 text-center">
                          <span
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-full',
                              open ? 'bg-agap-greenSoft text-agap-green' : 'text-agap-track',
                            )}
                          >
                            {open ? <Check size={15} strokeWidth={2.6} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                            <span className="sr-only">{open ? `${label} can open` : `${label} cannot open`}</span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-agap-textSub">
        A tick means the role can open the page. Some pages show less to some roles: for example, an Org Administrator
        sees ID Reviews only when their organization is MDRRMO, and the System Administrator sees only the Registry tab of
        Fleet &amp; Units.
      </p>
    </div>
  );
}

function Note({ icon: Icon, tone, children }: {
  icon: typeof Info;
  tone: 'info' | 'muted';
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed',
        tone === 'info'
          ? 'border-[rgba(37,99,235,0.18)] bg-agap-infoSoft text-agap-info'
          : 'border-agap-track/50 bg-agap-surface/70 text-agap-textMid',
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
