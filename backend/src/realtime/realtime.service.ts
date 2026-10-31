import { Injectable, Logger } from '@nestjs/common';
import { AgapGateway } from './agap.gateway';
import {
  INCIDENT_EVENTS,
  RESPONDER_EVENTS,
  DISPATCH_EVENTS,
  ESCALATION_EVENTS,
  ANNOUNCEMENT_EVENTS,
  NOTIFICATION_EVENTS,
  BARANGAY_EVENTS,
  RESOURCE_EVENTS,
  SURGE_EVENTS,
  AI_EVENTS,
  IncidentStatus,
} from '@agap/shared';
import type {
  AgapEventName,
  IncidentCreatedPayload,
  IncidentFieldReportPayload,
  IncidentStatusChangedPayload,
  IncidentAssignedPayload,
  IncidentLocationUpdatedPayload,
  IncidentMessagePayload,
  ResponderStatusChangedPayload,
  ResponderLocationUpdatedPayload,
  ResponderEtaUpdatedPayload,
  DispatchUpdatedPayload,
  AnnouncementPublishedPayload,
  NotificationCreatedPayload,
  BarangayNoticeUpdatedPayload,
  ResourceStatusChangedPayload,
  IncidentTransportingPayload,
  IncidentFacilityArrivalPayload,
  IncidentTransportUpdatedPayload,
  ResponderRouteUpdatedPayload,
  SurgeRecommendedPayload,
  SurgeTriageTagUpdatedPayload,
  AiSuggestionCreatedPayload,
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
 * Rooms for a leg-sensitive event (position, route, ETA, destination). Built only by
 * TransportAudienceService: `incidentRoom` is true only on leg TO_SCENE; on the
 * hospital leg `userIds` holds the crew and a crew-confirmed reporter-patient (C6/C17/C18).
 */
export interface RealtimeAudience {
  incidentRoom: boolean;
  userIds: string[];
}

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

  /**
   * Crew accepted or declined a dispatch. Lets the dispatch dashboard switch
   * from "Awaiting crew acceptance" to live tracking without waiting to poll.
   */
  dispatchUpdated(
    incidentId: string,
    payload: Omit<DispatchUpdatedPayload, 'incidentId' | 'updatedAt'>,
  ): void {
    const envelope: DispatchUpdatedPayload = { incidentId, updatedAt: new Date().toISOString(), ...payload };
    this.safe('dispatchUpdated', () => {
      this.gateway.emitToOps(DISPATCH_EVENTS.UPDATED, envelope);
      this.gateway.emitToIncident(DISPATCH_EVENTS.UPDATED, incidentId, envelope);
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

  /**
   * A crew's fire report or rescue trip (unit field flow plan). Ops room only: the
   * reporter's app doesn't get hazard or casualty details. Never notes or names.
   */
  fieldReport(payload: IncidentFieldReportPayload): void {
    this.safe('fieldReport', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.FIELD_REPORT, payload);
    });
  }

  incidentHandover(incidentId: string, payload: Record<string, unknown>): void {
    const envelope = { incidentId, ...payload };
    this.safe('incidentHandover', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.HANDOVER, envelope);
      this.gateway.emitToIncident(INCIDENT_EVENTS.HANDOVER, incidentId, envelope);
    });
  }

  // ── MOD-40 Transport ───────────────────────────────────────────────────────

  /**
   * Full payload to ops. The incident room (which includes the reporter) gets a
   * status-only copy: no patient, no destination (Correction C18). A crew-confirmed
   * reporter-patient (C17) also gets the status copy plus the destination view in
   * their own room.
   */
  incidentTransporting(payload: IncidentTransportingPayload, confirmedReporterId: string | null = null): void {
    const { incidentId, transportId, dispatchId, transportStartedAt } = payload;
    const statusOnly: IncidentTransportingPayload = { incidentId, transportId, dispatchId, transportStartedAt };
    this.safe('incidentTransporting', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.TRANSPORTING, payload);
      this.gateway.emitToIncident(INCIDENT_EVENTS.TRANSPORTING, incidentId, statusOnly);
      if (confirmedReporterId) {
        this.gateway.emitToUser(INCIDENT_EVENTS.TRANSPORTING, confirmedReporterId, {
          ...statusOnly,
          destination: payload.destination ?? null,
        });
      }
    });
  }

  /**
   * Full payload to ops; the incident room gets a status-only copy built field by
   * field, so a field added later cannot reach it by default (C18). A crew-confirmed
   * reporter-patient (C17) also gets the status copy plus the destination view.
   */
  facilityArrival(payload: IncidentFacilityArrivalPayload, confirmedReporterId: string | null = null): void {
    const { incidentId, transportId, dispatchId, arrivedAt } = payload;
    const statusOnly: IncidentFacilityArrivalPayload = {
      incidentId,
      transportId,
      ...(dispatchId !== undefined && { dispatchId }),
      arrivedAt,
    };
    this.safe('facilityArrival', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.FACILITY_ARRIVAL, payload);
      this.gateway.emitToIncident(INCIDENT_EVENTS.FACILITY_ARRIVAL, payload.incidentId, statusOnly);
      if (confirmedReporterId) {
        this.gateway.emitToUser(INCIDENT_EVENTS.FACILITY_ARRIVAL, confirmedReporterId, {
          ...statusOnly,
          destination: payload.destination ?? null,
        });
      }
    });
  }

  /**
   * A transport's destination changed. Full payload to ops; each named user
   * (crew, and a crew-confirmed reporter-patient, C17) gets it without
   * `destination.id`. NEVER the incident room: a destination only exists on the
   * hospital leg (C18).
   */
  transportUpdated(payload: IncidentTransportUpdatedPayload, userIds: string[]): void {
    const forUsers: IncidentTransportUpdatedPayload = {
      ...payload,
      destination: payload.destination ? withoutId(payload.destination) : null,
    };
    this.safe('transportUpdated', () => {
      this.gateway.emitToOps(INCIDENT_EVENTS.TRANSPORT_UPDATED, payload);
      for (const userId of new Set(userIds)) {
        this.gateway.emitToUser(INCIDENT_EVENTS.TRANSPORT_UPDATED, userId, forUsers);
      }
    });
  }

  /**
   * The route for the unit's current leg. Ops always gets it; the incident room
   * only on TO_SCENE; on TO_FACILITY / AT_FACILITY the crew and a crew-confirmed
   * reporter-patient through `userIds` (C6/C17/C18).
   */
  routeUpdated(payload: ResponderRouteUpdatedPayload, audience: RealtimeAudience): void {
    this.safe('routeUpdated', () => {
      this.gateway.emitToOps(RESPONDER_EVENTS.ROUTE_UPDATED, payload);
      if (audience.incidentRoom) {
        this.gateway.emitToIncident(RESPONDER_EVENTS.ROUTE_UPDATED, payload.incidentId, payload);
      }
      for (const userId of new Set(audience.userIds)) {
        this.gateway.emitToUser(RESPONDER_EVENTS.ROUTE_UPDATED, userId, payload);
      }
    });
  }

  /**
   * The crew withdrew a reporter's confirmation (C17): tell only that reporter to
   * drop the destination and route they were shown. Ops and the crew are unaffected.
   */
  routeWithdrawn(incidentId: string, dispatchId: string, leg: ResponderRouteUpdatedPayload['leg'], userId: string): void {
    const payload: ResponderRouteUpdatedPayload = { incidentId, dispatchId, leg, destination: null, route: null };
    this.safe('routeWithdrawn', () => {
      this.gateway.emitToUser(RESPONDER_EVENTS.ROUTE_UPDATED, userId, payload);
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

  /** Barangay notice changed. Ops room only: never the citizen's incident room. */
  barangayNoticeUpdated(payload: BarangayNoticeUpdatedPayload): void {
    this.safe('barangayNoticeUpdated', () => {
      this.gateway.emitToOps(BARANGAY_EVENTS.NOTICE_UPDATED, payload);
    });
  }

  // ── Surge (MOD-52) ────────────────────────────────────────────────────────

  /** A surge rule tripped. Ops room only; a Supervisor decides whether to activate. */
  surgeRecommended(payload: SurgeRecommendedPayload): void {
    this.safe('surgeRecommended', () => {
      this.gateway.emitToOps(SURGE_EVENTS.RECOMMENDED, payload);
    });
  }

  /** A triage tag was filed or changed, so every open triage board refetches. Ops room only. */
  triageTagUpdated(payload: SurgeTriageTagUpdatedPayload): void {
    this.safe('triageTagUpdated', () => {
      this.gateway.emitToOps(SURGE_EVENTS.TRIAGE_TAG_UPDATED, payload);
    });
  }

  // ── AI Assist ─────────────────────────────────────────────────────────────

  /** An AI suggestion was stored. Ops room only; IDs and status, the drawer refetches. */
  aiSuggestionCreated(payload: AiSuggestionCreatedPayload): void {
    this.safe('aiSuggestionCreated', () => {
      this.gateway.emitToOps(AI_EVENTS.SUGGESTION_CREATED, payload);
    });
  }

  // ── Responder ─────────────────────────────────────────────────────────────

  /** A unit's position reveals where it is going: the incident room gets it only on TO_SCENE (C6). */
  responderLocation(
    incidentId: string,
    payload: Omit<ResponderLocationUpdatedPayload, 'incidentId'>,
    audience: RealtimeAudience,
  ): void {
    const envelope: ResponderLocationUpdatedPayload = { incidentId, ...payload };
    this.safe('responderLocation', () => {
      this.gateway.emitToOps(RESPONDER_EVENTS.LOCATION_UPDATED, envelope);
      if (audience.incidentRoom) {
        this.gateway.emitToIncident(RESPONDER_EVENTS.LOCATION_UPDATED, incidentId, envelope);
      }
      for (const userId of new Set(audience.userIds)) {
        this.gateway.emitToUser(RESPONDER_EVENTS.LOCATION_UPDATED, userId, envelope);
      }
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

  /** MOD-28 — a unit's status changed; keeps every open fleet board current. Ops room only. */
  resourceStatusChanged(payload: ResourceStatusChangedPayload): void {
    this.safe('resourceStatusChanged', () => {
      this.gateway.emitToOps(RESOURCE_EVENTS.STATUS_CHANGED, payload);
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
    payload: Omit<ResponderLocationUpdatedPayload, 'incidentId'>,
    audience: RealtimeAudience,
  ): void {
    this.responderLocation(incidentId, payload, audience);
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

  /**
   * The ETA to a hospital is not for the shared incident room (C17/C18): on the
   * hospital leg it goes to ops and `userIds` only. The default (incident room) is
   * for the scene ETA of TRANSPORT_ROUTING_ENABLED=false.
   */
  notifyEtaUpdated(
    incidentId: string,
    payload: Omit<ResponderEtaUpdatedPayload, 'incidentId'>,
    audience: RealtimeAudience = { incidentRoom: true, userIds: [] },
  ): void {
    const envelope: ResponderEtaUpdatedPayload = { incidentId, ...payload };
    this.safe('notifyEtaUpdated', () => {
      if (audience.incidentRoom) {
        this.gateway.emitToIncident(RESPONDER_EVENTS.ETA_UPDATED, incidentId, envelope);
      }
      this.gateway.emitToOps(RESPONDER_EVENTS.ETA_UPDATED, envelope);
      for (const userId of new Set(audience.userIds)) {
        this.gateway.emitToUser(RESPONDER_EVENTS.ETA_UPDATED, userId, envelope);
      }
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

function withoutId<T extends { id?: string }>(value: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = value;
  return rest;
}
