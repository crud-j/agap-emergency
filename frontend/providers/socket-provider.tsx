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
  ResponderRouteUpdatedPayload,
  ResponderStatusChangedPayload,
  AnnouncementPublishedPayload,
  IncidentTransportUpdatedPayload,
  SurgeRecommendedPayload,
  SurgeTriageTagUpdatedPayload,
} from '@agap/shared';
import type { IncidentListItem, IncidentTransport } from '@/features/incidents/api';
import type { LatestUnitPosition, LiveResponderPosition } from '@/features/map/api';
import {
  applyEtaUpdate, applyRouteUpdate, applyTransportUpdate, mergeResponderLocations, transportUpdateNotices,
} from '@/features/map/live-tracking';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
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
  // Live transport notices ("Destination changed: A → B", hospital warnings).
  const { toasts, toast, dismiss } = useToast();
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
          qc.invalidateQueries({ queryKey: ['oversight'] });
          qc.invalidateQueries({ queryKey: ['dispatch-summary'] });
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

    // ─── surge.* (MOD-52) ────────────────────────────────────────────────────
    // A recommendation also writes each Supervisor's in-app notice: refresh it so the
    // surge page banner and the bell show it. Triage tags: the board refetches live
    // (its refetchInterval stays as the fallback).
    const offSurgeRecommended = onIncidentEvent<SurgeRecommendedPayload>('surge.recommended', () => {
      startTransition(() => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
      });
    });
    const offTriageTag = onIncidentEvent<SurgeTriageTagUpdatedPayload>('surge.triage_tag_updated', () => {
      startTransition(() => {
        qc.invalidateQueries({ queryKey: ['surge-triage'] });
        qc.invalidateQueries({ queryKey: ['surge-state'] });
      });
    });

    // ─── incident.created ────────────────────────────────────────────────────
    const offCreated = onIncidentEvent<IncidentCreatedPayload>(
      'incident.created',
      () => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['incidents'] });
          qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
          qc.invalidateQueries({ queryKey: ['incident-locations'] });
          qc.invalidateQueries({ queryKey: ['municipal-overview'] });
          qc.invalidateQueries({ queryKey: ['oversight'] });
          qc.invalidateQueries({ queryKey: ['dispatch-summary'] });
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

    const offTransporting = onIncidentEvent<{ incidentId: string }>(
      'incident.transporting',
      ({ incidentId }) => {
        qc.invalidateQueries({ queryKey: ['incident-transports', incidentId] });
        qc.invalidateQueries({ queryKey: ['incident', incidentId] });
      },
    );
    const offFacilityArrival = onIncidentEvent<{ incidentId: string }>(
      'incident.facility_arrival',
      ({ incidentId }) => {
        qc.invalidateQueries({ queryKey: ['incident-transports', incidentId] });
        qc.invalidateQueries({ queryKey: ['incident', incidentId] });
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
          qc.invalidateQueries({ queryKey: ['oversight'] });
          qc.invalidateQueries({ queryKey: ['dispatch-summary'] });
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
          qc.invalidateQueries({ queryKey: ['oversight'] });
          qc.invalidateQueries({ queryKey: ['dispatch-summary'] });
        });
      },
    );

    // ─── escalation.created / updated ────────────────────────────────────────
    const refreshEscalations = () =>
      startTransition(() => {
        qc.invalidateQueries({ queryKey: ['escalations'] });
        qc.invalidateQueries({ queryKey: ['oversight', 'summary'] });
      });
    const offEscCreated = onIncidentEvent<EscalationPayload>('escalation.created', refreshEscalations);
    const offEscUpdated = onIncidentEvent<EscalationPayload>('escalation.updated', refreshEscalations);

    // ─── incident.handover (MOD-44: created or acknowledged) ─────────────────
    const offHandover = onIncidentEvent<{ incidentId: string }>(
      'incident.handover',
      ({ incidentId }) => {
        startTransition(() => {
          qc.invalidateQueries({ queryKey: ['handovers', incidentId] });
          qc.invalidateQueries({ queryKey: ['oversight', 'handovers'] });
        });
      },
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

    // ─── responder.route_updated (MOD-43) ────────────────────────────────────
    // The server route for the unit's current leg (scene or hospital). Patched into
    // the same unit cache, so the map redraws the line and its leg styling live.
    const offRoute = onIncidentEvent<ResponderRouteUpdatedPayload>(
      'responder.route_updated',
      (payload) => {
        startTransition(() => {
          qc.setQueryData<LatestUnitPosition[]>(['incident-units', payload.incidentId], (old) =>
            applyRouteUpdate(old, payload),
          );
        });
      },
    );

    // ─── incident.transport_updated (MOD-40) ─────────────────────────────────
    // The destination of a transport changed (or its hospital moved / was
    // deactivated). The toast reads the old hospital before the cache is patched.
    const offTransportUpdated = onIncidentEvent<IncidentTransportUpdatedPayload>(
      'incident.transport_updated',
      (payload) => {
        const unitsKey = ['incident-units', payload.incidentId];
        const notices = transportUpdateNotices(payload, {
          units: qc.getQueryData<LatestUnitPosition[]>(unitsKey),
          transports: qc.getQueryData<IncidentTransport[]>(['incident-transports', payload.incidentId]),
        });
        for (const notice of notices) {
          toast({ ...notice, duration: notice.variant === 'warning' ? 10_000 : 6_000 });
        }
        startTransition(() => {
          qc.setQueryData<LatestUnitPosition[]>(unitsKey, (old) => applyTransportUpdate(old, payload));
          qc.invalidateQueries({ queryKey: ['incident-transports', payload.incidentId] });
          // The drawer's destination history reads the incident audit trail.
          qc.invalidateQueries({ queryKey: ['audit-incident', payload.incidentId] });
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
          qc.invalidateQueries({ queryKey: ['oversight'] });
          qc.invalidateQueries({ queryKey: ['dispatch-summary'] });
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
          // Unit counts on the Dispatcher and Supervisor dashboards.
          qc.invalidateQueries({ queryKey: ['dispatch-summary'] });
          qc.invalidateQueries({ queryKey: ['oversight', 'summary'] });
        });
      },
    );

    return () => {
      offTransporting();
      offFacilityArrival();
      leaveOps();
      socket.off('connect', onConnect);
      offStatus();
      offCreated();
      offBarangay();
      offSurgeRecommended();
      offTriageTag();
      offUpdated();
      offAssessment();
      offDispatchCreated();
      offDispatchCancelled();
      offEscCreated();
      offEscUpdated();
      offHandover();
      offResponderLoc();
      offEta();
      offRoute();
      offTransportUpdated();
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
  }, [qc, signedIn, toast]);

  return (
    <>
      {children}
      {toasts.map((t) => (
        <Toast
          key={t.id}
          title={t.title}
          {...(t.description && { description: t.description })}
          {...(t.variant && { variant: t.variant })}
          {...(t.duration !== undefined && { duration: t.duration })}
          onOpenChange={(isOpen) => {
            if (!isOpen) dismiss(t.id);
          }}
        />
      ))}
    </>
  );
}
