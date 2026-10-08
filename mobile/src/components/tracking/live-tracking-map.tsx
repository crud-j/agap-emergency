import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, type NativeSyntheticEvent } from 'react-native';
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

export interface LatLngLite {
  lat: number;
  lng: number;
}

interface RegionChange {
  userInteraction?: boolean;
}

/**
 * Interactive live-tracking map (MOD-13 / MOD-22 / MOD-43) rendered with MapLibre
 * GL — no vendor lock-in, no per-render API cost. Shows the incident pin, the
 * responder's live position, and the route line.
 *
 * Camera UX: starts in "follow" mode tracking the unit. Panning the map releases
 * follow (so the user can look around); the Recenter button re-follows, and the
 * Fit-route button frames the whole route. `styleUrl` should point to a
 * MapLibre-compatible style. Rendered behind an error boundary by callers.
 */
export function LiveTrackingMap({
  styleUrl,
  incident,
  responder,
  routeGeometry,
}: {
  styleUrl: string;
  incident: LatLngLite | null;
  responder: (LatLngLite & { heading?: number }) | null;
  routeGeometry?: Array<[number, number]> | null;
}) {
  const cameraRef = useRef<CameraRef>(null);
  const [follow, setFollow] = useState(true);
  const center = responder ?? incident;

  // While following, keep the camera on the moving unit (pan only, keep zoom).
  useEffect(() => {
    if (!follow || !center) return;
    try {
      cameraRef.current?.easeTo({ center: [center.lng, center.lat], duration: 600 });
    } catch {
      // Camera not ready yet — the next position update will retry.
    }
  }, [follow, center?.lat, center?.lng]);

  function recenter() {
    setFollow(true);
    if (!center) return;
    try {
      cameraRef.current?.easeTo({ center: [center.lng, center.lat], zoom: 15, duration: 500 });
    } catch {
      // ignore
    }
  }

  function fitRoute() {
    const pts: LatLngLite[] = [];
    if (responder) pts.push(responder);
    if (incident) pts.push(incident);
    if (routeGeometry) for (const [lng, lat] of routeGeometry) pts.push({ lat, lng });
    if (pts.length < 2) {
      recenter();
      return;
    }
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const pad = 0.004; // ~450 m breathing room so markers aren't at the edge
    const bounds: LngLatBounds = [
      Math.min(...lngs) - pad,
      Math.min(...lats) - pad,
      Math.max(...lngs) + pad,
      Math.max(...lats) + pad,
    ];
    setFollow(false);
    try {
      cameraRef.current?.fitBounds(bounds, { duration: 600 });
    } catch {
      // ignore
    }
  }

  function onRegionIsChanging(event: NativeSyntheticEvent<RegionChange>) {
    // A user pan/zoom releases follow; programmatic moves (userInteraction=false)
    // don't, so following doesn't fight itself.
    if (event.nativeEvent?.userInteraction && follow) setFollow(false);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map style={StyleSheet.absoluteFill} mapStyle={styleUrl} onRegionIsChanging={onRegionIsChanging}>
        <Camera
          ref={cameraRef}
          {...(center ? { initialViewState: { center: [center.lng, center.lat], zoom: 14 } } : {})}
        />

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

      <View style={styles.controls}>
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
});

export default LiveTrackingMap;
