import { useEffect, useState } from 'react';
import { fetchReporterPhotoDataUri } from '../services/api/incidents.api';

// One download per incident while the app runs, shared by the map and the assignment card.
// In memory only: it is someone's face, so it is never written to disk.
const photos = new Map<string, Promise<string | null>>();

function load(incidentId: string): Promise<string | null> {
  let request = photos.get(incidentId);
  if (!request) {
    request = fetchReporterPhotoDataUri(incidentId).catch(() => {
      // Offline or server error: show the plain pin now, try again on the next mount.
      photos.delete(incidentId);
      return null;
    });
    photos.set(incidentId, request);
  }
  return request;
}

/**
 * The REPORTER's consented profile photo for a responder's incident, as a displayable URI;
 * null while loading, offline, or when it may not be shown. `available` is the incident's
 * `reporter_has_photo`: when it turns false (consent withdrawn, incident ended) the cached
 * photo is dropped at once. A failed download never blocks the map or the assignment.
 */
export function useReporterPhotoUri(
  incidentId: string | null | undefined,
  available: boolean | null | undefined,
): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!incidentId) return;
    if (!available) {
      photos.delete(incidentId);
      setUri(null);
      return;
    }
    let cancelled = false;
    void load(incidentId).then((loaded) => {
      if (!cancelled) setUri(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [incidentId, available]);

  return incidentId && available ? uri : null;
}
