import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { LatLng, RouteResult } from '@agap/shared';
import type { RoutingProvider } from '../interfaces';

/**
 * Mapbox Directions router using the `driving-traffic` profile (MOD-43).
 *
 * Unlike OSRM's free-flow estimate, this accounts for current/typical congestion
 * on Bocaue corridors (MacArthur Highway, NLEX Interchange, Gov. F. Halili Ave),
 * giving dispatchers and citizens a more realistic ETA. Requires MAP_API_KEY.
 *
 * Best-effort — a missing token or request failure returns nulls so a failed ETA
 * calculation never stops dispatch (Reliability Rule). ETA is always an estimate
 * (Architectural Rule 13).
 */
@Injectable()
export class MapboxRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(MapboxRoutingProvider.name);

  constructor(private readonly config: ConfigService) {}

  async route(from: LatLng, to: LatLng): Promise<RouteResult> {
    const empty: RouteResult = { distanceMeters: null, durationSeconds: null, isEstimate: true };
    try {
      const token = this.config.get<string>('MAP_API_KEY') ?? '';
      if (!token) {
        this.logger.warn('MAP_API_KEY not set — cannot compute a Mapbox route');
        return empty;
      }
      const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}`;
      // Token passed via params (not the path) so it never lands in our logs.
      // geometries=geojson + overview=full returns the full polyline to draw in-app.
      const response = await axios.get(url, {
        params: { access_token: token, overview: 'full', geometries: 'geojson' },
        timeout: 5000,
      });
      const route = response.data?.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      return {
        distanceMeters: typeof route?.distance === 'number' ? Math.round(route.distance) : null,
        durationSeconds: typeof route?.duration === 'number' ? Math.round(route.duration) : null,
        isEstimate: true,
        ...(Array.isArray(coordinates) ? { geometry: coordinates as Array<[number, number]> } : {}),
      };
    } catch (err) {
      this.logger.warn(
        `Mapbox routing failed for ${from.lat},${from.lng} -> ${to.lat},${to.lng}: ${String(err)}`,
      );
      return empty;
    }
  }
}
