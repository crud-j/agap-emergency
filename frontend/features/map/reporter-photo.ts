'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

/**
 * The REPORTER's consented profile photo for an incident (MOD-01 / MOD-22), never the
 * patient's. One download per incident for this browser tab, shared by every map
 * marker and popup; kept in memory only (the server sends `no-store`).
 */
const photos = new Map<string, Promise<string | null>>();

function load(incidentId: string): Promise<string | null> {
  let request = photos.get(incidentId);
  if (!request) {
    request = api
      .blob(`/incidents/${incidentId}/reporter-photo`, getToken())
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => {
        // 404 (consent withdrawn, incident ended) or offline: draw the plain pin, retry later.
        photos.delete(incidentId);
        return null;
      });
    photos.set(incidentId, request);
  }
  return request;
}

/** Drops a photo that may no longer be shown (consent withdrawn or the incident ended). */
function forget(incidentId: string): void {
  const request = photos.get(incidentId);
  if (!request) return;
  photos.delete(incidentId);
  void request.then((url) => {
    if (url) URL.revokeObjectURL(url);
  });
}

/**
 * Object URL of the reporter photo, or null while loading, when there is none, or when it
 * may not be shown. `available` is the incident's `reporter_has_photo`: when it turns false
 * the cached photo is dropped at once. A failed download never blocks the map.
 */
export function useReporterPhotoUrl(incidentId: string, available: boolean | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!available) {
      forget(incidentId);
      setUrl(null);
      return;
    }
    let cancelled = false;
    void load(incidentId).then((loaded) => {
      if (!cancelled) setUrl(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [incidentId, available]);

  return available ? url : null;
}
