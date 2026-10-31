'use client';

import { useState, type JSX } from 'react';
import { useTranslations } from '@/hooks/use-translations';

interface BackupCodesPanelProps {
  codes: string[];
  /** When given, shows the "I saved these" checkbox the caller uses to gate "Continue". */
  acknowledged?: boolean;
  onAcknowledgedChange?: (value: boolean) => void;
}

const buttonClass =
  'inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40';

function fileText(codes: string[]): string {
  return [
    'AGAP — Operations Center backup codes',
    'Each code works once. Keep them somewhere safe and private.',
    '',
    ...codes,
    '',
  ].join('\n');
}

export function BackupCodesPanel({ codes, acknowledged, onAcknowledgedChange }: BackupCodesPanelProps): JSX.Element {
  const t = useTranslations().mfa;
  const setup = useTranslations().setup;
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  function download(): void {
    const url = URL.createObjectURL(new Blob([fileText(codes)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agap-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  function print(): void {
    // Codes are [a-z2-9-] only, so they are safe to write into the print window as-is.
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return;
    w.document.write(
      `<title>AGAP backup codes</title><pre style="font:16px/1.8 ui-monospace,monospace">${fileText(codes)}</pre>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the user can still select the codes by hand or download them.
    }
  }

  return (
    <div>
      <div className="relative">
        <ul
          aria-label={t.backupHeading}
          className="grid grid-cols-2 gap-x-5 gap-y-2.5 rounded-2xl bg-[#14161D] p-5 font-mono text-sm font-semibold tracking-wider text-[#EAF1FF]"
        >
          {codes.map((code, index) => (
            <li
              key={code}
              className={revealed ? 'auth-code-shown' : 'auth-code-blur'}
              style={{ transitionDelay: `${index * 70}ms` }}
              aria-hidden={revealed ? undefined : true}
            >
              <span className="mr-2.5 text-[#6B7A99]">{index + 1}</span>
              {code}
            </li>
          ))}
        </ul>
        {!revealed && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-card hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
          >
            {setup.revealCodes}
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={download} className={buttonClass}>
          {t.backupDownload}
        </button>
        <button type="button" onClick={print} className={buttonClass}>
          {t.backupPrint}
        </button>
        <button type="button" onClick={() => void copy()} aria-live="polite" className={buttonClass}>
          {copied ? t.backupCopied : t.backupCopy}
        </button>
      </div>

      {onAcknowledgedChange && (
        <label className={`mt-4 flex items-start gap-2 text-sm text-slate-700 ${revealed ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
          <input
            type="checkbox"
            checked={acknowledged ?? false}
            disabled={!revealed}
            onChange={(event) => onAcknowledgedChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#1B5E3B]"
          />
          {t.backupSaved}
        </label>
      )}
    </div>
  );
}
