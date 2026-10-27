'use client';

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, { Marker, type MapRef, type MapLayerMouseEvent, type MarkerDragEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/features/map/hooks';
import { BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM } from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';
import { HospitalMarker } from '@/components/map/HospitalMarker';

interface HospitalLocationMapProps {
  point: { latitude: number; longitude: number } | null;
  verified: boolean;
  onPick: (latitude: number, longitude: number) => void;
}

/**
 * The map half of HospitalLocationPicker. Click or drag sets the point. Not
 * clamped to Bocaue: a receiving hospital may be anywhere in the service area.
 */
export default function HospitalLocationMap({ point, verified, onPick }: HospitalLocationMapProps): JSX.Element {
  const styleUrl = useMapStyle();
  const mapRef = useRef<MapRef | null>(null);
  const attachMap = useCallback((map: MapRef | null) => {
    mapRef.current = map;
    resolveMissingStyleImages(map);
  }, []);
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);

  // Typed or suggested coordinates off-screen: bring them into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    if (!map.getBounds().contains([point.longitude, point.latitude])) {
      map.easeTo({ center: [point.longitude, point.latitude], duration: 600 });
    }
  }, [point]);

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl border border-[rgba(168,181,193,0.20)]">
      <Map
        key={mapKey}
        ref={attachMap}
        mapStyle={styleUrl}
        // The style URL changes once map-config loads; rebuild instead of diffing.
        styleDiffing={false}
        initialViewState={{
          longitude: point?.longitude ?? BOCAUE_CENTER[0],
          latitude: point?.latitude ?? BOCAUE_CENTER[1],
          zoom: point ? 15 : BOCAUE_DEFAULT_ZOOM,
        }}
        style={{ height: '100%', width: '100%' }}
        cursor="crosshair"
        onClick={(e: MapLayerMouseEvent) => onPick(e.lngLat.lat, e.lngLat.lng)}
        onError={() => setTileError(true)}
        onLoad={() => setTileError(false)}
      >
        {point && (
          <Marker
            longitude={point.longitude}
            latitude={point.latitude}
            anchor="center"
            draggable
            onDragEnd={(e: MarkerDragEvent) => onPick(e.lngLat.lat, e.lngLat.lng)}
          >
            <HospitalMarker verified={verified} selected />
          </Marker>
        )}
      </Map>
      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}
