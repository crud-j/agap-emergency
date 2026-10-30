'use client';

import { useId, useMemo, type JSX } from 'react';
import dynamic from 'next/dynamic';
import { parseCoordinate, roundCoordinate, type CoordinateText } from '@/features/hospitals/location';
import type { MapCandidate } from './HospitalLocationMap';

const HospitalLocationMap = dynamic(() => import('./HospitalLocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-56 w-full items-center justify-center rounded-xl bg-agap-surface text-sm text-agap-textSub">
      Loading map…
    </div>
  ),
});

interface HospitalLocationPickerProps {
  value: CoordinateText;
  onChange: (next: CoordinateText) => void;
  /** Draws the marker solid when the saved location is verified. */
  verified?: boolean;
  disabled?: boolean;
  /** "Find location" results not yet picked, drawn as faint markers. */
  candidates?: MapCandidate[];
  onCandidateClick?: (id: string) => void;
}

/**
 * Hospital coordinates (MOD-39): type them, or click / drag the pin. The inputs
 * work on their own (keyboard-only, or when the map cannot load). Order is always
 * latitude first, then longitude.
 */
export function HospitalLocationPicker({
  value, onChange, verified = false, disabled = false, candidates, onCandidateClick,
}: HospitalLocationPickerProps): JSX.Element {
  const id = useId();
  const lat = parseCoordinate(value.latitude, 'latitude');
  const lng = parseCoordinate(value.longitude, 'longitude');
  const latValue = lat.value;
  const lngValue = lng.value;
  const point = useMemo(
    () => (latValue != null && lngValue != null ? { latitude: latValue, longitude: lngValue } : null),
    [latValue, lngValue],
  );

  function pick(latitude: number, longitude: number) {
    if (disabled) return;
    onChange({ latitude: String(roundCoordinate(latitude)), longitude: String(roundCoordinate(longitude)) });
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-agap-textMain">
        Location <span className="font-normal text-agap-textSub">(Latitude, Longitude)</span>
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <CoordinateInput
          id={`${id}-lat`} label="Latitude" placeholder="14.7967900"
          value={value.latitude} error={lat.error}
          onChange={(latitude) => onChange({ ...value, latitude })}
        />
        <CoordinateInput
          id={`${id}-lng`} label="Longitude" placeholder="120.9435800"
          value={value.longitude} error={lng.error}
          onChange={(longitude) => onChange({ ...value, longitude })}
        />
      </div>
      <p className="text-xs text-agap-textSub">
        Click the map or drag the pin to the ambulance entrance. Up to 7 decimal places.
      </p>
      <HospitalLocationMap point={point} verified={verified} onPick={pick}
        candidates={candidates} onCandidateClick={disabled ? undefined : onCandidateClick} />
    </fieldset>
  );
}

function CoordinateInput({ id, label, placeholder, value, error, onChange }: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-agap-textMid">{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-10 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm tabular-nums text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
      />
      {error && <p id={`${id}-error`} className="text-xs text-agap-danger">{error}</p>}
    </div>
  );
}
