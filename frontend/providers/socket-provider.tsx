'use client';

import { useEffect, useRef, useSyncExternalStore, startTransition, type JSX, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PaginatedResult } from '@agap/shared';
import { connectSocket, disconnectSocket, joinOps, onIncidentEvent } from '@/lib/websocket';
import { getToken, subscribeSession } from '@/lib/auth';
import type {
  IncidentStatusChangedPayload,
  IncidentCreatedPayload,
  DispatchCreatedPayload,
  DispatchCancelledPayload,
  DispatchUpdatedPayload,
  EscalationPayload,
  ResponderLocationUpdatedPayload,
  ResponderEtaUpdatedPayload,
  ResponderStatusChangedPayload,
  AnnouncementPublishedPayload,
} from '@agap/shared';
import type { IncidentListItem } from '@/features/incidents/api';
import type { LatestUnitPosition, LiveResponderPosition } from '@/features/map/api';
import { applyEtaUpdate, mergeResponderLocations } from '@/features/map/live-tracking';
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
  // Debounces the REST re-seed when the socket reports a unit not yet cached.
  const seedRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The access token is in memory and only exists once the session is restored or
  // signed in, so connect when a session appears and disconnect when it ends.
  const signedIn = useSyncExternalStore(subscribeSession, () => !!getToken(), () => false);

  useEffect(() => {
    if (!signedIn) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket();
    const leaveOps = joinOps();

    // ─── reconnect: catch up ─────────────────────────────────────────────────
    // Events sent while the socket was down are lost, so after a reconnect refetch
    // whatever is on screen (active queries only) instead of showing stale state
    // until the next manual reload.
    let connects = socket.connected ? 1 : 0;
    const onConnect = () => {
      if (connects++ === 0) return;
      startTransition(() => {
        void qc.invalidateQueries();
      });
    };
    socket.on('connect', onConnect);

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
          // The patch above flips the chip instantly; the refetch brings the new
          // timeline event (and anything else the transition changed) into the drawer.
          qc.invalidateQueries({ queryKey: ['incident', incidentId] });

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
          qc.invalidateQueries({ queryKey: ['municipal-overview'] });
        });
      },
    );

    // ─── barangay.notice_updated (MOD-17 / MOD-34) ───────────────────────────
    const offBarangay = onIncidentEvent<{ incidentId: string }>(
      'barangay.notice_updated',
      ({ incidentId }) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['incident-barangay', incidentId] });
          qc.invalidateQueries({ queryKey: ['incident', incidentId] });
          qc.invalidateQueries({ queryKey: ['incidents'] });
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
          qc.invalidateQueries({ queryKey: ['municipal-overview'] });
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
    // instead of on every socket message. Rows are one per unit (dispatchId) and
    // keep incident_id / call sign (G2); a unit first seen over the socket
    // triggers a debounced refetch of the REST seed for its name and unit.
    const offResponderLoc = onIncidentEvent<ResponderLocationUpdatedPayload>(
      'responder.location_updated',
      (payload) => {
        locBufferRef.current.set(payload.dispatchId ?? payload.responderId, payload);
        if (!locFlushTimerRef.current) {
          locFlushTimerRef.current = setTimeout(() => {
            const buffer = locBufferRef.current;
            locFlushTimerRef.current = null;
            locBufferRef.current = new Map();

            startTransition(() => {
              let sawUnknown = false;
              qc.setQueryData<LiveResponderPosition[]>(['live-responders'], (old) => {
                const merged = mergeResponderLocations(old, buffer.values());
                sawUnknown = merged.sawUnknown;
                return merged.next;
              });
              if (sawUnknown && !seedRefetchTimerRef.current) {
                seedRefetchTimerRef.current = setTimeout(() => {
                  seedRefetchTimerRef.current = null;
                  qc.invalidateQueries({ queryKey: ['live-responders'] });
                }, 2_000);
              }
            });
          }, 200);
        }
      },
    );

    // ─── responder.eta_updated (MOD-43) ──────────────────────────────────────
    // Routed ETA for one unit — always an estimate. Patched into the incident's
    // unit cache that the dispatch tracking card and ETA pill read.
    const offEta = onIncidentEvent<ResponderEtaUpdatedPayload>(
      'responder.eta_updated',
      (payload) => {
        startTransition(() => {
          qc.setQueryData<LatestUnitPosition[]>(['incident-units', payload.incidentId], (old) =>
            applyEtaUpdate(old, payload),
          );
        });
      },
    );

    // ─── dispatch.updated (crew accepted / declined) ─────────────────────────
    const offDispatchUpdated = onIncidentEvent<DispatchUpdatedPayload>(
      'dispatch.updated',
      ({ incidentId }) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['incident', incidentId] });
          qc.invalidateQueries({ queryKey: ['dispatch-incident', incidentId] });
          qc.invalidateQueries({ queryKey: ['incident-dispatches', incidentId] });
          qc.invalidateQueries({ queryKey: ['incident-units', incidentId] });
          qc.invalidateQueries({ queryKey: ['live-responders'] });
          qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
          qc.invalidateQueries({ queryKey: ['available-units'] });
        });
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
      leaveOps();
      socket.off('connect', onConnect);
      offStatus();
      offCreated();
      offBarangay();
      offUpdated();
      offAssessment();
      offDispatchCreated();
      offDispatchCancelled();
      offEscCreated();
      offEscUpdated();
      offResponderLoc();
      offEta();
      offDispatchUpdated();
      offResponderStatus();
      offAnnouncement();
      offResourceStatus();
      if (locFlushTimerRef.current) {
        clearTimeout(locFlushTimerRef.current);
        locFlushTimerRef.current = null;
      }
      if (seedRefetchTimerRef.current) {
        clearTimeout(seedRefetchTimerRef.current);
        seedRefetchTimerRef.current = null;
      }
    };
  }, [qc, signedIn]);

  return <>{children}</>;
}
