import { Injectable, Logger } from '@nestjs/common';
import { BOCAUE_BOUNDARY_BOUNDS } from '@agap/shared';
import { MapsService } from '../locations/maps/maps.service';
import { tidyPlaceResults, type PlaceSearchResponse } from './place-search';

/** Asked of the geocoder: more than shown, because some fall outside the Bocaue polygon. */
const PROVIDER_LIMIT = 10;

/**
 * "Find a place" for the risk-area pin form (MOD-51). Uses the shared map search
 * (Nominatim: one request a second, results cached 24 h), limited to the Bocaue box,
 * then keeps only places inside the municipality. Coordinates come from the map
 * provider only. A provider failure is reported, never thrown: the Supervisor can
 * still pick a barangay, paste coordinates or click the map.
 */
@Injectable()
export class RiskPlaceSearchService {
  private readonly logger = new Logger(RiskPlaceSearchService.name);

  constructor(private readonly maps: MapsService) {}

  async search(text: string): Promise<PlaceSearchResponse> {
    const { west, south, east, north } = BOCAUE_BOUNDARY_BOUNDS;
    try {
      const candidates = await this.maps.search({
        text,
        countryCodes: 'ph',
        viewbox: [west, south, east, north],
        bounded: true,
        limit: PROVIDER_LIMIT,
      });
      return { results: tidyPlaceResults(candidates), unavailable: false };
    } catch (err) {
      this.logger.warn(`Risk-area place search failed: ${err instanceof Error ? err.message : String(err)}`);
      return { results: [], unavailable: true };
    }
  }
}
