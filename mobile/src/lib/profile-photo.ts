import type { SafeUser } from '../services/api/auth.api';

/**
 * When the profile picture can next be changed, as an ISO string, or null when it can
 * be changed now. The server decides (profile_photo_next_change_at) and enforces it;
 * this only re-checks the clock so a lock that has since run out isn't shown.
 */
export function photoLockedUntil(
  user: Pick<SafeUser, 'profile_photo_next_change_at'> | null | undefined,
  now: Date = new Date(),
): string | null {
  const next = user?.profile_photo_next_change_at;
  if (!next) return null;
  const at = new Date(next);
  return !isNaN(at.getTime()) && at > now ? next : null;
}

/** "April 11, 2027" / "Abril 11, 2027", in Philippine time. */
export function formatPhotoDate(iso: string, language: 'en' | 'fil'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString(language === 'fil' ? 'fil-PH' : 'en-PH', {
      month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
