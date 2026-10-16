import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import {
  BOCAUE_BOUNDS,
  BOCAUE_CENTER,
  BOCAUE_DEFAULT_ZOOM,
  BOCAUE_MIN_ZOOM,
  BOCAUE_MAX_ZOOM,
  FALLBACK_MAP_STYLE_URL,
} from '@/src/config/bocaue-geo';

/**
 * Real 19-barangay polygons (GADM Level-4, Bocaue / Bulacan). Drives the per-barangay
 * fill + outline. Relative path + `.json` so Metro bundles it as a parsed object —
 * the `@/` alias and a `.geojson` extension are NOT resolved by Metro's default
 * resolver and break the whole bundle.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BOCAUE_BARANGAY_SHAPES = require('../../assets/geo/bocaue-barangays.json');

/**
 * FALLBACK MUNICIPAL OUTLINE SLOT.
 *
 * Paste Bocaue's official single administrative boundary here — one Polygon or
 * MultiPolygon Feature tracing the municipal edge. While this stays empty the line
 * layer renders nothing; the 19 barangay outlines already define the territory.
 *
 * v11 API mapping for the structure you asked about:
 *   <ShapeSource> → <GeoJSONSource>   (see `bocaue-municipal-outline` below)
 *   <FillLayer>   → <Layer type="fill">
 *   <LineLayer>   → <Layer type="line">
 */
const MUNICIPAL_BOUNDARY: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * The 19 target barangays of Bocaue, kept here for reference and for the label
 * markers below: Antipona, Bagumbayan, Bambang, Batia, Biñang 1st, Biñang 2nd,
 * Bolacan, Bundukan, Bunlo, Caingin, Duhat, Igulot, Lolomboy, Poblacion, Sulucan,
 * Taal, Tambobong, Turo, Wakas.
 *
 * Label positions derive from each polygon's bounding-box center so all 19 render
 * without a hardcoded coordinate table and without depending on the active tile
 * style's glyph fonts (a symbol layer would require a `text-font` present in both
 * MapTiler and OpenFreeMap glyphs — RN <Marker> text sidesteps that entirely).
 */
const BARANGAY_LABELS: Array<{ name: string; center: [number, number] }> =
  (BOCAUE_BARANGAY_SHAPES.features as Array<{ properties?: { NAME?: string }; geometry: unknown }>)
    .map((feature) => ({
      name: feature.properties?.NAME ?? '',
      center: boundingBoxCenter(feature.geometry),
    }))
    .filter((label) => label.name.length > 0);

/** Recursively walks Polygon / MultiPolygon coordinates and returns the bbox center. */
function boundingBoxCenter(geometry: unknown): [number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const visit = (node: unknown): void => {
    if (Array.isArray(node) && typeof node[0] === 'number') {
      const [lng, lat] = node as [number, number];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    if (Array.isArray(node)) node.forEach(visit);
  };

  visit((geometry as { coordinates?: unknown })?.coordinates);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * Locks the MapLibre view to the Municipality of Bocaue, Bulacan.
 *
 * Camera scope (all applied on <Camera>, which is where v11 accepts them — NOT on
 * <Map>, which silently drops them):
 *   maxBounds  → BOCAUE_BOUNDS  — [west, south, east, north]; panning cannot leave Bocaue
 *   minZoom    → 12.5           — the municipality always fills the frame
 *   maxZoom    → 18.5           — barangay street-level detail
 *   center     → [120.931, 14.798] via initialViewState
 *
 * `styleUrl` should come from the backend `/v1/locations/map-config`; it defaults to
 * the keyless OpenFreeMap Liberty style when no config is supplied.
 */
export function BocaueScopedMap({ styleUrl = FALLBACK_MAP_STYLE_URL }: { styleUrl?: string }) {
  const cameraRef = useRef<CameraRef>(null);

  return (
    <View style={styles.container}>
      <Map style={StyleSheet.absoluteFill} mapStyle={styleUrl}>
        <Camera
          ref={cameraRef}
          maxBounds={BOCAUE_BOUNDS}
          minZoom={BOCAUE_MIN_ZOOM}
          maxZoom={BOCAUE_MAX_ZOOM}
          initialViewState={{ center: BOCAUE_CENTER, zoom: BOCAUE_DEFAULT_ZOOM }}
        />

        {/* 19 barangays — translucent fill + hairline outline */}
        <GeoJSONSource id="bocaue-barangays" data={BOCAUE_BARANGAY_SHAPES}>
          <Layer id="barangay-fill" type="fill" style={barangayFillStyle} />
          <Layer id="barangay-outline" type="line" style={barangayOutlineStyle} />
        </GeoJSONSource>

        {/* Municipal boundary edge — paste official GeoJSON into MUNICIPAL_BOUNDARY above */}
        <GeoJSONSource id="bocaue-municipal-outline" data={MUNICIPAL_BOUNDARY}>
          <Layer id="municipal-edge" type="line" style={municipalEdgeStyle} />
        </GeoJSONSource>

        {/* One label per barangay, placed at the polygon's center */}
        {BARANGAY_LABELS.map((label) => (
          <Marker key={label.name} id={`brgy-${label.name}`} lngLat={label.center}>
            <View style={styles.labelChip} pointerEvents="none">
              <Text style={styles.labelText} numberOfLines={1}>
                {label.name}
              </Text>
            </View>
          </Marker>
        ))}
      </Map>
    </View>
  );
}

export default BocaueScopedMap;

// MapLibre GL layer paint/layout specs — these are style-spec objects, not React
// Native view styles, so they live outside StyleSheet.create.
const barangayFillStyle = { fillColor: '#0D6053', fillOpacity: 0.05 } as const;

const barangayOutlineStyle = {
  lineColor: '#0D6053',
  lineWidth: 1.2,
  lineOpacity: 0.45,
  lineJoin: 'round',
} as const;

const municipalEdgeStyle = {
  lineColor: '#0A443F',
  lineWidth: 2.5,
  lineOpacity: 0.9,
  lineJoin: 'round',
  lineCap: 'round',
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  labelChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13,96,83,0.35)',
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D6053',
  },
});
