'use client';

import { useState, type FormEvent, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Siren } from 'lucide-react';

/** `3470-KXPM` once spaces and dashes are removed and letters upper-cased. */
const CODE_PATTERN = /^\d{4}[A-Z]{4}$/;

const normalize = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase();

/**
 * The page a barangay saves on its phone once. The alert SMS cannot carry a link (PH
 * carriers drop texts with web addresses), so it carries an access code instead; typing
 * it here opens the status page for that case. No login: the code is the credential.
 */
export default function BarangayCodeEntryPage(): ReactElement {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = normalize(code);
    if (!CODE_PATTERN.test(value)) {
      setError('The code is 4 numbers and 4 letters, like 3470-KXPM. Copy it from the AGAP text.');
      return;
    }
    router.push(`/b/${value.slice(0, 4)}-${value.slice(4)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-3 bg-agap-pearl px-4 py-4">
      <section className="rounded-2xl border border-[rgba(168,181,193,0.25)] bg-white p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-700">
          <Siren size={14} /> AGAP · Barangay emergency alert
        </div>
        <h1 className="mt-1 text-2xl font-extrabold text-agap-textMain">Enter the alert code</h1>
        <p className="mt-1 text-sm text-agap-textMid">
          It is in the AGAP text, after the word <strong>Code</strong>. You will see the exact location, a map,
          directions, and buttons to tell MDRRMO what is happening.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
          <label htmlFor="code" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
            <KeyRound size={14} /> Code
          </label>
          <input
            id="code"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null); }}
            placeholder="3470-KXPM"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            maxLength={12}
            aria-invalid={error !== null}
            aria-describedby={error ? 'code-error' : undefined}
            className="w-full rounded-xl border border-[rgba(168,181,193,0.5)] bg-white px-4 py-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.2em] text-agap-textMain outline-none focus:ring-2 focus:ring-agap-green"
          />
          {error && <p id="code-error" className="text-sm text-red-700" role="alert">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-agap-green px-4 py-4 text-base font-bold text-white"
          >
            Open the alert
          </button>
        </form>
      </section>

      <p className="text-center text-xs text-agap-textSub">
        Save this page on your phone (bookmark or &ldquo;Add to Home screen&rdquo;) so it is ready for the next alert.
      </p>
      <p className="pb-6 text-center text-[11px] text-agap-textSub">
        AGAP complements 911 and the MDRRMO hotline. It does not replace them.
      </p>
    </main>
  );
}
