import type { JSX } from 'react';
import { Hospital } from 'lucide-react';

interface HospitalMarkerProps {
  /** A verified location gets the solid ring; anything else is dashed grey. */
  verified: boolean;
  /** The hospital being edited or the transport destination. */
  selected?: boolean;
  /** Name label under the marker. */
  label?: string | null;
  /** Tooltip text, e.g. "DOH — Joni Villanueva General Hospital · Verified". */
  title?: string;
}

const SIZE = 32;
const RING = '#D44858';

/**
 * Receiving facility marker (MOD-39). Same language as AmbulanceMarker: a white
 * disc with a coloured ring and an icon. An unverified location is drawn dashed
 * and grey so nobody mistakes it for a confirmed ambulance target.
 */
export function HospitalMarker({ verified, selected = false, label, title }: HospitalMarkerProps): JSX.Element {
  const ring = verified ? RING : '#9CA3AF';

  return (
    <div className="relative flex flex-col items-center" title={title} aria-label={title}>
      <div
        className="flex items-center justify-center rounded-full bg-white"
        style={{
          width: SIZE,
          height: SIZE,
          border: `2px ${verified ? 'solid' : 'dashed'} ${ring}`,
          boxShadow: selected
            ? '0 0 0 4px rgba(212,72,88,0.25), 0 2px 6px rgba(0,0,0,0.3)'
            : '0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        <Hospital size={18} color={ring} aria-hidden />
      </div>
      {label && (
        <span className="mt-0.5 max-w-[160px] truncate whitespace-nowrap rounded bg-white/95 px-1 text-[10px] font-bold text-[#1C2B3A] shadow-sm">
          {label}
        </span>
      )}
    </div>
  );
}
