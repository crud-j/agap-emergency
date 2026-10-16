import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type NativeSyntheticEvent } from 'react-native';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BOCAUE_BOUNDS,
  BOCAUE_CENTER,
  BOCAUE_DEFAULT_ZOOM,
  BOCAUE_MIN_ZOOM,
  BOCAUE_MAX_ZOOM,
} from '@/src/config/bocaue-geo';
import { BocaueBarangayBoundaryLayer } from './bocaue-boundary-layer';

export interface LatLngLite {
  lat: number;
  lng: number;
}

interface RegionChange {
  userInteraction?: boolean;
}

// Bocaue flood zones can have degraded connectivity. Allow 15 s before surfacing an error.
const TILE_LOAD_TIMEOUT_MS = 15_000;

/**
 * Interactive live-tracking map (MOD-13 / MOD-22 / MOD-43) rendered with MapLibre
 * GL — no vendor lock-in, no per-render API cost. Shows the incident pin, the
 * responder's live position, and the route line.
 *
 * Camera UX: starts in "follow" mode tracking the unit. Panning releases follow;
 * Recenter re-follows. The 3D cube button toggles between pitch-perspective and
 * flat top-down. Fit-route frames the whole route and resets to flat.
 *
 * 3D features:
 *  - `pitch` prop: callers set >0 when en-route (responder 50°, citizen 20°).
 *  - `navigationHeading`: camera rotates to face travel direction when in 3D mode.
 *  - `supports3dBuildings`: enables fill-extrusion layer; only true when the active
 *    tile style has OpenMapTiles building height data (backend `MAP_STYLE_URL`).
 *
 * Load lifecycle: `onDidFinishLoadingStyle` clears the 15-second timeout. Either
 * `onDidFailLoadingMap` or the timeout surfacing shows a retry overlay. Tapping
 * Retry increments `mapKey` which unmounts + remounts the GL surface entirely.
 *
 * `styleUrl` must be a MapLibre-compatible HTTPS style — not a mapbox:// URL.
 * Rendered behind an error boundary by callers.
 */
export function LiveTrackingMap({
  styleUrl,
  incident,
  responder,
  routeGeometry,
  pitch: externalPitch = 0,
  navigationHeading = null,
  supports3dBuildings = false,
  showBoundary = false,
}: {
  styleUrl: string;
  incident: LatLngLite | null;
  responder: (LatLngLite & { heading?: number }) | null;
  routeGeometry?: Array<[number, number]> | null;
  /** Camera tilt in degrees (0 = top-down). Responders get 50° en-route, citizens 20°. */
  pitch?: number;
  /** When set, camera bearing rotates to face travel direction (navigation mode). */
  navigationHeading?: number | null;
  /** Enables the fill-extrusion building layer. True only when the tile style has
   *  OpenMapTiles-format building height data (see backend MAP_STYLE_URL). */
  supports3dBuildings?: boolean;
  showBoundary?: boolean;
}) {
  const cameraRef = useRef<CameraRef>(null);
  const [follow, setFollow] = useState(true);
  const [is3d, setIs3d]     = useState(externalPitch > 0);
  // Increment to force a full native GL remount on retry (changing `key` unmounts + remounts).
  const [mapKey, setMapKey]       = useState(0);
  const [tileError, setTileError] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const center = responder ?? incident;

  // is3d: use external pitch + bearing from navigationHeading
  // flat: pitch=0, north-up bearing (undefined)
  const activePitch   = is3d ? externalPitch : 0;
  const activeBearing = is3d && navigationHeading != null ? navigationHeading : undefined;

  // Arm the load-failure timeout whenever the style URL or map key changes.
  // onDidFinishLoadingStyle clears it. onDidFailLoadingMap or timeout expiry
  // both set tileError=true to show the retry overlay.
  useEffect(() => {
    setTileError(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setTileError(true), TILE_LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [styleUrl, mapKey]);

  const onStyleLoaded = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTileError(false);
  }, []);

  const onMapFailed = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTileError(true);
  }, []);

  // Track the moving unit — update center (and pitch/bearing) whenever position changes.
  useEffect(() => {
    if (!follow || !center) return;
    try {
      cameraRef.current?.easeTo({
        center: [center.lng, center.lat],
        pitch:  activePitch,
        ...(activeBearing != null ? { bearing: activeBearing } : {}),
        duration: 600,
      });
    } catch {
      // Camera not ready yet — the next position update will retry.
    }
  }, [follow, center?.lat, center?.lng, activePitch, activeBearing]);

  function recenter() {
    setFollow(true);
    if (!center) return;
    try {
      cameraRef.current?.easeTo({ center: [center.lng, center.lat], zoom: 15, duration: 500 });
    } catch {
      // ignore
    }
  }

  function toggle3d() {
    setIs3d((prev) => !prev);
    setFollow(true); // re-enter follow so the camera centres immediately
  }

  function clampToBocaue(bounds: LngLatBounds): LngLatBounds {
    return [
      Math.max(bounds[0], BOCAUE_BOUNDS[0]),
      Math.max(bounds[1], BOCAUE_BOUNDS[1]),
      Math.min(bounds[2], BOCAUE_BOUNDS[2]),
      Math.min(bounds[3], BOCAUE_BOUNDS[3]),
    ];
  }

  function fitRoute() {
    const pts: LatLngLite[] = [];
    if (responder) pts.push(responder);
    if (incident)  pts.push(incident);
    if (routeGeometry) for (const [lng, lat] of routeGeometry) pts.push({ lat, lng });
    if (pts.length < 2) {
      recenter();
      return;
    }
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const pad = 0.004; // ~450 m breathing room so markers aren't at the edge
    const rawBounds: LngLatBounds = [
      Math.min(...lngs) - pad,
      Math.min(...lats) - pad,
      Math.max(...lngs) + pad,
      Math.max(...lats) + pad,
    ];
    setIs3d(false);   // flat top-down for route overview
    setFollow(false);
    try {
      cameraRef.current?.fitBounds(clampToBocaue(rawBounds), { duration: 600 });
    } catch {
      // ignore
    }
  }

  function onRegionIsChanging(event: NativeSyntheticEvent<RegionChange>) {
    // User pan/zoom releases follow. Programmatic moves (userInteraction=false) don't.
    if (event.nativeEvent?.userInteraction && follow) setFollow(false);
  }

  function retryMap() {
    setTileError(false);
    setMapKey((k) => k + 1);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        key={mapKey}
        style={StyleSheet.absoluteFill}
        mapStyle={styleUrl}
        onRegionIsChanging={onRegionIsChanging}
        onDidFinishLoadingStyle={onStyleLoaded}
        onDidFailLoadingMap={onMapFailed}
      >
        <Camera
          ref={cameraRef}
          maxBounds={BOCAUE_BOUNDS}
          minZoom={BOCAUE_MIN_ZOOM}
          maxZoom={BOCAUE_MAX_ZOOM}
          pitch={activePitch}
          bearing={activeBearing}
          duration={600}
          easing="ease"
          {...(center
            ? { initialViewState: { center: [center.lng, center.lat], zoom: 14 } }
            : { initialViewState: { center: BOCAUE_CENTER, zoom: BOCAUE_DEFAULT_ZOOM } })}
        />

        <BocaueBarangayBoundaryLayer show={showBoundary} />

        {/* 3D building extrusion — only when tile style has OpenMapTiles building data */}
        {supports3dBuildings && (
          <Layer
            id="3d-buildings"
            type="fill-extrusion"
            source="openmaptiles"
            {...{ 'source-layer': 'building' }}
            minzoom={14}
            filter={['has', 'height']}
            style={{
              fillExtrusionColor: '#DCE3E9',
              fillExtrusionHeight: [
                'interpolate', ['linear'], ['zoom'],
                14, 0,
                16, ['coalesce', ['get', 'height'], 4],
              ],
              fillExtrusionBase:    ['coalesce', ['get', 'min_height'], 0],
              fillExtrusionOpacity: ['interpolate', ['linear'], ['zoom'], 14, 0, 16, 0.75],
            } as any}
          />
        )}

        {/* Route line */}
        {routeGeometry && routeGeometry.length > 1 && (
          <GeoJSONSource
            id="route"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: routeGeometry },
            }}
          >
            <Layer
              id="route-line"
              type="line"
              style={{ lineColor: '#0D6053', lineWidth: 5, lineOpacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
            />
          </GeoJSONSource>
        )}

        {incident && (
          <Marker id="incident" lngLat={[incident.lng, incident.lat]}>
            <View style={[styles.pin, styles.incidentPin]}>
              <Ionicons name="alert" size={16} color="#FFFFFF" />
            </View>
          </Marker>
        )}

        {responder && (
          <Marker id="responder" lngLat={[responder.lng, responder.lat]}>
            <View style={[styles.pin, styles.responderPin]}>
              {responder.heading != null ? (
                // Heading is degrees clockwise from north; the map is north-up, so
                // rotating an up-arrow by the heading points it along travel.
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color="#FFFFFF"
                  style={{ transform: [{ rotate: `${responder.heading}deg` }] }}
                />
              ) : (
                <Ionicons name="medkit" size={14} color="#FFFFFF" />
              )}
            </View>
          </Marker>
        )}
      </Map>

      {/* Map controls — always above the GL surface */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.ctrlBtn, is3d && styles.ctrlBtnActive]}
          onPress={toggle3d}
          accessibilityRole="button"
          accessibilityLabel={is3d ? 'Switch to flat view' : 'Switch to 3D view'}
        >
          <Ionicons name="cube-outline" size={18} color={is3d ? '#FFFFFF' : '#0D6053'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, follow && styles.ctrlBtnActive]}
          onPress={recenter}
          accessibilityRole="button"
          accessibilityLabel="Recenter and follow the unit"
        >
          <Ionicons name={follow ? 'navigate' : 'navigate-outline'} size={20} color={follow ? '#FFFFFF' : '#0D6053'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={fitRoute}
          accessibilityRole="button"
          accessibilityLabel="Fit the whole route"
        >
          <Ionicons name="scan-outline" size={20} color="#0D6053" />
        </TouchableOpacity>
      </View>

      {/* Tile-load error overlay — shown after 15 s or on onDidFailLoadingMap.
          Rendered on top of the GL surface so the user always gets an action. */}
      {tileError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="map-outline" size={36} color="#6B7280" />
          <Text style={styles.errorTitle}>Map unavailable</Text>
          <Text style={styles.errorSub}>
            Check your connection or ask your administrator to verify the map tile configuration.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={retryMap} accessibilityRole="button">
            <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  incidentPin: { backgroundColor: '#DC2626' },
  responderPin: { backgroundColor: '#0D6053' },

  controls: { position: 'absolute', right: 12, bottom: 12, gap: 10 },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  ctrlBtnActive: { backgroundColor: '#0D6053' },

  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(249,250,251,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  errorSub:   { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 17 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#0D6053',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

export default LiveTrackingMap;
