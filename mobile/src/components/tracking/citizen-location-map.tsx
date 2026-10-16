import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Map, Camera, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BOCAUE_BOUNDS,
  BOCAUE_CENTER,
  BOCAUE_DEFAULT_ZOOM,
  BOCAUE_MIN_ZOOM,
  BOCAUE_MAX_ZOOM,
} from '@/src/config/bocaue-geo';
import { BocaueBarangayBoundaryLayer } from './bocaue-boundary-layer';

const TILE_LOAD_TIMEOUT_MS = 15_000;

/**
 * Lightweight location-confirmation map for the citizen GPS capture step (MOD-11 / MOD-12).
 * Lighter than LiveTrackingMap — no route line, no 3D buildings, no follow mode, no
 * navigation controls. Renders a single "You are here" pin and lets the citizen pan/zoom
 * to verify the captured position before proceeding.
 *
 * styleUrl comes from /v1/locations/map-config (MapLibre-compatible HTTPS style, no
 * mapbox:// sources). A null URL falls back to the MapLibre demo tiles at the call site.
 *
 * Load lifecycle: 15-second tile timeout; onDidFailLoadingMap fires on immediate failure.
 * Either event shows a retry overlay that remounts the GL surface (increment mapKey).
 * Callers wrap this component in a MapErrorBoundary + React.Suspense.
 */
export default function CitizenLocationMap({
  styleUrl,
  coords,
  onRetryLocation,
  showBoundary = false,
}: {
  styleUrl: string;
  coords: { lat: number; lng: number } | null;
  onRetryLocation?: () => void;
  showBoundary?: boolean;
}) {
  const cameraRef = useRef<CameraRef>(null);
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Re-center the camera whenever the GPS fix updates (e.g. after the user taps
  // the locate button). initialViewState only fires on the first mount, so
  // subsequent coord changes require an explicit camera move.
  useEffect(() => {
    if (!coords) return;
    try {
      cameraRef.current?.easeTo({ center: [coords.lng, coords.lat], zoom: 15, duration: 500 });
    } catch {
      // Camera not ready on first render — initialViewState handles that.
    }
  }, [coords?.lat, coords?.lng]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        key={mapKey}
        style={StyleSheet.absoluteFill}
        mapStyle={styleUrl}
        onDidFinishLoadingStyle={onStyleLoaded}
        onDidFailLoadingMap={onMapFailed}
      >
        <Camera
          ref={cameraRef}
          maxBounds={BOCAUE_BOUNDS}
          minZoom={BOCAUE_MIN_ZOOM}
          maxZoom={BOCAUE_MAX_ZOOM}
          {...(coords
            ? { initialViewState: { center: [coords.lng, coords.lat], zoom: 15 } }
            : { initialViewState: { center: BOCAUE_CENTER, zoom: BOCAUE_DEFAULT_ZOOM } })}
        />

        <BocaueBarangayBoundaryLayer show={showBoundary} />

        {coords && (
          <Marker id="citizen-pin" lngLat={[coords.lng, coords.lat]}>
            <View style={styles.pin}>
              <Ionicons name="location" size={18} color="#FFFFFF" />
            </View>
          </Marker>
        )}
      </Map>

      {/* Refresh-GPS button — calls the parent's GPS re-acquire, not just the tile */}
      {onRetryLocation && (
        <TouchableOpacity
          style={styles.locateBtn}
          onPress={onRetryLocation}
          accessibilityRole="button"
          accessibilityLabel="Refresh GPS location"
        >
          <Ionicons name="locate" size={18} color="#0D6053" />
        </TouchableOpacity>
      )}

      {/* Tile-load error overlay — shown after 15 s or on onDidFailLoadingMap */}
      {tileError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="map-outline" size={30} color="#6B7280" />
          <Text style={styles.errorText}>Map unavailable</Text>
          <Text style={styles.errorSub}>
            Check your connection or ask your administrator to verify the map configuration.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setTileError(false); setMapKey((k) => k + 1); }}
            accessibilityRole="button"
          >
            <Ionicons name="refresh" size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0D6053',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  locateBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(249,250,251,0.93)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 20,
  },
  errorText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  errorSub:  { fontSize: 11, color: '#6B7280', textAlign: 'center', lineHeight: 16 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#0D6053',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
