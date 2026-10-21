import type { JSX } from 'react';
import { isWestbound } from '@agap/shared';
import { AMBULANCE_ICON_URL } from '@/lib/map-icons';
import { titleCase } from '@/lib/incident-format';

interface AmbulanceMarkerProps {
  heading: number | null;
  /** No update for 60 s+: greyed with a "signal lost" badge (never hides the unit). */
  signalLost: boolean;
  /** The unit being tracked for the selected incident. */
  tracked?: boolean;
  callSign?: string | null;
  resourceType?: string | null;
  /** Call-sign label under the marker — the map shows it from zoom 14 up. */
  showLabel?: boolean;
  /** Tooltip text, e.g. "ALPHA-1 · last update 12 s ago". */
  title?: string;
}

const SIZE = 36;

/**
 * Responder unit marker (WP5 / G5). The artwork is a side view facing right, so
 * it is mirrored while heading west instead of rotated (rotating would turn it
 * upside-down); a small chevron on the ring shows the precise heading.
 * Non-ambulance units (boat, fire truck) use the same icon with their type in
 * the label so they are never mistaken for an ambulance.
 */
export function AmbulanceMarker({
  heading, signalLost, tracked = false, callSign, resourceType, showLabel = false, title,
}: AmbulanceMarkerProps): JSX.Element {
  const ring = signalLost ? '#9CA3AF' : '#0D6053';
  const typeSuffix = resourceType && resourceType !== 'AMBULANCE' ? ` · ${titleCase(resourceType)}` : '';

  return (
    <div className="relative flex flex-col items-center" title={title} aria-label={title}>
      <div
        className="relative flex items-center justify-center rounded-full bg-white"
        style={{
          width: SIZE,
          height: SIZE,
          border: `2px solid ${ring}`,
          boxShadow: tracked
            ? `0 0 0 4px rgba(13,96,83,0.25), 0 2px 6px rgba(0,0,0,0.3)`
            : '0 2px 6px rgba(0,0,0,0.3)',
          opacity: signalLost ? 0.7 : 1,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static marker icon inside a map overlay */}
        <img
          src={AMBULANCE_ICON_URL}
          alt=""
          width={26}
          height={26}
          draggable={false}
          style={{
            transform: isWestbound(heading) ? 'scaleX(-1)' : undefined,
            filter: signalLost ? 'grayscale(1)' : undefined,
          }}
        />
        {heading != null && Number.isFinite(heading) && !signalLost && (
          // Rotating wrapper the size of the marker; the chevron sits on its top edge.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ transform: `rotate(${heading}deg)` }}
          >
            <span
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                top: -7,
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderBottom: `7px solid ${ring}`,
              }}
            />
          </span>
        )}
        {signalLost && (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1 text-[8px] font-bold uppercase leading-[14px] text-white shadow">
            Lost
          </span>
        )}
      </div>
      {showLabel && callSign && (
        <span className="mt-0.5 whitespace-nowrap rounded bg-white/95 px-1 text-[10px] font-bold text-[#1C2B3A] shadow-sm">
          {callSign}{typeSuffix}
        </span>
      )}
    </div>
  );
}
