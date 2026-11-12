'use client';

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, {
  Marker, Popup, Source, Layer, useMap,
  type MarkerEvent, type ViewStateChangeEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Maximize2, Minimize2 } from 'lucide-react';
import { FACILITY_SERVICE_AREA_BOUNDS, isSignalLost, toLngLat, type TransportLeg } from '@agap/shared';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MIN_ZOOM, BOCAUE_MAX_ZOOM,
  BOCAUE_BOUNDARY_SOURCE,
  BOCAUE_OUTSIDE_MASK,
  isWithinBocaue,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';
import { AmbulanceMarker } from '@/components/map/AmbulanceMarker';
import { CitizenMarker, REPORTER_PHOTO_NOTE, reporterLabel } from '@/components/map/CitizenMarker';
import { useReporterPhotoUrl } from '@/features/map/reporter-photo';
import { HospitalMarker } from '@/components/map/HospitalMarker';
import { LEG_COLORS, LegChip } from '@/components/map/LegChip';
import { titleCase, priorityLabel } from '@/lib/incident-format';
import { useNow } from '@/lib/use-now';
import { formatAge, isUnitOnMap, type LegChip as LegChipData } from '@/features/map/live-tracking';
import type { LiveResponderPosition } from '@/features/map/api';

/**
 * Flood-prone barangays (CLAUDE.md Bocaue Operational Context). Centers are
 * [lng, lat] — MapLibre order. Radii are advisory only, not authoritative boundaries.
 */
const FLOOD_PRONE: Array<{ name: string; center: [number, number]; radiusM: number }> = [
  { name: 'Lolomboy', center: [120.9436, 14.7236], radiusM: 900 },
  { name: 'Bunlo',    center: [120.9253, 14.7319], radiusM: 800 },
  { name: 'Igulot',   center: [120.9500, 14.7097], radiusM: 850 },
  { name: 'Bambang',  center: [120.9103, 14.7847], radiusM: 900 },
];

/** Min zoom while the bounds are widened to the service area (a hospital outside Bocaue). */
const SERVICE_AREA_MIN_ZOOM = 9;

/** Call-sign labels appear under unit markers from this zoom up. */
const LABEL_MIN_ZOOM = 14;
/** Minimum gap between follow-camera eases, so a burst of fixes doesn't stutter. */
const FOLLOW_EASE_MS = 750;

export interface MapIncident {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  lat: number | null;
  lng: number | null;
  /** The reporter agreed to show their profile photo and the incident is active; else the neutral pin. */
  reporter_has_photo?: boolean | null;
  reporter_is_guest?: boolean | null;
}

/** A hospital drawn on the map (MOD-39): a transport destination or the optional VERIFIED layer. */
export interface MapFacility {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  verified: boolean;
  /** A unit is heading to (or is at) this hospital: emphasised and labelled. */
  destination?: boolean;
}

/** One unit's route, styled by leg (ops map: every tracked unit). [lng, lat] pairs. */
export interface MapRoute {
  id: string;
  geometry: Array<[number, number]>;
  leg: TransportLeg;
  /** Stale or older than 120 s: drawn faded. */
  lastKnown?: boolean;
}

/** Camera tracking of the selected incident's accepted unit (dispatch dashboard). */
export interface UnitTrackingView {
  /** Dispatch whose marker is highlighted and followed. */
  dispatchId: string | null;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** Increment to frame the scene and the unit together. */
  fitRequest: number;
}

// Returns [lng, lat] — MapLibre / GeoJSON order.
function coordsOf(i: MapIncident): [number, number] | null {
  if (i.lat == null || i.lng == null) return null;
  const lat = Number(i.lat);
  const lng = Number(i.lng);
  if (!isWithinBocaue(lng, lat) || (lat === 0 && lng === 0)) return null;
  return [lng, lat];
}

/** Generates a GeoJSON polygon approximating a circle. Returns ring coordinates in [lng, lat] order. */
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLng = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    const dLat = (radiusM / 111320) * Math.sin(angle);
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}

/** Flies to the selected incident whenever the selection changes. */
function MapFlyController({ incidents, selectedId }: { incidents: MapIncident[]; selectedId: string | null }): null {
  const { current: map } = useMap();
  useEffect(() => {
    if (!selectedId || !map) return;
    const inc = incidents.find((i) => i.id === selectedId);
    const c = inc ? coordsOf(inc) : null;
    if (c) map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 15), duration: 600 });
  }, [selectedId, incidents, map]);
  return null;
}

/**
 * Follow-unit and fit-scene camera (mirrors mobile follow mode): while following,
 * eases to the unit on each new position; a fit request frames scene + unit.
 */
function UnitCameraController({
  unit, scene, destinations, follow, fitRequest,
}: {
  unit: [number, number] | null;
  scene: [number, number] | null;
  /** Hospitals a unit is heading to: framed with the unit and scene. */
  destinations: Array<[number, number]>;
  follow: boolean;
  fitRequest: number;
}): null {
  const { current: map } = useMap();
  const lastEase = useRef(0);

  useEffect(() => {
    if (!map || !follow || !unit) return;
    const now = Date.now();
    if (now - lastEase.current < FOLLOW_EASE_MS) return;
    lastEase.current = now;
    map.easeTo({ center: unit, zoom: Math.max(map.getZoom(), 15), duration: 500 });
  }, [map, follow, unit?.[0], unit?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map || fitRequest === 0) return;
    const pts = [unit, scene, ...destinations].filter((p): p is [number, number] => p != null);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.easeTo({ center: pts[0]!, zoom: Math.max(map.getZoom(), 15), duration: 600 });
      return;
    }
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      // Left padding keeps both points clear of the dispatch side panel.
      { padding: { top: 80, bottom: 90, left: 420, right: 80 }, maxZoom: 16, duration: 700 },
    );
  }, [map, fitRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

interface IncidentMapViewProps {
  incidents: MapIncident[];
  responders: LiveResponderPosition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Dispatch dashboard only: track the selected incident's accepted unit. */
  tracking?: UnitTrackingView;
  /** Routed line of the tracked unit's current leg, [lng, lat] pairs. */
  routeGeometry?: Array<[number, number]> | null;
  /** Leg of `routeGeometry`: TO_FACILITY is purple and dashed. Default TO_SCENE. */
  routeStyle?: 'TO_SCENE' | 'TO_FACILITY';
  /** `routeGeometry` is stale or older than 120 s: drawn faded. */
  routeLastKnown?: boolean;
  /** More routes, each with its own leg (ops map). */
  routes?: MapRoute[];
  /** Destination hospitals (always shown) and, optionally, every VERIFIED hospital. */
  facilities?: MapFacility[];
  /** Leg chip per dispatch id, for the unit popup and marker tooltips. */
  unitLegs?: Record<string, LegChipData>;
}

/**
 * Real-time incident map (MOD-22). Scene markers show the reporter (icon in a
 * priority ring when shared, neutral pin otherwise); unit markers use the
 * ambulance icon, face their direction of travel and grey out after 60 s
 * without an update. Positions patch live from `responder.location_updated`
 * (SocketProvider). Clicking an incident selects it. Flood-prone barangay
 * advisory circles are rendered as MapLibre GL fill + line layers.
 */
export function IncidentMapView({
  incidents, responders, selectedId, onSelect, tracking, routeGeometry, routeStyle = 'TO_SCENE',
  routeLastKnown = false, routes, facilities, unitLegs,
}: IncidentMapViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleUrl = useMapStyle();
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [zoom, setZoom] = useState(BOCAUE_DEFAULT_ZOOM);
  const [fullscreenFallback, setFullscreenFallback] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Staleness re-renders on a steady 5 s ticker, not on every socket event.
  const now = useNow(5_000);

  const selectedInc = selectedId ? incidents.find((i) => i.id === selectedId) : null;
  const selectedCoords = selectedInc ? coordsOf(selectedInc) : null;

  const visibleResponders = useMemo(
    () => responders.filter((r) => r.lat != null && r.lng != null && isUnitOnMap(r.lng, r.lat)),
    [responders],
  );
  const trackedUnit = tracking?.dispatchId
    ? visibleResponders.find((r) => r.dispatchId === tracking.dispatchId) ?? null
    : null;
  const trackedPoint: [number, number] | null = trackedUnit ? [trackedUnit.lng, trackedUnit.lat] : null;
  const selectedUnit = selectedInc
    ? trackedUnit ?? visibleResponders.find((r) => r.incident_id === selectedInc.id) ?? null
    : null;

  const floodCirclesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: FLOOD_PRONE.map((b) => ({
      type: 'Feature' as const,
      properties: { name: b.name },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [circlePolygon(b.center[0], b.center[1], b.radiusM)],
      },
    })),
  }), []);

  const allRoutes = useMemo<MapRoute[]>(
    () => [
      ...(routeGeometry && routeGeometry.length > 1
        ? [{ id: 'tracked', geometry: routeGeometry, leg: routeStyle, lastKnown: routeLastKnown }]
        : []),
      ...(routes ?? []).filter((r) => r.geometry.length > 1),
    ],
    [routeGeometry, routeStyle, routeLastKnown, routes],
  );
  const routeGeoJSON = useMemo(
    () =>
      allRoutes.length > 0
        ? {
            type: 'FeatureCollection' as const,
            features: allRoutes.map((r) => ({
              type: 'Feature' as const,
              properties: { id: r.id, leg: r.leg, lastKnown: !!r.lastKnown },
              geometry: { type: 'LineString' as const, coordinates: r.geometry },
            })),
          }
        : null,
    [allRoutes],
  );

  // Hospital points built at runtime from the API (no static GeoJSON); [lng, lat] via toLngLat.
  // A destination wins over the same hospital in the optional VERIFIED layer.
  const hospitalPoints = useMemo(() => {
    const byId = new globalThis.Map<string, MapFacility & { point: [number, number] }>();
    for (const f of facilities ?? []) {
      if (!byId.has(f.id) || f.destination) byId.set(f.id, { ...f, point: toLngLat(f) });
    }
    return [...byId.values()];
  }, [facilities]);
  const destinationPoints = useMemo(
    () => hospitalPoints.filter((h) => h.destination).map((h) => h.point),
    [hospitalPoints],
  );

  // A transport to a hospital outside Bocaue widens the bounds to the service area
  // while it lasts; the Bocaue boundary, mask and incident markers are unchanged.
  const wideArea =
    destinationPoints.some(([lng, lat]) => !isWithinBocaue(lng, lat)) ||
    allRoutes.some((r) => r.geometry.some(([lng, lat]) => !isWithinBocaue(lng, lat))) ||
    visibleResponders.some((r) => !isWithinBocaue(r.lng, r.lat));

  useEffect(() => {
    function syncFullscreen() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
      setFullscreenFallback(false);
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement === container || fullscreenFallback) {
      if (document.fullscreenElement === container) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.error('Failed to exit fullscreen map', error);
          return;
        }
      }
      setFullscreenFallback(false);
      setIsFullscreen(false);
      return;
    }

    if (container.requestFullscreen) {
      try {
        await container.requestFullscreen();
        setIsFullscreen(true);
        return;
      } catch {
        setFullscreenFallback(true);
        setIsFullscreen(true);
        return;
      }
    }
    setFullscreenFallback(true);
    setIsFullscreen(true);
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full${fullscreenFallback ? ' fixed inset-0 z-[2000]' : ''}`}
      style={{ background: '#F2F5F8' }}
    >
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? 'Exit fullscreen map' : 'View fullscreen map'}
        title={isFullscreen ? 'Exit fullscreen' : 'View fullscreen'}
        className="absolute right-3 top-3 z-[1000] flex h-10 w-10 items-center justify-center rounded-lg border border-agap-track/50 bg-white/95 text-agap-textMain shadow-card backdrop-blur transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
      >
        {isFullscreen
          ? <Minimize2 size={18} aria-hidden />
          : <Maximize2 size={18} aria-hidden />}
      </button>
      <Map
        key={mapKey}
        mapStyle={styleUrl}
        styleDiffing={false}
        initialViewState={{
          longitude: BOCAUE_CENTER[0],
          latitude: BOCAUE_CENTER[1],
          zoom: BOCAUE_DEFAULT_ZOOM,
        }}
        maxBounds={wideArea ? FACILITY_SERVICE_AREA_BOUNDS : BOCAUE_BOUNDS}
        minZoom={wideArea ? SERVICE_AREA_MIN_ZOOM : BOCAUE_MIN_ZOOM}
        maxZoom={BOCAUE_MAX_ZOOM}
        style={{ height: '100%', width: '100%' }}
        onError={() => setTileError(true)}
        onZoomEnd={(e: ViewStateChangeEvent) => setZoom(e.viewState.zoom)}
        // Only a user drag releases follow mode; programmatic eases don't fire this.
        onDragStart={() => {
          if (tracking?.follow) tracking.onFollowChange(false);
        }}
        ref={resolveMissingStyleImages}
        onLoad={() => setTileError(false)}
      >
        <MapFlyController incidents={incidents} selectedId={selectedId} />
        {tracking && (
          <UnitCameraController
            unit={trackedPoint}
            scene={selectedCoords}
            destinations={destinationPoints}
            follow={tracking.follow}
            fitRequest={tracking.fitRequest}
          />
        )}

        <Source id="bocaue-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer
            id="bocaue-outside-opacity"
            type="fill"
            paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.62 }}
          />
        </Source>

        {/* Municipal Bocaue boundary; replace the asset only if a higher-authority file is provided. */}
        <Source id="bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer
            id="bocaue-outline"
            type="line"
            paint={{ 'line-color': '#0080ff', 'line-width': 3 }}
          />
        </Source>

        {/* Flood-prone barangay advisory circles */}
        <Source id="flood-circles" type="geojson" data={floodCirclesGeoJSON}>
          <Layer
            id="flood-fill"
            type="fill"
            paint={{ 'fill-color': '#3B82F6', 'fill-opacity': 0.08 }}
          />
          <Layer
            id="flood-outline"
            type="line"
            paint={{ 'line-color': '#3B82F6', 'line-width': 1, 'line-opacity': 0.6 }}
          />
          <Layer
            id="flood-labels"
            type="symbol"
            minzoom={13}
            layout={{ 'text-field': ['get', 'name'], 'text-size': 11 } as object}
            paint={{ 'text-color': '#1D4ED8', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } as object}
          />
        </Source>

        {/* Routed lines (MOD-43): scene leg solid green, hospital leg dashed purple.
            GL layers, so they sit under the DOM markers. */}
        {routeGeoJSON && (
          <Source id="unit-route" type="geojson" data={routeGeoJSON}>
            <Layer
              id="unit-route-line"
              type="line"
              filter={['!=', ['get', 'leg'], 'TO_FACILITY']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': LEG_COLORS.TO_SCENE,
                'line-width': 5,
                'line-opacity': ['case', ['get', 'lastKnown'], 0.4, 0.85],
              }}
            />
            <Layer
              id="unit-route-hospital-line"
              type="line"
              filter={['==', ['get', 'leg'], 'TO_FACILITY']}
              layout={{ 'line-join': 'round' }}
              paint={{
                'line-color': LEG_COLORS.TO_FACILITY,
                'line-width': 5,
                'line-dasharray': [2, 1.5],
                'line-opacity': ['case', ['get', 'lastKnown'], 0.4, 0.9],
              }}
            />
          </Source>
        )}

        {/* Hospitals: transport destinations (labelled) and the optional VERIFIED layer */}
        {hospitalPoints.map((h) => (
          <Marker
            key={h.id}
            longitude={h.point[0]}
            latitude={h.point[1]}
            anchor="center"
            style={{ zIndex: h.destination ? 1 : 0 }}
          >
            <HospitalMarker
              verified={h.verified}
              selected={!!h.destination}
              label={h.destination || zoom >= LABEL_MIN_ZOOM ? h.name : null}
              title={`${h.name} · ${h.verified ? 'Verified location' : 'Location not verified'}`}
            />
          </Marker>
        ))}

        {/* Incident scene markers (the reporter, never the patient) */}
        {incidents.map((inc) => {
          const c = coordsOf(inc);
          if (!c) return null;
          return (
            <Marker
              key={inc.id}
              longitude={c[0]}
              latitude={c[1]}
              anchor="center"
              onClick={(e: MarkerEvent<MouseEvent>) => {
                e.originalEvent.stopPropagation();
                onSelect(inc.id);
              }}
            >
              <div title={`${inc.public_reference} · ${reporterLabel(inc.reporter_has_photo, inc.reporter_is_guest)}`}>
                <ReporterSceneMarker incident={inc} selected={inc.id === selectedId} />
              </div>
            </Marker>
          );
        })}

        {/* Live unit markers — one per dispatch */}
        {visibleResponders.map((r) => {
          const lost = isSignalLost(r.updated_at, now);
          const unitName = r.call_sign ?? r.resource_name ?? 'Responder';
          const leg = r.dispatchId ? unitLegs?.[r.dispatchId] : undefined;
          return (
            <Marker
              key={r.dispatchId ?? r.responderId}
              longitude={r.lng}
              latitude={r.lat}
              anchor="center"
              style={{ zIndex: r.dispatchId && r.dispatchId === tracking?.dispatchId ? 2 : 1 }}
            >
              <AmbulanceMarker
                heading={r.heading}
                signalLost={lost}
                tracked={!!r.dispatchId && r.dispatchId === tracking?.dispatchId}
                callSign={r.call_sign ?? r.resource_name}
                resourceType={r.resource_type ?? null}
                showLabel={zoom >= LABEL_MIN_ZOOM}
                title={`${unitName}${leg ? ` · ${leg.label}` : ''} · ${lost ? 'signal lost — ' : ''}last update ${formatAge(r.updated_at, now)}`}
              />
            </Marker>
          );
        })}

        {selectedCoords && selectedInc && (
          <Popup
            longitude={selectedCoords[0]}
            latitude={selectedCoords[1]}
            onClose={() => {}}
            closeButton={false}
            offset={18}
          >
            <div className="text-xs">
              <div className="font-bold text-[#1C2B3A]">{titleCase(selectedInc.category)}</div>
              <div className="font-mono text-[10px] text-[#8795A3]">{selectedInc.public_reference}</div>
              <div className="text-[#40536D]">{priorityLabel(selectedInc.priority)} · {titleCase(selectedInc.status)}</div>
              <ReporterPopupPhoto incident={selectedInc} />
              {selectedUnit && (
                <div
                  className={`mt-0.5 text-[10px] ${
                    isSignalLost(selectedUnit.updated_at, now) ? 'font-semibold text-red-600' : 'text-[#8795A3]'
                  }`}
                >
                  {selectedUnit.call_sign ?? 'Unit'} · last update {formatAge(selectedUnit.updated_at, now)}
                </div>
              )}
              {selectedUnit?.dispatchId && unitLegs?.[selectedUnit.dispatchId] && (
                <div className="mt-1">
                  <LegChip chip={unitLegs[selectedUnit.dispatchId]!} />
                </div>
              )}
              <button
                onClick={() => onSelect(selectedInc.id)}
                className="mt-1 font-semibold text-[#0D6053] underline"
              >
                Open detail
              </button>
            </div>
          </Popup>
        )}
      </Map>

      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}

/** The scene marker: the reporter's consented photo once it has loaded, the priority pin until then. */
function ReporterSceneMarker({ incident, selected }: { incident: MapIncident; selected: boolean }): JSX.Element {
  const photoUrl = useReporterPhotoUrl(incident.id, incident.reporter_has_photo);
  return <CitizenMarker photoUrl={photoUrl} priority={incident.priority} selected={selected} />;
}

/** Popup: the reporter photo large enough to recognise someone, labelled as the reporter (rule 2). */
function ReporterPopupPhoto({ incident }: { incident: MapIncident }): JSX.Element {
  const photoUrl = useReporterPhotoUrl(incident.id, incident.reporter_has_photo);
  const label = reporterLabel(incident.reporter_has_photo, incident.reporter_is_guest);
  if (!photoUrl) return <div className="mt-0.5 text-[10px] text-[#40536D]">{label}</div>;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- private object URL, never a public image */}
      <img
        src={photoUrl}
        alt={`Reporter of ${incident.public_reference}`}
        width={72}
        height={72}
        className="h-[72px] w-[72px] shrink-0 rounded-lg object-cover"
      />
      <div className="max-w-[140px]">
        <div className="text-[10px] font-semibold text-[#1C2B3A]">{label}</div>
        <div className="text-[10px] leading-tight text-[#8795A3]">{REPORTER_PHOTO_NOTE}</div>
      </div>
    </div>
  );
}

export default IncidentMapView;
