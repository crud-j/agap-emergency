import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { LatLng, ReverseGeocodeResult } from '@agap/shared';
import type { GeocodingProvider } from '../interfaces';

/**
 * OpenStreetMap / Nominatim reverse geocoder (MOD-12). Default for AGAP: keeps
 * sensitive emergency coordinates off commercial geocoders (Rule 10) and can be
 * pointed at a self-hosted Nominatim for a Bocaue/Bulacan OSM extract via
 * `MAP_GEOCODER_URL`. Best-effort — a failure returns Bocaue/Bulacan defaults
 * so reverse geocoding never blocks the incident flow.
 */
@Injectable()
export class NominatimGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(NominatimGeocodingProvider.name);

  constructor(private readonly config: ConfigService) {}

  async reverseGeocode({ lat, lng }: LatLng): Promise<ReverseGeocodeResult> {
    const base =
      this.config.get<string>('MAP_GEOCODER_URL') ?? 'https://nominatim.openstreetmap.org';
    try {
      const response = await axios.get(`${base}/reverse`, {
        params: { lat, lon: lng, format: 'json', 'accept-language': 'en', zoom: 18 },
        headers: { 'User-Agent': 'AGAP Emergency System (agap@bocaue.gov.ph)' },
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
}
