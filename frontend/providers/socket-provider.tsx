'use client';

import { useEffect, useRef, startTransition, type JSX, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@agap/shared';
import { connectSocket, joinOps, onIncidentEvent } from '@/lib/websocket';
import { getToken } from '@/lib/auth';
import type {
  IncidentStatusChangedPayload,
  IncidentCreatedPayload,
  DispatchCreatedPayload,
  DispatchCancelledPayload,
  EscalationPayload,
  ResponderLocationUpdatedPayload,
  ResponderStatusChangedPayload,
  AnnouncementPublishedPayload,
} from '@agap/shared';
import type { IncidentListItem } from '@/features/incidents/api';
import type { LiveResponderPosition } from '@/features/map/api';
import type { Resource, FleetItem } from '@/features/resources/api';

interface ResourceStatusChangedPayload {
  resourceId: string;
  newStatus: string;
  previousStatus?: string;
}

interface SocketProviderProps {
  children: ReactNode;
}

/**
 * Connects to the AGAP WebSocket gateway on mount (if authenticated),
 * joins the ops:all room, and keeps the TanStack Query cache in sync
 * with server-sent events — so the UI reflects state changes within ~1s
 * without any manual refresh.
 *
 * Only one connection is made per session; the singleton is in lib/websocket.ts.
 */
export function SocketProvider({ children }: SocketProviderProps): JSX.Element {
  const qc = useQueryClient();
  // Buffer for responder location updates — flushed at most every 200ms so
  // rapid GPS events don't cause a render per position fix.
  const locBufferRef = useRef<Map<string, ResponderLocationUpdatedPayload>>(new Map());
  const locFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    connectSocket(token);
    joinOps();

    // ─── incident.status_changed ─────────────────────────────────────────────
    // Update status in-place on every cached incident list and detail so
    // dispatch queue, incident drawer, and command queue all react instantly.
    // Wrapped in startTransition: updating stale server state is non-urgent vs.
    // user interactions like clicking a dispatch button.
    const offStatus = onIncidentEvent<IncidentStatusChangedPayload>(
      'incident.status_changed',
      (payload) => {
        const { incidentId, newStatus } = payload;
        startTransition(() => {
          qc.setQueriesData<{ data: IncidentListItem[] } | IncidentListItem[]>(
            { queryKey: ['incidents'], exact: false },
            (old) => {
              if (!old) return old;
              const list: IncidentListItem[] = Array.isArray(old) ? old : (old as { data: IncidentListItem[] }).data ?? [];
              const updated = list.map((inc) =>
                inc.id === incidentId ? { ...inc, status: newStatus } : inc,
              );
              return Array.isArray(old) ? updated : { ...(old as object), data: updated };
            },
          );

          const patchStatus = (old: unknown) =>
            old && typeof old === 'object' ? { ...(old as object), status: newStatus } : old;
          qc.setQueryData(['incident', incidentId], patchStatus);
          qc.setQueryData(['dispatch-incident', incidentId], patchStatus);

          qc.setQueriesData<{ data: IncidentListItem[] }>(
            { queryKey: ['dispatch-incidents'], exact: false },
            (old) => {
              if (!old) return old;
              const updated = (old.data ?? []).map((inc) =>
                inc.id === incidentId ? { ...inc, status: newStatus } : inc,
              );
              return { ...old, data: updated };
            },
          );

          qc.invalidateQueries({ queryKey: ['incident-locations'] });
        });
      },
    );

    // ─── incident.created ────────────────────────────────────────────────────
    const offCreated = onIncidentEvent<IncidentCreatedPayload>(
      'incident.created',
      () => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['incidents'] });
          qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
          qc.invalidateQueries({ queryKey: ['incident-locations'] });
        });
      },
    );

    // ─── incident.updated ────────────────────────────────────────────────────
    const offUpdated = onIncidentEvent<{ incidentId: string }>(
      'incident.updated',
      ({ incidentId }) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['incident', incidentId] });
          qc.invalidateQueries({ queryKey: ['dispatch-incident', incidentId] });
        });
      },
    );

    // ─── incident.assessment_updated (MOD-37) ─────────────────────────────────
    const offAssessment = onIncidentEvent<{ incidentId: string }>(
      'incident.assessment_updated',
      ({ incidentId }) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['incident', incidentId] });
          qc.invalidateQueries({ queryKey: ['dispatch-incident', incidentId] });
          qc.invalidateQueries({ queryKey: ['incidents'] });
        });
      },
    );

    // ─── dispatch.created ────────────────────────────────────────────────────
    const offDispatchCreated = onIncidentEvent<DispatchCreatedPayload>(
      'dispatch.created',
      (payload) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['dispatches'] });
          qc.invalidateQueries({ queryKey: ['available-units'] });
          qc.invalidateQueries({ queryKey: ['incident', payload.incidentId] });
          qc.invalidateQueries({ queryKey: ['dispatch-incident', payload.incidentId] });
          qc.invalidateQueries({ queryKey: ['incidents'] });
          qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
        });
      },
    );

    // ─── dispatch.cancelled ──────────────────────────────────────────────────
    const offDispatchCancelled = onIncidentEvent<DispatchCancelledPayload>(
      'dispatch.cancelled',
      (payload) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['dispatches'] });
          qc.invalidateQueries({ queryKey: ['available-units'] });
          qc.invalidateQueries({ queryKey: ['incident', payload.incidentId] });
          qc.invalidateQueries({ queryKey: ['dispatch-incident', payload.incidentId] });
        });
      },
    );

    // ─── escalation.created / updated ────────────────────────────────────────
    const offEscCreated = onIncidentEvent<EscalationPayload>(
      'escalation.created',
      () => startTransition(() => qc.invalidateQueries({ queryKey: ['escalations'] })),
    );
    const offEscUpdated = onIncidentEvent<EscalationPayload>(
      'escalation.updated',
      () => startTransition(() => qc.invalidateQueries({ queryKey: ['escalations'] })),
    );

    // ─── responder.location_updated ──────────────────────────────────────────
    // GPS events can arrive multiple times per second per responder. Buffer the
    // payloads and flush at most every 200ms so the map re-renders at ~5fps
    // instead of on every socket message.
    const offResponderLoc = onIncidentEvent<ResponderLocationUpdatedPayload>(
      'responder.location_updated',
      (payload) => {
        locBufferRef.current.set(payload.responderId, payload);
        if (!locFlushTimerRef.current) {
          locFlushTimerRef.current = setTimeout(() => {
            const buffer = locBufferRef.current;
            locFlushTimerRef.current = null;
            locBufferRef.current = new Map();

            startTransition(() => {
              qc.setQueryData<LiveResponderPosition[]>(['live-responders'], (old) => {
                let next = old ? [...old] : [];
                buffer.forEach((p) => {
                  const patch: LiveResponderPosition = {
                    responderId: p.responderId,
                    lat: p.lat,
                    lng: p.lng,
                    heading: p.heading ?? null,
                    speed: p.speed ?? null,
                    updated_at: p.updatedAt,
                  } as LiveResponderPosition;
                  const idx = next.findIndex((r) => r.responderId === p.responderId);
                  if (idx === -1) next = [...next, patch];
                  else next = next.map((r, i) => (i === idx ? { ...r, ...patch } : r));
                });
                return next;
              });
            });
          }, 200);
        }
      },
    );

    // ─── responder.status_changed ────────────────────────────────────────────
    const offResponderStatus = onIncidentEvent<ResponderStatusChangedPayload>(
      'responder.status_changed',
      () => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['responders'] });
          qc.invalidateQueries({ queryKey: ['available-units'] });
        });
      },
    );

    // ─── announcement.published ──────────────────────────────────────────────
    const offAnnouncement = onIncidentEvent<AnnouncementPublishedPayload>(
      'announcement.published',
      () => startTransition(() => qc.invalidateQueries({ queryKey: ['announcements'] })),
    );

    // ─── resource.status_changed (MOD-28) ────────────────────────────────────
    const offResourceStatus = onIncidentEvent<ResourceStatusChangedPayload>(
      'resource.status_changed',
      ({ resourceId, newStatus }) => {
        startTransition(() => {
          const patchStatus = <T extends { id: string; status: string }>(list: T[]): T[] =>
            list.map((r) => (r.id === resourceId ? { ...r, status: newStatus } : r));

          qc.setQueriesData<PaginatedResult<Resource> | Resource[]>(
            { queryKey: ['resources'], exact: false },
            (old) => {
              if (!old) return old;
              if (Array.isArray(old)) return patchStatus(old);
              return { ...old, data: patchStatus(old.data) };
            },
          );

          qc.setQueriesData<PaginatedResult<FleetItem> | FleetItem[]>(
            { queryKey: ['fleet'], exact: false },
            (old) => {
              if (!old) return old;
              if (Array.isArray(old)) return patchStatus(old);
              return { ...old, data: patchStatus(old.data) };
            },
          );

          qc.invalidateQueries({ queryKey: ['available-units'] });
        });
      },
    );

    return () => {
      offStatus();
      offCreated();
      offUpdated();
      offAssessment();
      offDispatchCreated();
      offDispatchCancelled();
      offEscCreated();
      offEscUpdated();
      offResponderLoc();
      offResponderStatus();
      offAnnouncement();
      offResourceStatus();
      if (locFlushTimerRef.current) {
        clearTimeout(locFlushTimerRef.current);
        locFlushTimerRef.current = null;
      }
    };
  }, [qc]);

  return <>{children}</>;
}
