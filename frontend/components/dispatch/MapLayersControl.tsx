'use client';

import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { Hospital, Layers, UserRound } from 'lucide-react';
import { LEG_COLORS } from '@/components/map/LegChip';
import { AMBULANCE_ICON_URL } from '@/lib/map-icons';
import { PRIORITY_LABELS, PRIORITY_RING_COLORS } from '@agap/shared';

// Same palette as the scene markers and reporter-icon rings.
const PRIORITIES = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => ({
  label: PRIORITY_LABELS[p],
  color: PRIORITY_RING_COLORS[p],
}));

/**
 * Live Dispatch map options: the optional hospital layer and the legend, folded
 * behind one button so the map stays clear (the old Live Map kept the full legend
 * on screen). Closes on Escape or a click outside.
 */
export function MapLayersControl({
  showHospitals, onShowHospitalsChange,
}: {
  showHospitals: boolean;
  onShowHospitalsChange: (show: boolean) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex h-[34px] items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold shadow-sm backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
          open || showHospitals
            ? 'border-emerald-300 bg-white text-emerald-700'
            : 'border-white/60 bg-white/80 text-slate-700 hover:bg-white'
        }`}
      >
        <Layers size={14} aria-hidden="true" />
        Layers
        {showHospitals && <span className="sr-only">(hospitals shown)</span>}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-[calc(100%+8px)] w-[260px] rounded-2xl border border-slate-200/70 bg-white/95 p-3 shadow-[0_12px_32px_-8px_rgba(15,35,55,0.25)] backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
              <Hospital size={14} className="text-[#D44858]" aria-hidden="true" />
              All verified hospitals
            </span>
            <input
              type="checkbox"
              checked={showHospitals}
              onChange={(e) => onShowHospitalsChange(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
          </label>
          <p className="px-2 pb-2 text-[11px] leading-snug text-slate-500">
            Destination hospitals of units in the field always show.
          </p>

          <div className="border-t border-slate-100 px-2 pt-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Legend</p>
            <ul className="flex flex-col gap-1.5 text-[12px] text-slate-600">
              {PRIORITIES.map((p) => (
                <li key={p.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                  {p.label}
                </li>
              ))}
              <li className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- legend icon */}
                <img src={AMBULANCE_ICON_URL} alt="" width={14} height={14} />
                Unit (grey = signal lost)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded" style={{ background: LEG_COLORS.TO_SCENE }} aria-hidden="true" />
                Route to scene
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 border-t-2 border-dashed" style={{ borderColor: LEG_COLORS.TO_FACILITY }} aria-hidden="true" />
                Route to hospital
              </li>
              <li className="flex items-center gap-2">
                <span className="h-0.5 w-4 rounded opacity-30" style={{ background: LEG_COLORS.TO_SCENE }} aria-hidden="true" />
                Other incidents’ routes (while one is open)
              </li>
              <li className="flex items-center gap-2">
                <Hospital size={13} className="text-[#D44858]" aria-hidden="true" />
                Hospital (dashed grey = location not verified)
              </li>
              <li className="flex items-center gap-2">
                <UserRound size={13} className="rounded-full bg-[#E6F2EF] text-[#0D6053]" aria-hidden="true" />
                Reporter photo (with consent)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-[#3B82F6] bg-[#3B82F6]/20" aria-hidden="true" />
                Flood-prone barangay
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
