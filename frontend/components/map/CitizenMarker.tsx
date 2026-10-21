import type { JSX } from 'react';
import { priorityRingColor } from '@agap/shared';
import { citizenIconFor } from '@/lib/map-icons';

interface CitizenMarkerProps {
  /** Staff-only derived reporter sex; null → neutral priority pin. */
  reporterSex: string | null | undefined;
  priority: string;
  selected: boolean;
}

/**
 * Incident scene marker drawn for the REPORTER (never the patient). A registered
 * reporter who chose Male/Female gets that icon inside a ring coloured by the
 * incident's priority; everyone else (guest, unknown, "prefer not to say") keeps
 * the neutral priority-coloured pin.
 */
export function CitizenMarker({ reporterSex, priority, selected }: CitizenMarkerProps): JSX.Element {
  const color = priorityRingColor(priority);
  const icon = citizenIconFor(reporterSex);

  if (!icon) {
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

  const size = selected ? 40 : 32;
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
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static marker icon inside a map overlay */}
      <img src={icon} alt="" width={size} height={size} draggable={false} className="h-full w-full object-cover" />
    </div>
  );
}

/** Popup / tooltip wording — always "Reporter", never "Patient". */
export function reporterLabel(reporterSex: string | null | undefined, isGuest: boolean | null | undefined): string {
  if (isGuest) return 'Guest report';
  if (reporterSex === 'MALE') return 'Reporter: Male (registered)';
  if (reporterSex === 'FEMALE') return 'Reporter: Female (registered)';
  if (isGuest === false) return 'Reporter (registered)';
  return 'Reporter';
}
