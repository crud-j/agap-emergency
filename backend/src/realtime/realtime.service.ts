import { Injectable, Logger } from '@nestjs/common';
import { AgapGateway } from './agap.gateway';
import {
  INCIDENT_EVENTS,
  RESPONDER_EVENTS,
  DISPATCH_EVENTS,
  ESCALATION_EVENTS,
  ANNOUNCEMENT_EVENTS,
  NOTIFICATION_EVENTS,
  IncidentStatus,
} from '@agap/shared';
import type {
  AgapEventName,
  IncidentCreatedPayload,
  IncidentStatusChangedPayload,
  IncidentAssignedPayload,
  IncidentLocationUpdatedPayload,
  IncidentMessagePayload,
  ResponderStatusChangedPayload,
  AnnouncementPublishedPayload,
  NotificationCreatedPayload,
} from '@agap/shared';

/**
 * Lifecycle statuses that also fan out a dedicated event in addition to the
 * generic `incident.status_changed`. Clients can subscribe to the specific name
 * (e.g. a map that only cares about `incident.dispatched`) without filtering the
 * broad stream. Statuses without an entry (RECEIVED, ACKNOWLEDGED, ASSESSED, …)
 * emit `incident.status_changed` only.
 */
const STATUS_SPECIFIC_EVENT: Partial<Record<IncidentStatus, AgapEventName>> = {
  [IncidentStatus.DISPATCHED]: INCIDENT_EVENTS.DISPATCHED,
  [IncidentStatus.EN_ROUTE]: INCIDENT_EVENTS.EN_ROUTE,
  [IncidentStatus.ON_SCENE]: INCIDENT_EVENTS.ARRIVED,
  [IncidentStatus.RESOLVED]: INCIDENT_EVENTS.RESOLVED,
  [IncidentStatus.CLOSED]: INCIDENT_EVENTS.CLOSED,
  [IncidentStatus.CANCELLED]: INCIDENT_EVENTS.CANCELLED,
};

/**
 * Thin façade over AgapGateway. Every method is BEST-EFFORT: a WebSocket failure
 * is logged and swallowed so it can never throw into the calling service (a lost
 * broadcast must never block or modify an incident — WebSocket is distribution
 * only; PostgreSQL is the source of truth).
 *
 * Rooms: `ops:all` (dispatchers/supervisors), `incident:{id}` (owner + assigned
 * responders + dispatchers), `user:{id}` (per-user, e.g. notifications).
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: AgapGateway) {}

  // ── Incident lifecycle ─────────────────────────────────────────────────────

  incidentCreated(payload: IncidentCreatedPayload): void {
    this.safe('incidentCreated', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.CREATED, payload);
      this.gateway.emitToIncident(INCIDENT_EVENTS.CREATED, payload.incidentId, payload);
    });
  }

  incidentUpdated(incidentId: string, payload: Record<string, unknown>): void {
    const envelope = { incidentId, ...payload };
    this.safe('incidentUpdated', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.UPDATED, envelope);
      this.gateway.emitToIncident(INCIDENT_EVENTS.UPDATED, incidentId, envelope);
    });
  }

  statusChanged(payload: IncidentStatusChangedPayload): void {
    this.safe('statusChanged', () => {
      // Always fan out the generic event to the ops dashboard + the incident
      // room (owner + assigned responders). Citizens only ever join their own
      // `incident:{id}` room, so a change on incident A never reaches B.
      this.gateway.emitToOps(INCIDENT_EVENTS.STATUS_CHANGED, payload);
      this.gateway.emitToIncident(INCIDENT_EVENTS.STATUS_CHANGED, payload.incidentId, payload);

      // Plus a dedicated lifecycle event (incident.dispatched/en_route/arrived/
      // resolved/closed/cancelled) for the milestone statuses.
      const specific = STATUS_SPECIFIC_EVENT[payload.newStatus];
      if (specific) {
        this.gateway.emitToOps(specific, payload);
        this.gateway.emitToIncident(specific, payload.incidentId, payload);
      }
    });
  }

  dispatchCreated(
    incidentId: string,
    payload: { dispatchId: string; resourceId: string; status: string },
  ): void {
    const envelope = { incidentId, ...payload };
    this.safe('dispatchCreated', () => {
      this.gateway.emitToOps(DISPATCH_EVENTS.CREATED, envelope);
      this.gateway.emitToIncident(DISPATCH_EVENTS.CREATED, incidentId, envelope);
    });
  }

  incidentAssigned(payload: IncidentAssignedPayload): void {
    this.safe('incidentAssigned', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.ASSIGNED, payload);
      this.gateway.emitToIncident(INCIDENT_EVENTS.ASSIGNED, payload.incidentId, payload);
    });
  }

  incidentLocationUpdated(payload: IncidentLocationUpdatedPayload): void {
    this.safe('incidentLocationUpdated', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.LOCATION_UPDATED, payload);
      this.gateway.emitToIncident(INCIDENT_EVENTS.LOCATION_UPDATED, payload.incidentId, payload);
    });
  }

  assessmentUpdated(incidentId: string, payload: Record<string, unknown>): void {
    const envelope = { incidentId, ...payload };
    this.safe('assessmentUpdated', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.ASSESSMENT_UPDATED, envelope);
      this.gateway.emitToIncident(INCIDENT_EVENTS.ASSESSMENT_UPDATED, incidentId, envelope);
    });
  }

  incidentHandover(incidentId: string, payload: Record<string, unknown>): void {
    const envelope = { incidentId, ...payload };
    this.safe('incidentHandover', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.HANDOVER, envelope);
      this.gateway.emitToIncident(INCIDENT_EVENTS.HANDOVER, incidentId, envelope);
    });
  }

  /**
   * MOD-33 — incident-scoped chat message. Fans out ONLY to the incident room
   * (participants: reporter, assigned responders, dispatchers who joined it).
   * Not broadcast to ops:all, so a bystander reporter's messages never leak to
   * unrelated staff. The payload carries a role label, never a personal identity.
   */
  messageCreated(incidentId: string, payload: IncidentMessagePayload): void {
    this.safe('messageCreated', () => {
      this.gateway.emitToIncident(INCIDENT_EVENTS.MESSAGE_CREATED, incidentId, payload);
    });
  }

  // ── Escalation ──────────────────────────────────────────────────────────────

  escalationCreated(
    incidentId: string,
    payload: { escalationId: string; escalationType: string; status?: string; incidentStatus?: string },
  ): void {
    const envelope = { incidentId, ...payload };
    this.safe('escalationCreated', () => {
      this.gateway.emitToOps(ESCALATION_EVENTS.CREATED, envelope);
      this.gateway.emitToIncident(INCIDENT_EVENTS.ESCALATED, incidentId, envelope);
    });
  }

  escalationUpdated(
    incidentId: string,
    payload: { escalationId: string; status: string },
  ): void {
    // Escalation acknowledge/resolve is an ops-center concern (supervisors), so
    // it fans out to the ops room only — not the citizen's incident room.
    const envelope = { incidentId, ...payload };
    this.safe('escalationUpdated', () => {
      this.gateway.emitToOps(ESCALATION_EVENTS.UPDATED, envelope);
    });
  }

  // ── Responder ─────────────────────────────────────────────────────────────

  responderLocation(
    incidentId: string,
    payload: {
      responderId: string;
      lat: number;
      lng: number;
      heading?: number | null;
      speed?: number | null;
      updatedAt: string;
    },
  ): void {
    const envelope = { incidentId, ...payload };
    this.safe('responderLocation', () => {
      this.gateway.emitToOps(RESPONDER_EVENTS.LOCATION_UPDATED, envelope);
      this.gateway.emitToIncident(RESPONDER_EVENTS.LOCATION_UPDATED, incidentId, envelope);
    });
  }

  responderStatus(payload: ResponderStatusChangedPayload, incidentId?: string): void {
    this.safe('responderStatus', () => {
      this.gateway.emitToOps(RESPONDER_EVENTS.STATUS_CHANGED, payload);
      if (incidentId) {
        this.gateway.emitToIncident(RESPONDER_EVENTS.STATUS_CHANGED, incidentId, { incidentId, ...payload });
      }
    });
  }

  // ── Announcements & notifications ───────────────────────────────────────────

  announcementPublished(payload: AnnouncementPublishedPayload): void {
    // One-way public broadcast (MOD-53) — reaches every connected client.
    this.safe('announcementPublished', () => {
      this.gateway.broadcast(ANNOUNCEMENT_EVENTS.PUBLISHED, payload);
    });
  }

  notificationCreated(payload: NotificationCreatedPayload): void {
    this.safe('notificationCreated', () => {
      this.gateway.emitToUser(NOTIFICATION_EVENTS.CREATED, payload.userId, payload);
    });
  }

  // ── Backward-compatible aliases (existing call sites) ───────────────────────
  // These delegate to the canonical methods above so current callers keep working
  // and inherit the best-effort guarantee. New code should use the methods above.

  notifyIncidentCreated(payload: IncidentCreatedPayload): void {
    this.incidentCreated(payload);
  }

  notifyIncidentStatusChanged(payload: IncidentStatusChangedPayload): void {
    this.statusChanged(payload);
  }

  notifyResponderLocationUpdated(
    incidentId: string,
    payload: {
      responderId: string;
      lat: number;
      lng: number;
      heading?: number | null;
      speed?: number | null;
      updatedAt: string;
    },
  ): void {
    this.responderLocation(incidentId, payload);
  }

  notifyDispatchCreated(
    incidentId: string,
    payload: { dispatchId: string; resourceId: string; status: string },
  ): void {
    this.dispatchCreated(incidentId, payload);
  }

  notifyDispatchCancelled(
    incidentId: string,
    payload: { dispatchId: string; resourceId: string },
  ): void {
    const envelope = { incidentId, cancelledAt: new Date().toISOString(), ...payload };
    this.safe('notifyDispatchCancelled', () => {
      this.gateway.emitToOps(DISPATCH_EVENTS.CANCELLED, envelope);
      this.gateway.emitToIncident(DISPATCH_EVENTS.CANCELLED, incidentId, envelope);
    });
  }

  notifyEscalation(
    incidentId: string,
    payload: { escalationId: string; escalationType: string; incidentStatus: string },
  ): void {
    this.escalationCreated(incidentId, payload);
  }

  notifyEtaUpdated(
    incidentId: string,
    payload: { dispatchId: string; etaSeconds: number; isEstimate: true; calculatedAt: string },
  ): void {
    const envelope = { incidentId, ...payload };
    this.safe('notifyEtaUpdated', () => {
      this.gateway.emitToIncident(RESPONDER_EVENTS.ETA_UPDATED, incidentId, envelope);
      this.gateway.emitToOps(RESPONDER_EVENTS.ETA_UPDATED, envelope);
    });
  }

  // ── internal ────────────────────────────────────────────────────────────────

  private safe(label: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.logger.error(`Realtime emit failed (${label}): ${String(err)}`);
    }
  }
}
