import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { z } from 'zod';
import { normalizeName, type HospitalNameInput } from './candidate-scoring';

/** At most this many search queries per resolve (plan §9.2). */
export const MAX_SEARCH_QUERIES = 3;
/** "Find location" is interactive: a slow model falls back instead of holding the request. */
const AI_TIMEOUT_MS = 8000;

export interface NameNormalization {
  normalizedName: string;
  queries: string[];
  aiAssisted: boolean;
}

/** What the tie-break sees of a candidate: never its coordinates. */
export interface TieBreakOption {
  candidateId: string;
  name: string;
  displayName: string;
  category: string;
}

export interface TieBreakResult {
  candidateId: string | null;
  rationale: string | null;
  aiAssisted: boolean;
}

/** A decimal with 2+ fraction digits, or a lat/lng word: never accepted from the model. */
const COORDINATE_LIKE = /-?\d{1,3}\.\d{2,}|\b(lat|lng|lon|latitude|longitude)\b/i;

export function looksLikeCoordinate(text: string): boolean {
  return COORDINATE_LIKE.test(text);
}

// Unknown keys (e.g. "latitude") are stripped by zod; strings are checked below.
const NormalizeOutput = z.object({
  normalizedName: z.string().trim().min(2).max(255),
  queries: z.array(z.string().trim().min(2).max(255)).max(5),
});
const TieBreakOutput = z.object({
  candidateId: z.string().nullable(),
  rationale: z.string().optional(),
});

function dedupe(queries: string[]): string[] {
  const seen = new Set<string>();
  return queries.filter((q) => {
    const key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Without AI: the normalized name, first with the typed municipality. */
export function deterministicNormalization(input: HospitalNameInput): NameNormalization {
  const normalizedName = normalizeName(input.name);
  const municipality = input.municipality?.trim();
  const queries = dedupe([...(municipality ? [`${normalizedName}, ${municipality}`] : []), normalizedName]);
  return { normalizedName, queries: queries.slice(0, MAX_SEARCH_QUERIES), aiAssisted: false };
}

/**
 * Optional OpenAI help for "Find location" (MOD-39, plan §9.2): tidy a typed
 * hospital name into search queries, and pick between near-tied candidates. It
 * never produces coordinates: outputs are zod-validated and anything that looks
 * like a coordinate is dropped. Only the staff-typed name, address, municipality
 * and province are sent (public facility data; never incident or patient data).
 *
 * Disabled when OPENAI_API_KEY is unset; every failure falls back to the
 * deterministic path with aiAssisted false.
 */
@Injectable()
export class HospitalNameAssistService {
  private readonly logger = new Logger(HospitalNameAssistService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    this.model =
      this.config.get<string>('OPENAI_GEOCODE_ASSIST_MODEL') ||
      this.config.get<string>('OPENAI_EVIDENCE_REVIEW_MODEL', 'gpt-4o-mini');
    this.client = apiKey ? new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async normalize(input: HospitalNameInput): Promise<NameNormalization> {
    const fallback = deterministicNormalization(input);
    if (!this.client) return fallback;
    const parsed = NormalizeOutput.safeParse(
      await this.ask(
        `You prepare OpenStreetMap Nominatim search queries for a hospital in the Philippines.
Clean the name: drop "Inc.", "Corp.", "DOH —" and stray punctuation; expand abbreviations (Gen. = General, Hosp. = Hospital, Med. = Medical).
Give up to 3 short search queries, most specific first. Never include coordinates or numbers you were not given.

Name: ${JSON.stringify(input.name)}
Address: ${JSON.stringify(input.address ?? null)}
Municipality: ${JSON.stringify(input.municipality ?? null)}
Province: ${JSON.stringify(input.province ?? null)}

Respond with ONLY a JSON object: {"normalizedName": "<name>", "queries": ["<query>", ...]}`,
      ),
    );
    if (!parsed.success || looksLikeCoordinate(parsed.data.normalizedName)) return fallback;
    const aiQueries = parsed.data.queries.filter((q) => !looksLikeCoordinate(q));
    return {
      normalizedName: parsed.data.normalizedName,
      // The deterministic query always stays in, so a poor AI rewrite cannot hide the hospital.
      queries: dedupe([...aiQueries.slice(0, MAX_SEARCH_QUERIES - 1), ...fallback.queries]).slice(0, MAX_SEARCH_QUERIES),
      aiAssisted: true,
    };
  }

  /** Picks one of the given candidate ids, or none. It cannot add, edit or score candidates. */
  async tieBreak(input: HospitalNameInput, options: TieBreakOption[]): Promise<TieBreakResult> {
    const none: TieBreakResult = { candidateId: null, rationale: null, aiAssisted: false };
    if (!this.client || options.length < 2) return none;
    const parsed = TieBreakOutput.safeParse(
      await this.ask(
        `Staff are registering a hospital in the Philippines. Pick which search result is that hospital, or null if none clearly is.

Typed name: ${JSON.stringify(input.name)}
Typed address: ${JSON.stringify(input.address ?? null)}
Typed municipality: ${JSON.stringify(input.municipality ?? null)}
Typed province: ${JSON.stringify(input.province ?? null)}

Results:
${JSON.stringify(options)}

Respond with ONLY a JSON object: {"candidateId": "<one candidateId from the results>" | null, "rationale": "<one short sentence>"}`,
      ),
    );
    if (!parsed.success) return none;
    const { candidateId, rationale } = parsed.data;
    if (!candidateId || !options.some((o) => o.candidateId === candidateId)) return none;
    const text = rationale?.trim().slice(0, 300) ?? '';
    return { candidateId, rationale: text && !looksLikeCoordinate(text) ? text : null, aiAssisted: true };
  }

  /** The model's JSON object, or null on any failure. */
  private async ask(prompt: string): Promise<unknown> {
    try {
      const response = await this.client!.responses.create({ model: this.model, input: prompt });
      const match = (response.output_text ?? '').match(/\{[\s\S]*\}/);
      return match ? (JSON.parse(match[0]) as unknown) : null;
    } catch (err) {
      // Advisory only: "Find location" continues with the deterministic path.
      this.logger.warn(`Hospital name assist failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
