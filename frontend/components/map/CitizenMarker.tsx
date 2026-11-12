import type { JSX } from 'react';
import { priorityRingColor } from '@agap/shared';

interface CitizenMarkerProps {
  /** Object URL of the reporter's consented profile photo; null → neutral priority pin. */
  photoUrl: string | null;
  priority: string;
  selected: boolean;
}

/**
 * Incident scene marker drawn for the REPORTER (never the patient). A registered
 * reporter who agreed to show their profile photo to responders gets that photo
 * inside a ring coloured by the incident's priority; everyone else (guest, no
 * photo, no consent, still loading, offline) keeps the neutral priority pin.
 */
export function CitizenMarker({ photoUrl, priority, selected }: CitizenMarkerProps): JSX.Element {
  const color = priorityRingColor(priority);

  if (!photoUrl) {
    return (
      <div
        style={{
          width: selected ? 24 : 16,
          height: selected ? 24 : 16,
          borderRadius: '50%',
          backgroundColor: color,
          border: `${selected ? 3 : 1.5}px solid ${selected ? '#1C2B3A' : color}`,
          cursor: 'pointer',
          boxShadow: selected ? '0 0 0 4px rgba(28,43,58,0.15)' : undefined,
          transition: 'all 0.15s',
        }}
      />
    );
  }

  const size = selected ? 44 : 36;
  return (
    <div
      className="overflow-hidden rounded-full bg-white"
      style={{
        width: size,
        height: size,
        border: `3px solid ${color}`,
        cursor: 'pointer',
        boxShadow: selected ? '0 0 0 4px rgba(28,43,58,0.18)' : '0 1px 4px rgba(0,0,0,0.25)',
        transition: 'all 0.15s',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private object URL inside a map overlay */}
      <img src={photoUrl} alt="" width={size} height={size} draggable={false} className="h-full w-full object-cover" />
    </div>
  );
}

/** Popup / tooltip wording — always "Reporter", never "Patient". */
export function reporterLabel(hasPhoto: boolean | null | undefined, isGuest: boolean | null | undefined): string {
  if (isGuest) return 'Guest report';
  if (hasPhoto) return 'Reporter photo (shared with consent)';
  if (isGuest === false) return 'Reporter (registered)';
  return 'Reporter';
}

/** Under the larger popup photo: the face is the caller's, who may not be the one hurt. */
export const REPORTER_PHOTO_NOTE = 'The person who reported it. May not be the patient.';
