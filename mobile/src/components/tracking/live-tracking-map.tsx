import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Modal, StyleSheet, TouchableOpacity, type NativeSyntheticEvent } from 'react-native';
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
import { isSignalLost, isWestbound, priorityRingColor, toLngLat } from '@agap/shared';
import { AMBULANCE_ICON } from '@/src/lib/map-icons';
import { SERVICE_AREA_BOUNDS, needsServiceAreaBounds } from '@/src/lib/transport-target';
import type { ExtraUnitMarker } from '@/src/lib/incident-tracking';
import { colors } from '@/src/theme/tokens';

export interface LatLngLite {
  lat: number;
  lng: number;
}

interface RegionChange {
  userInteraction?: boolean;
}

// Bocaue flood zones can have degraded connectivity. Allow 15 s before surfacing an error.
const TILE_LOAD_TIMEOUT_MS = 15_000;
// Zoomed out far enough to frame a transport to a hospital elsewhere in Bulacan.
const SERVICE_AREA_MIN_ZOOM = 9;

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
 * Transport (plan §15): `destination` draws the hospital marker. While it is set the
 * fit-route button (and the first fit when it appears) frames the responder, the
 * hospital and the route, not the scene; `incidentDimmed` fades the scene pin and
 * `routeDimmed` fades a last-known route. When the destination or the route leaves
 * Bocaue, `maxBounds` widens from the Bocaue clamp to the service area.
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
  responderIcon = 'ambulance',
  citizenPhotoUri = null,
  priority,
  pitch: externalPitch = 0,
  navigationHeading = null,
  supports3dBuildings = false,
  showBoundary = false,
  destination = null,
  incidentDimmed = false,
  routeDimmed = false,
  otherUnits = [],
}: {
  styleUrl: string;
  incident: LatLngLite | null;
  responder: (LatLngLite & { heading?: number; updatedAt?: string }) | null;
  /** Further units on the same incident; drawn with their call sign, never followed. */
  otherUnits?: ExtraUnitMarker[];
  routeGeometry?: Array<[number, number]> | null;
  responderIcon?: 'ambulance';
  /**
   * The REPORTER's profile photo for the scene marker, shown only with their consent
   * (never the patient's). null → the neutral incident pin.
   */
  citizenPhotoUri?: string | null;
  priority?: string | null;
  /** Camera tilt in degrees (0 = top-down). Responders get 50° en-route, citizens 20°. */
  pitch?: number;
  /** When set, camera bearing rotates to face travel direction (navigation mode). */
  navigationHeading?: number | null;
  /** Enables the fill-extrusion building layer. True only when the tile style has
   *  OpenMapTiles-format building height data (see backend MAP_STYLE_URL). */
  supports3dBuildings?: boolean;
  showBoundary?: boolean;
  /** The transport's hospital (MOD-40); null outside transport or without coordinates. */
  destination?: (LatLngLite & { label: string }) | null;
  /** Fade the scene pin (during transport). */
  incidentDimmed?: boolean;
  /** Fade the route line (a last-known route, plan §19). */
  routeDimmed?: boolean;
}) {
  const cameraRef = useRef<CameraRef>(null);
  const [follow, setFollow] = useState(true);
  const [is3d, setIs3d]     = useState(externalPitch > 0);
  // Increment to force a full native GL remount on retry (changing `key` unmounts + remounts).
  const [mapKey, setMapKey]       = useState(0);
  const [tileError, setTileError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [ambulanceImageFailed, setAmbulanceImageFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFollowUpdateRef = useRef(0);

  const center = responder ?? incident;
  const wideArea = needsServiceAreaBounds([
    ...(destination ? [destination] : []),
    ...(routeGeometry ?? []).map(([lng, lat]) => ({ lat, lng })),
  ]);
  const activeBounds: LngLatBounds = wideArea ? SERVICE_AREA_BOUNDS : BOCAUE_BOUNDS;
  const responderSignalLost = responder?.updatedAt
    ? isSignalLost(responder.updatedAt, now)
    : false;
  const [failedPhotoUri, setFailedPhotoUri] = useState<string | null>(null);
  const citizenPhoto = citizenPhotoUri && citizenPhotoUri !== failedPhotoUri ? citizenPhotoUri : null;

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

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
    const now = Date.now();
    if (now - lastFollowUpdateRef.current < 750) return;
    lastFollowUpdateRef.current = now;
    try {
      cameraRef.current?.easeTo({
        center: [center.lng, center.lat],
        pitch:  activePitch,
        ...(activeBearing != null ? { bearing: activeBearing } : {}),
        duration: 350,
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

  function clampToBounds(bounds: LngLatBounds): LngLatBounds {
    return [
      Math.max(bounds[0], activeBounds[0]),
      Math.max(bounds[1], activeBounds[1]),
      Math.min(bounds[2], activeBounds[2]),
      Math.min(bounds[3], activeBounds[3]),
    ];
  }

  function fitRoute() {
    const pts: LatLngLite[] = [];
    if (responder) pts.push(responder);
    pts.push(...otherUnits);
    // During transport frame the responder and the hospital, not the scene behind them.
    if (destination) pts.push(destination);
    else if (incident) pts.push(incident);
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
      cameraRef.current?.fitBounds(clampToBounds(rawBounds), { duration: 600 });
    } catch {
      // ignore
    }
  }

  // A new hospital (transport start or destination change): frame it once with the
  // responder. Follow resumes from the Recenter button.
  const destinationKey = destination ? `${destination.lat},${destination.lng}` : null;
  useEffect(() => {
    if (!destinationKey) return;
    const timer = setTimeout(fitRoute, 400); // let the camera mount first
    return () => clearTimeout(timer);
  }, [destinationKey]);

  function onRegionIsChanging(event: NativeSyntheticEvent<RegionChange>) {
    // User pan/zoom releases follow. Programmatic moves (userInteraction=false) don't.
    if (event.nativeEvent?.userInteraction && follow) setFollow(false);
  }

  function retryMap() {
    setTileError(false);
    setMapKey((k) => k + 1);
  }

  const mapContent = (
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
          maxBounds={activeBounds}
          minZoom={wideArea ? SERVICE_AREA_MIN_ZOOM : BOCAUE_MIN_ZOOM}
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
              style={{
                lineColor: '#0D6053',
                lineWidth: 5,
                lineOpacity: routeDimmed ? 0.35 : 0.85,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </GeoJSONSource>
        )}

        {incident && (
          <Marker id="incident" lngLat={[incident.lng, incident.lat]}>
            <View style={incidentDimmed && styles.dimmed}>
              {citizenPhoto ? (
                <View style={[styles.citizenMarker, { borderColor: priorityRingColor(priority) }]}>
                  <Image
                    source={{ uri: citizenPhoto }}
                    style={styles.citizenImage}
                    resizeMode="cover"
                    onError={() => setFailedPhotoUri(citizenPhoto)}
                    accessibilityIgnoresInvertColors
                  />
                </View>
              ) : (
                <View style={[styles.pin, styles.incidentPin]}>
                  <Ionicons name="alert" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
          </Marker>
        )}

        {destination && (
          <Marker id="destination" lngLat={toLngLat({ latitude: destination.lat, longitude: destination.lng })}>
            <View style={styles.destinationWrap} accessibilityLabel={destination.label}>
              <View style={[styles.pin, styles.destinationPin]}>
                <Ionicons name="medical" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.destinationLabel}>
                <Text style={styles.destinationLabelText} numberOfLines={1}>{destination.label}</Text>
              </View>
            </View>
          </Marker>
        )}

        {otherUnits.map((unit) => {
          const lost = isSignalLost(unit.updatedAt, now);
          return (
            <Marker key={unit.dispatchId} id={`unit-${unit.dispatchId}`} lngLat={[unit.lng, unit.lat]}>
              <View style={styles.responderMarkerWrap} accessibilityLabel={unit.label ?? 'Responding unit'}>
                <View style={[styles.otherUnitMarker, lost && styles.responderSignalLost]}>
                  <Ionicons name="medkit" size={14} color={lost ? colors.textSub : colors.primary} />
                </View>
                <View style={styles.unitLabel}>
                  <Text style={styles.unitLabelText} numberOfLines={1}>
                    {lost ? `${unit.label ?? 'Unit'} · signal lost` : unit.label ?? 'Unit'}
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}

        {responder && (
          <Marker id="responder" lngLat={[responder.lng, responder.lat]}>
            <View style={styles.responderMarkerWrap}>
              <View
                style={[
                  styles.responderMarker,
                  ambulanceImageFailed && !responderSignalLost && styles.responderFallback,
                  responderSignalLost && styles.responderSignalLost,
                ]}
              >
                {!ambulanceImageFailed && responderIcon === 'ambulance' ? (
                  <Image
                    source={AMBULANCE_ICON}
                    onError={() => setAmbulanceImageFailed(true)}
                    resizeMode="contain"
                    style={[
                      styles.ambulanceImage,
                      isWestbound(responder.heading) && styles.westbound,
                      responderSignalLost && styles.signalLostImage,
                    ]}
                  />
                ) : (
                  <Ionicons
                    name="medkit"
                    size={18}
                    color={responderSignalLost ? colors.textSub : '#FFFFFF'}
                  />
                )}
                {responder.heading != null && (
                  <View style={styles.headingChevron}>
                    <Ionicons
                      name="chevron-up"
                      size={16}
                      color={responderSignalLost ? colors.textSub : colors.primary}
                      style={{ transform: [{ rotate: `${responder.heading}deg` }] }}
                    />
                  </View>
                )}
              </View>
              {responderSignalLost && (
                <View style={styles.signalLostBadge}>
                  <Text style={styles.signalLostText}>Signal lost</Text>
                </View>
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

      <TouchableOpacity
        style={styles.fullscreenBtn}
        onPress={() => setFullscreen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={fullscreen ? 'Exit fullscreen map' : 'View fullscreen map'}
      >
        <Ionicons name={fullscreen ? 'contract-outline' : 'expand-outline'} size={20} color="#0D6053" />
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <View style={StyleSheet.absoluteFill}>{!fullscreen && mapContent}</View>
      <Modal
        visible={fullscreen}
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
        statusBarTranslucent
      >
        {fullscreen && <View style={styles.fullscreenRoot}>{mapContent}</View>}
      </Modal>
    </>
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
  dimmed: { opacity: 0.45 },
  destinationWrap: { alignItems: 'center' },
  destinationPin: { backgroundColor: '#2563EB' },
  destinationLabel: {
    marginTop: 3,
    maxWidth: 160,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  destinationLabelText: { fontSize: 10, fontWeight: '700', color: '#1E3A8A' },
  citizenMarker: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    backgroundColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  citizenImage: { width: 40, height: 40, borderRadius: 20 },
  responderMarkerWrap: { alignItems: 'center', justifyContent: 'center' },
  responderMarker: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherUnitMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitLabel: {
    marginTop: 3,
    maxWidth: 140,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unitLabelText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  responderSignalLost: { backgroundColor: '#E5E7EB', borderColor: colors.textSub },
  responderFallback: { backgroundColor: colors.primary },
  ambulanceImage: { width: 40, height: 40 },
  westbound: { transform: [{ scaleX: -1 }] },
  signalLostImage: { tintColor: colors.textSub, opacity: 0.8 },
  headingChevron: {
    position: 'absolute',
    top: -9,
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
  },
  signalLostBadge: {
    position: 'absolute',
    top: 47,
    backgroundColor: '#4B5563',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  signalLostText: { color: colors.white, fontSize: 9, fontWeight: '700' },

  controls: { position: 'absolute', right: 12, bottom: 12, gap: 10 },
  fullscreenRoot: { flex: 1, backgroundColor: '#F2F5F8' },
  fullscreenBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
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
    ...StyleSheet.absoluteFill,
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

export default React.memo(LiveTrackingMap);
