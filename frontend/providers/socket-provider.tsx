'use client';

import { useEffect, type JSX, type ReactNode } from 'react';
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

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    connectSocket(token);
    joinOps();

    // ─── incident.status_changed ─────────────────────────────────────────────
    // Update status in-place on every cached incident list and detail so
    // dispatch queue, incident drawer, and command queue all react instantly.
    const offStatus = onIncidentEvent<IncidentStatusChangedPayload>(
      'incident.status_changed',
      (payload) => {
        const { incidentId, newStatus } = payload;

        // Update all cached incident lists (any queryKey starting with 'incidents')
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

        // Update detail caches — both the canonical key and the dispatch page key
        const patchStatus = (old: unknown) =>
          old && typeof old === 'object' ? { ...(old as object), status: newStatus } : old;
        qc.setQueryData(['incident', incidentId], patchStatus);
        qc.setQueryData(['dispatch-incident', incidentId], patchStatus);

        // dispatch-incidents (flat array used by the dispatch page)
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

        // Refresh the map's incident-location layer so resolved/closed markers
        // drop off and status-dependent styling stays current (MOD-22).
        qc.invalidateQueries({ queryKey: ['incident-locations'] });
      },
    );

    // ─── incident.created ────────────────────────────────────────────────────
    // We don't have all fields, so invalidate to let the list refetch.
    const offCreated = onIncidentEvent<IncidentCreatedPayload>(
      'incident.created',
      () => {
        qc.invalidateQueries({ queryKey: ['incidents'] });
        qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
        qc.invalidateQueries({ queryKey: ['incident-locations'] });
      },
    );

    // ─── incident.updated ────────────────────────────────────────────────────
    const offUpdated = onIncidentEvent<{ incidentId: string }>(
      'incident.updated',
      ({ incidentId }) => {
        qc.invalidateQueries({ queryKey: ['incident', incidentId] });
        qc.invalidateQueries({ queryKey: ['dispatch-incident', incidentId] });
      },
    );

    // ─── incident.assessment_updated (MOD-37) ─────────────────────────────────
    // A responder submitted an on-scene assessment — refresh the detail so the
    // ops Drawer shows it live.
    const offAssessment = onIncidentEvent<{ incidentId: string }>(
      'incident.assessment_updated',
      ({ incidentId }) => {
        qc.invalidateQueries({ queryKey: ['incident', incidentId] });
        qc.invalidateQueries({ queryKey: ['dispatch-incident', incidentId] });
        qc.invalidateQueries({ queryKey: ['incidents'] });
      },
    );

    // ─── dispatch.created ────────────────────────────────────────────────────
    const offDispatchCreated = onIncidentEvent<DispatchCreatedPayload>(
      'dispatch.created',
      (payload) => {
        qc.invalidateQueries({ queryKey: ['dispatches'] });
        qc.invalidateQueries({ queryKey: ['available-units'] });
        qc.invalidateQueries({ queryKey: ['incident', payload.incidentId] });
        qc.invalidateQueries({ queryKey: ['dispatch-incident', payload.incidentId] });
        qc.invalidateQueries({ queryKey: ['incidents'] });
        qc.invalidateQueries({ queryKey: ['dispatch-incidents'] });
      },
    );

    // ─── dispatch.cancelled ──────────────────────────────────────────────────
    const offDispatchCancelled = onIncidentEvent<DispatchCancelledPayload>(
      'dispatch.cancelled',
      (payload) => {
        qc.invalidateQueries({ queryKey: ['dispatches'] });
        qc.invalidateQueries({ queryKey: ['available-units'] });
        qc.invalidateQueries({ queryKey: ['incident', payload.incidentId] });
        qc.invalidateQueries({ queryKey: ['dispatch-incident', payload.incidentId] });
      },
    );

    // ─── escalation.created / updated ────────────────────────────────────────
    const offEscCreated = onIncidentEvent<EscalationPayload>(
      'escalation.created',
      () => qc.invalidateQueries({ queryKey: ['escalations'] }),
    );
    const offEscUpdated = onIncidentEvent<EscalationPayload>(
      'escalation.updated',
      () => qc.invalidateQueries({ queryKey: ['escalations'] }),
    );

    // ─── responder.location_updated ──────────────────────────────────────────
    // Patch the live-responders array in-place; the map updates within the
    // next render cycle without a round-trip to the server.
    const offResponderLoc = onIncidentEvent<ResponderLocationUpdatedPayload>(
      'responder.location_updated',
      (payload) => {
        qc.setQueryData<LiveResponderPosition[]>(['live-responders'], (old) => {
          const patch = {
            responderId: payload.responderId,
            lat: payload.lat,
            lng: payload.lng,
            heading: payload.heading ?? null,
            speed: payload.speed ?? null,
            updated_at: payload.updatedAt,
          } as Partial<LiveResponderPosition>;

          if (!old) return [patch as LiveResponderPosition];
          const idx = old.findIndex((r) => r.responderId === payload.responderId);
          if (idx === -1) return [...old, patch as LiveResponderPosition];
          return old.map((r, i) => (i === idx ? { ...r, ...patch } : r));
        });
      },
    );

    // ─── responder.status_changed ────────────────────────────────────────────
    const offResponderStatus = onIncidentEvent<ResponderStatusChangedPayload>(
      'responder.status_changed',
      () => {
        qc.invalidateQueries({ queryKey: ['responders'] });
        qc.invalidateQueries({ queryKey: ['available-units'] });
      },
    );

    // ─── announcement.published ──────────────────────────────────────────────
    const offAnnouncement = onIncidentEvent<AnnouncementPublishedPayload>(
      'announcement.published',
      () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    );

    // ─── resource.status_changed (MOD-28) ────────────────────────────────────
    // Patch resource status in-place on the fleet board and resource registry
    // so the availability board reflects operational status changes within ~1s.
    const offResourceStatus = onIncidentEvent<ResourceStatusChangedPayload>(
      'resource.status_changed',
      ({ resourceId, newStatus }) => {
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
    };
  }, [qc]);

  return <>{children}</>;
}
