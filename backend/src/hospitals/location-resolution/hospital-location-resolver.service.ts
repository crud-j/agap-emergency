import { Injectable, Logger } from '@nestjs/common';
import { FACILITY_SERVICE_AREA_BOUNDS, isCoordinateInServiceArea } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MapsService } from '../../locations/maps/maps.service';
import type { GeocodeCandidate } from '../../locations/maps/interfaces';
import {
  byScore,
  decide,
  scoreHospitalCandidate,
  type HospitalNameInput,
  type ResolveResult,
  type ScoredCandidate,
} from './candidate-scoring';
import { HospitalNameAssistService } from './hospital-name-assist.service';

/** The AI tie-break only looks at candidates this close to the top score. */
export const TIE_MARGIN = 0.05;
/** Candidates returned to the UI (all of them are scored and decided on). */
export const MAX_CANDIDATES = 5;

/** One candidate as the UI sees it (plan §11). Coordinates are the provider's only. */
export interface ResolvedCandidate {
  candidateId: string;
  name: string;
  address: string;
  municipality: string | null;
  province: string | null;
  latitude: number;
  longitude: number;
  source: 'nominatim';
  sourceRef: string;
  category: string;
  score: number;
  reasons: string[];
  /** Id of the facility already registered with this sourceRef, else null. */
  alreadyRegistered: string | null;
}

export interface ResolveLocationResponse {
  normalizedName: string;
  aiAssisted: boolean;
  result: ResolveResult;
  candidates: ResolvedCandidate[];
  /** The top candidate when AUTO_SELECTABLE; null otherwise (the user picks). */
  selectedCandidateId: string | null;
}

/**
 * "Find location" for the hospital registry (MOD-39, plan §9): normalize the typed
 * name → search each query → keep candidates inside the service area → score →
 * decide. The AI (optional) only reorders near-ties; it never changes a score or
 * a coordinate, and it never turns NEEDS_CONFIRMATION into AUTO_SELECTABLE.
 * A provider failure is a 200 PROVIDER_UNAVAILABLE, so the UI offers a manual pin.
 */
@Injectable()
export class HospitalLocationResolverService {
  private readonly logger = new Logger(HospitalLocationResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly nameAssist: HospitalNameAssistService,
  ) {}

  async resolve(input: HospitalNameInput): Promise<ResolveLocationResponse> {
    const normalization = await this.nameAssist.normalize(input);
    const found = await this.searchAll(normalization.queries);
    if (!found) {
      return {
        normalizedName: normalization.normalizedName,
        aiAssisted: normalization.aiAssisted,
        result: 'PROVIDER_UNAVAILABLE',
        candidates: [],
        selectedCandidateId: null,
      };
    }

    // Scored against the typed name, so an AI rewrite cannot raise a score.
    const ranked = found
      .filter((c) => isCoordinateInServiceArea(c.latitude, c.longitude))
      .map((c) => scoreHospitalCandidate(input, c, true))
      .sort(byScore)
      .map((scored, i) => ({ id: `c${i + 1}`, scored }));
    const result = decide(ranked.map((r) => r.scored));

    let aiAssisted = normalization.aiAssisted;
    if (result === 'NEEDS_CONFIRMATION') {
      const top = ranked[0]!.scored.score;
      const tied = ranked.filter((r) => top - r.scored.score <= TIE_MARGIN + 1e-9);
      const pick = await this.nameAssist.tieBreak(
        input,
        tied.map((r) => ({
          candidateId: r.id,
          name: r.scored.candidate.name,
          displayName: r.scored.candidate.displayName,
          category: r.scored.candidate.category,
        })),
      );
      const picked = pick.candidateId ? ranked.findIndex((r) => r.id === pick.candidateId) : -1;
      if (picked > -1) {
        const [entry] = ranked.splice(picked, 1);
        entry!.scored.reasons.push(pick.rationale ? `AI suggested: ${pick.rationale}` : 'AI suggested');
        ranked.unshift(entry!);
        aiAssisted = true;
      }
    }

    const shown = ranked.slice(0, MAX_CANDIDATES);
    const registered = await this.registeredFacilities(shown.map((r) => r.scored.candidate.sourceRef));
    return {
      normalizedName: normalization.normalizedName,
      aiAssisted,
      result,
      candidates: shown.map((r) => toResolvedCandidate(r.id, r.scored, registered.get(r.scored.candidate.sourceRef) ?? null)),
      selectedCandidateId: result === 'AUTO_SELECTABLE' ? ranked[0]!.id : null,
    };
  }

  /** Every query's results merged by sourceRef (first wins); null when no query got an answer. */
  private async searchAll(queries: string[]): Promise<GeocodeCandidate[] | null> {
    const bySourceRef = new Map<string, GeocodeCandidate>();
    let answered = false;
    for (const text of queries) {
      try {
        const results = await this.maps.search({
          text,
          countryCodes: 'ph',
          viewbox: FACILITY_SERVICE_AREA_BOUNDS,
          bounded: true,
          limit: 5,
        });
        answered = true;
        for (const c of results) if (!bySourceRef.has(c.sourceRef)) bySourceRef.set(c.sourceRef, c);
      } catch (err) {
        this.logger.warn(`Hospital location search failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return answered ? [...bySourceRef.values()] : null;
  }

  /** sourceRef → id of a facility already registered with it (any status, active or not). */
  private async registeredFacilities(sourceRefs: string[]): Promise<Map<string, string>> {
    if (sourceRefs.length === 0) return new Map();
    const rows = await this.prisma.facility.findMany({
      where: { location_source_ref: { in: sourceRefs } },
      select: { id: true, location_source_ref: true },
    });
    return new Map(rows.map((r) => [r.location_source_ref!, r.id]));
  }
}

function toResolvedCandidate(id: string, scored: ScoredCandidate, alreadyRegistered: string | null): ResolvedCandidate {
  const c = scored.candidate;
  return {
    candidateId: id,
    name: c.name,
    address: c.displayName,
    municipality: c.address.municipality ?? null,
    province: c.address.province ?? null,
    latitude: c.latitude,
    longitude: c.longitude,
    source: 'nominatim',
    sourceRef: c.sourceRef,
    category: c.category,
    score: Math.round(scored.score * 100) / 100,
    reasons: scored.reasons,
    alreadyRegistered,
  };
}
