import type { BarangayLinkStatus } from './dto/barangay-callback.dto';

/** A barangay SMS reply that names one status and one case code. */
export interface ParsedBarangayReply {
  status: BarangayLinkStatus;
  /** The notice's 4-digit short code. */
  code: string;
  /** The 4 letters of the full access code (`3526-ANWQ`), when the reply carries them. */
  letters: string | null;
}

/**
 * Reply words → the status they record. The same statuses as the `/b` page buttons, with
 * the Filipino words barangay staff actually type.
 */
const KEYWORDS: Record<string, BarangayLinkStatus> = {
  SEEN: 'SEEN',
  NAKITA: 'SEEN',
  OTW: 'ON_THE_WAY',
  OMW: 'ON_THE_WAY',
  PAPUNTA: 'ON_THE_WAY',
  ONSCENE: 'ON_SCENE',
  NANDITO: 'ON_SCENE',
  DONE: 'HANDLED',
  TAPOS: 'HANDLED',
  NEED: 'NEEDS_BACKUP',
  TULONG: 'NEEDS_BACKUP',
  BACKUP: 'NEEDS_BACKUP',
};

/** `3526`, `3526-ANWQ` or `3526ANWQ`. The letters never include I, L or O. */
const CODE = /^(\d{4})(?:-?([A-HJKMNP-Z]{4}))?$/;

/**
 * Reads a barangay reply such as `DONE 3526`, `3526 tapos na`, `otw 3526-ANWQ`.
 * Case, punctuation, extra words and word order do not matter. Returns null unless the
 * reply names exactly one status and exactly one code: a forwarded alert (its reply hint
 * names OTW, DONE and NEED) or `DONE 3526 4821` is ambiguous, and an ambiguous reply must
 * never be applied. The case reference `INC-2026-…` is one token, so `2026` is not a code.
 */
export function parseBarangayReply(body: string | null | undefined): ParsedBarangayReply | null {
  const tokens = (body ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, ' ')
    .split(' ')
    .filter(Boolean);

  const statuses = new Set<BarangayLinkStatus>();
  const codes = new Map<string, string | null>();
  tokens.forEach((token, i) => {
    // "ON SCENE" is two words.
    const word = token === 'ON' && tokens[i + 1] === 'SCENE' ? 'ONSCENE' : token;
    const status = KEYWORDS[word];
    if (status) statuses.add(status);

    const code = CODE.exec(token);
    if (code) {
      const letters = code[2] ?? null;
      // `3526 ... 3526-ANWQ` is one code; keep the letters if any copy has them.
      codes.set(code[1]!, codes.get(code[1]!) ?? letters);
    }
  });

  if (statuses.size !== 1 || codes.size !== 1) return null;
  const [code, letters] = [...codes][0]!;
  return { status: [...statuses][0]!, code, letters };
}
