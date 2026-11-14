import { redirect } from 'next/navigation';

/**
 * MOD-22 — the Real-Time Incident Map now lives in Live Dispatch (one screen for the
 * map and dispatch). Old links and bookmarks land on its Responding list, the
 * closest match to what this page showed: units in the field and their routes.
 */
export default function LiveMapRedirect(): never {
  redirect('/operations/dispatch?tab=responding');
}
