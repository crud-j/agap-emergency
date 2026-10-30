import type { JSX } from 'react';
import type { TransportLeg } from '@agap/shared';
import type { LegChip as LegChipData } from '@/features/map/live-tracking';

/**
 * Route colour per leg (plan §16): the scene leg keeps the existing AGAP green, the
 * hospital leg is purple and drawn dashed, so the two are told apart at a glance.
 */
export const LEG_COLORS: Record<TransportLeg, string> = {
  TO_SCENE: '#0D6053',
  TO_FACILITY: '#7C3AED',
  AT_FACILITY: '#7C3AED',
};

/** "To scene" / "To hospital · {name}" / "At hospital · {name}". `dark` for the ETA pill. */
export function LegChip({ chip, tone = 'light' }: { chip: LegChipData; tone?: 'light' | 'dark' }): JSX.Element {
  const color = LEG_COLORS[chip.leg];
  return (
    <span
      className={`inline-flex max-w-[260px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        tone === 'dark' ? 'text-white' : ''
      }`}
      style={{
        borderColor: `${color}66`,
        background: tone === 'dark' ? `${color}55` : `${color}14`,
        ...(tone === 'light' && { color }),
      }}
      title={chip.label}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: chip.leg === 'TO_SCENE' ? color : 'transparent', border: `1.5px solid ${tone === 'dark' ? '#fff' : color}` }}
        aria-hidden
      />
      <span className="truncate">{chip.label}</span>
    </span>
  );
}
