import {
  RESCUE_PART_COUNTS,
  haversineMeters,
  type RescueAccess,
  type RescueTakenTo,
  type WaterLevel,
} from '@agap/shared';
import type { EvacuationCenter, RescueSummary, RescueTrip, RescueTripBody } from '@/src/services/api/rescue-trips.api';

/** The rescue trip form (plan Phase 4, D2). null = not answered; every field is optional. */
export interface RescueTripForm {
  rescuedCount: number | null;
  families: number | null;
  children: number | null;
  elderly: number | null;
  pwd: number | null;
  pregnant: number | null;
  stillWaiting: number | null;
  waterLevel: WaterLevel | null;
  access: RescueAccess | null;
  takenTo: RescueTakenTo | null;
  takenToFacilityId: string | null;
  takenToOther: string;
  notes: string;
}

export const EMPTY_RESCUE_TRIP_FORM: RescueTripForm = {
  rescuedCount: null,
  families: null,
  children: null,
  elderly: null,
  pwd: null,
  pregnant: null,
  stillWaiting: null,
  waterLevel: null,
  access: null,
  takenTo: null,
  takenToFacilityId: null,
  takenToOther: '',
  notes: '',
};

/**
 * Each trip is new, so its counts start empty. The water level, access and where the
 * last trip went usually stay the same from trip to trip, so they carry over.
 */
export function formFromLatestTrip(latest: RescueTrip | null | undefined): RescueTripForm {
  if (!latest) return EMPTY_RESCUE_TRIP_FORM;
  const sameCenter = latest.taken_to === 'EVACUATION_CENTER' && latest.taken_to_facility_id;
  return {
    ...EMPTY_RESCUE_TRIP_FORM,
    waterLevel: latest.water_level,
    access: latest.access,
    takenTo: sameCenter ? 'EVACUATION_CENTER' : null,
    takenToFacilityId: sameCenter ? latest.taken_to_facility_id : null,
  };
}

/** People rescued changed: no part (children, elderly, …) can be more than it (D2). */
export function withRescuedCount(form: RescueTripForm, rescuedCount: number | null): RescueTripForm {
  const next = { ...form, rescuedCount };
  if (rescuedCount == null) return next;
  for (const part of RESCUE_PART_COUNTS) {
    const value = next[part];
    if (value != null && value > rescuedCount) next[part] = rescuedCount;
  }
  return next;
}

/** The most a part count can be: the people rescued, when given. */
export function partMax(form: RescueTripForm): number {
  return form.rescuedCount ?? 500;
}

/** Taken to an evacuation center, but which one isn't chosen yet: the server would refuse it. */
export function needsCenter(form: RescueTripForm): boolean {
  return form.takenTo === 'EVACUATION_CENTER' && !form.takenToFacilityId;
}

/** The request body: only what was answered, so an empty form sends `{}`. */
export function buildRescueTripBody(form: RescueTripForm): RescueTripBody {
  const body: RescueTripBody = {};
  if (form.rescuedCount != null) body.rescuedCount = form.rescuedCount;
  for (const part of RESCUE_PART_COUNTS) {
    const value = form[part];
    if (value != null) body[part] = value;
  }
  if (form.stillWaiting != null) body.stillWaiting = form.stillWaiting;
  if (form.waterLevel) body.waterLevel = form.waterLevel;
  if (form.access) body.access = form.access;
  if (form.takenTo) body.takenTo = form.takenTo;
  if (form.takenTo === 'EVACUATION_CENTER' && form.takenToFacilityId) body.takenToFacilityId = form.takenToFacilityId;
  const other = form.takenToOther.trim();
  if (form.takenTo === 'OTHER' && other) body.takenToOther = other;
  const notes = form.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

/** Evacuation centers, nearest to the scene first; centers without coordinates last, by name. */
export function nearestCenters(
  centers: readonly EvacuationCenter[],
  scene: { lat: number; lng: number } | null,
): Array<EvacuationCenter & { distanceMeters: number | null }> {
  const withDistance = centers.map((c) => {
    const lat = c.latitude != null ? Number(c.latitude) : NaN;
    const lng = c.longitude != null ? Number(c.longitude) : NaN;
    const distanceMeters = scene && Number.isFinite(lat) && Number.isFinite(lng)
      ? haversineMeters(scene.lat, scene.lng, lat, lng)
      : null;
    return { ...c, distanceMeters };
  });
  return withDistance.sort((a, b) => {
    if (a.distanceMeters == null || b.distanceMeters == null) {
      if (a.distanceMeters != null) return -1;
      if (b.distanceMeters != null) return 1;
      return a.name.localeCompare(b.name);
    }
    return a.distanceMeters - b.distanceMeters;
  });
}

/** One line for the assignment screen, e.g. "12 rescued · ~5 waiting". */
export function rescueSummaryLine(summary: Pick<RescueSummary, 'tripCount' | 'rescued' | 'stillWaiting'>): string {
  if (summary.tripCount === 0) return 'No trips logged yet';
  const parts = [`${summary.rescued} rescued`, `${summary.tripCount} trip${summary.tripCount === 1 ? '' : 's'}`];
  if (summary.stillWaiting != null) parts.push(summary.stillWaiting > 0 ? `~${summary.stillWaiting} waiting` : 'none waiting');
  return parts.join(' · ');
}

/**
 * Finish on a rescue unit (plan Phase 4): ask first when the last estimate says people
 * are still waiting. Only a warning: Finish is never blocked.
 */
export function withRescueFinishWarning(
  confirm: { title: string; message: string } | undefined,
  stillWaiting: number | null | undefined,
): { title: string; message: string } | undefined {
  if (!stillWaiting || stillWaiting <= 0) return confirm;
  const warning = `About ${stillWaiting} people are still waiting here. Dispatch will be told when you finish.`;
  return {
    title: confirm?.title ?? 'Finish?',
    message: confirm ? `${warning} ${confirm.message}` : warning,
  };
}
