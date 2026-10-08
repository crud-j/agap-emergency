import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { LatLng, RouteResult } from '@agap/shared';
import type { RoutingProvider } from '../interfaces';

/**
 * OSRM driving router (MOD-43). Default for AGAP; point `MAP_PROVIDER_ROUTING_URL`
 * at a self-hosted OSRM/Valhalla on a Philippines OSM extract for cost control
 * and surge availability. Best-effort — a failure returns nulls so a failed ETA
 * calculation never stops dispatch (Reliability Rule).
 */
@Injectable()
export class OsrmRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger(OsrmRoutingProvider.name);

  constructor(private readonly config: ConfigService) {}

  async route(from: LatLng, to: LatLng): Promise<RouteResult> {
    try {
      const base =
        this.config.get<string>('MAP_PROVIDER_ROUTING_URL') ?? 'http://router.project-osrm.org';
      // overview=full + geometries=geojson returns the full polyline to draw in-app.
      const url =
        `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=full&geometries=geojson`;
      const response = await axios.get(url, { timeout: 5000 });
      const route = response.data?.routes?.[0];
      const coordinates = route?.geometry?.coordinates;
      return {
        distanceMeters: typeof route?.distance === 'number' ? Math.round(route.distance) : null,
        durationSeconds: typeof route?.duration === 'number' ? Math.round(route.duration) : null,
        isEstimate: true,
        ...(Array.isArray(coordinates) ? { geometry: coordinates as Array<[number, number]> } : {}),
      };
    } catch (err) {
      this.logger.warn(`Routing failed for ${from.lat},${from.lng} -> ${to.lat},${to.lng}: ${String(err)}`);
      return { distanceMeters: null, durationSeconds: null, isEstimate: true };
    }
  }
}
