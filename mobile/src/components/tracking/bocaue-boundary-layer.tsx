import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

// Relative path + .json extension so Metro bundles it natively (returns the parsed
// object). The `@/` alias and a `.geojson` extension are not resolved by Metro's
// default resolver, which breaks the whole bundle since this require runs at import time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bocaueGeoJSON = require('../../assets/geo/bocaue-barangays.json');

/**
 * Renders the Bocaue barangay boundary outlines as a MapLibre GL layer pair
 * (fill + line) with barangay name labels at zoom ≥ 13.
 *
 * Disabled by default (`show` prop) until the sourced GeoJSON is QA-verified.
 * Replace bocaue-barangays.json with real GADM/Overpass Level-4 data and
 * confirm the `NAME` property key before enabling in production.
 *
 * Integrate inside any <Map> component:
 *   <BocaueBarangayBoundaryLayer show={showBoundary} />
 */
export function BocaueBarangayBoundaryLayer({ show = true }: { show?: boolean }) {
  if (!show) return null;

  return (
    <GeoJSONSource id="bocaue-barangays" data={bocaueGeoJSON}>
      <Layer
        id="barangay-fill"
        type="fill"
        style={{ fillColor: '#0D6053', fillOpacity: 0.06 }}
      />
      <Layer
        id="barangay-outline"
        type="line"
        style={{ lineColor: '#0D6053', lineWidth: 1.2, lineOpacity: 0.45 }}
      />
      <Layer
        id="barangay-labels"
        type="symbol"
        minzoom={13}
        style={{
          textField: ['get', 'NAME'],
          textSize: 11,
          textColor: '#0D6053',
          textHaloColor: '#FFFFFF',
          textHaloWidth: 1.5,
          textFont: ['Open Sans Regular'],
        } as any}
      />
    </GeoJSONSource>
  );
}
