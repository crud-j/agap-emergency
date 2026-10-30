import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { LatLng, ReverseGeocodeResult } from '@agap/shared';
import type { GeocodeCandidate, GeocodeSearchQuery, GeocodingProvider } from '../interfaces';

/** Nominatim usage policy: a valid User-Agent on every request. */
const NOMINATIM_USER_AGENT = 'AGAP Emergency System (agap@bocaue.gov.ph)';
/** Nominatim usage policy: at most one request per second (plan §9.5). */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/**
 * Spaces requests to one provider. In-process only: several backend instances
 * would each keep their own spacing (a shared limiter is a recorded follow-up).
 */
export class RequestSpacer {
  private nextAt = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Waits for this caller's slot; callers are served in call order. */
  async wait(): Promise<void> {
    const now = this.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.intervalMs;
    if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
  }

  /** Counts a request that was sent without waiting, so the next wait() spaces after it. */
  note(): void {
    this.nextAt = Math.max(this.nextAt, this.now() + this.intervalMs);
  }
}

/** The fields read from one /search?format=jsonv2 row (lat/lon arrive as strings). */
interface NominatimSearchRow {
  lat?: string | number;
  lon?: string | number;
  osm_type?: string;
  osm_id?: number | string;
  name?: string;
  namedetails?: { name?: string } | null;
  display_name?: string;
  category?: string;
  class?: string;
  type?: string;
  importance?: number | string;
  address?: Record<string, string | undefined>;
}

/** One /search?format=jsonv2 row → a candidate; null when it has no usable point or OSM id. */
export function toGeocodeCandidate(row: NominatimSearchRow): GeocodeCandidate | null {
  const latitude = Number(row?.lat);
  const longitude = Number(row?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !row?.osm_type || row?.osm_id == null) {
    return null;
  }
  const addr = row.address ?? {};
  const displayName = String(row.display_name ?? '');
  const municipality = addr.town ?? addr.city ?? addr.municipality;
  const province = addr.province ?? addr.state;
  return {
    name: String(row.name || row.namedetails?.name || displayName.split(',')[0] || '').trim(),
    displayName,
    latitude,
    longitude,
    category: `${row.category ?? row.class ?? ''}=${row.type ?? ''}`,
    sourceRef: `osm:${row.osm_type}:${row.osm_id}`,
    importance: Number.isFinite(Number(row.importance)) ? Number(row.importance) : 0,
    address: {
      ...(municipality && { municipality: String(municipality) }),
      ...(province && { province: String(province) }),
    },
  };
}

/**
 * OpenStreetMap / Nominatim geocoder (MOD-12, MOD-39). Default for AGAP: keeps
 * sensitive emergency coordinates off commercial geocoders (Rule 10) and can be
 * pointed at a self-hosted Nominatim for a Bocaue/Bulacan OSM extract via
 * `MAP_GEOCODER_URL`. Reverse geocoding is best-effort — a failure returns
 * Bocaue/Bulacan defaults so it never blocks the incident flow, and it never waits
 * behind a search. Search waits for its slot and throws on failure.
 */
@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(NominatimGeocodingProvider.name);
  private readonly spacer = new RequestSpacer(NOMINATIM_MIN_INTERVAL_MS);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('MAP_GEOCODER_URL') ?? 'https://nominatim.openstreetmap.org';
  }

  async reverseGeocode({ lat, lng }: LatLng): Promise<ReverseGeocodeResult> {
    try {
      this.spacer.note();
      const response = await axios.get(`${this.baseUrl}/reverse`, {
        params: { lat, lon: lng, format: 'json', 'accept-language': 'en', zoom: 18 },
        headers: { 'User-Agent': NOMINATIM_USER_AGENT },
        timeout: 5000,
      });
      const addr = response.data?.address ?? {};
      const parts = [
        addr.village ?? addr.suburb ?? addr.neighbourhood ?? addr.hamlet,
        addr.town ?? addr.city ?? addr.municipality ?? 'Bocaue',
        addr.state ?? 'Bulacan',
      ].filter(Boolean);
      return {
        formattedAddress: parts.join(', ') || null,
        barangay: addr.village ?? addr.suburb ?? addr.neighbourhood ?? null,
        municipality: addr.town ?? addr.city ?? 'Bocaue',
        province: addr.state ?? 'Bulacan',
        raw: response.data,
      };
    } catch (err) {
      this.logger.warn(`Geocoding failed for ${lat},${lng}: ${String(err)}`);
      return { formattedAddress: null, barangay: null, municipality: 'Bocaue', province: 'Bulacan' };
    }
  }

  async search(query: GeocodeSearchQuery): Promise<GeocodeCandidate[]> {
    await this.spacer.wait();
    const response = await axios.get(`${this.baseUrl}/search`, {
      params: {
        q: query.text,
        format: 'jsonv2',
        addressdetails: 1,
        namedetails: 1,
        'accept-language': 'en',
        limit: query.limit ?? 5,
        ...(query.countryCodes && { countrycodes: query.countryCodes }),
        ...(query.viewbox && { viewbox: query.viewbox.join(',') }),
        ...(query.bounded && { bounded: 1 }),
      },
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      timeout: 5000,
    });
    if (!Array.isArray(response.data)) throw new Error('Unexpected Nominatim search response');
    return response.data.map(toGeocodeCandidate).filter((c): c is GeocodeCandidate => c !== null);
  }
}
