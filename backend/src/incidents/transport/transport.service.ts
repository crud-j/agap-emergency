import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransportRecord } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { LocationsService } from '../../locations/locations.service';
import { RouteCacheService } from '../../locations/route-cache.service';
import { IncidentStatusService } from '../incident-status/incident-status.service';
import { AuditAction, IncidentStatus, ReporterStatus, UserRole } from '@agap/shared';
import type { IncidentTransportUpdatedPayload, TransportDestinationView } from '@agap/shared';
import { OrgActor, activeMemberOrgIds } from '../../organizations/org-scope';
import { DestinationWarning, SelectableDestination, assertSelectableDestination } from '../../hospitals/destination-rules';
import { DESTINATION_VIEW_SELECT, toFacilityView, toTransportDestinationView } from '../../hospitals/facility-view';
import type { EtaRefreshReason } from '../../jobs/processors/eta-refresh.processor';
import { openTransportWhere } from './open-transport';
import { TransportAudienceService } from './transport-audience.service';
import { TRANSPORT_REQUEST_TTL_SECONDS, TransportRequestCacheService } from './transport-request-cache.service';
import { StartTransportDto } from './dto/start-transport.dto';
import { RecordArrivalDto } from './dto/record-arrival.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';

type CrewReader = { dispatch_crew: Pick<Prisma.TransactionClient['dispatch_crew'], 'findUnique'> };
type ReplayReader = {
  auditLog: Pick<Prisma.TransactionClient['auditLog'], 'findFirst'>;
  transportRecord: Pick<Prisma.TransactionClient['transportRecord'], 'findUnique'>;
};

/** Plan §19: an arrival tapped offline may be sent up to 30 min later. */
export const ARRIVAL_BACKDATE_LIMIT_MS = 30 * 60 * 1000;
/** A phone clock this far ahead of the server still counts as "now", so a fresh arrival is not refused. */
export const ARRIVAL_CLOCK_SKEW_MS = 60 * 1000;

export interface BeginTransportInput {
  incidentId: string;
  dispatchId: string;
  actor: { id: string; role?: string };
  destinationId?: string;
  patientId?: string;
  estimatedArrivalAt?: string;
  /** IncidentEvent note when the incident moves to TRANSPORTING. Default 'Transport started'. */
  notes?: string | null;
  at?: Date;
  /** From the phone's outbox (plan §19): stored in the audit row, so a retry is recognised. */
  clientRequestId?: string;
}

export interface BeginTransportResult {
  record: TransportRecord;
  /** The incident moved ON_SCENE → TRANSPORTING in this call. */
  statusChanged: boolean;
  previousStatus: IncidentStatus;
  warnings: DestinationWarning[];
  /**
   * created: a new record; destination_set: the open record got its first destination;
   * unchanged: the open record is returned as it was (a repeated start).
   */
  outcome: 'created' | 'destination_set' | 'unchanged';
  destination: SelectableDestination | null;
}

/** Added to each transport in GET /incidents/:id/transport, except for hospital users. */
export interface ReporterPatientHint {
  /**
   * REPORTER_DESTINATION_SHARING_ENABLED: when false the crew switch is hidden and
   * PATCH …/reporter-patient is refused (C17 launch switch).
   */
  reporterSharingEnabled: boolean;
  /**
   * The reporter's OWN claim, never confirmed by anyone: they ticked "it's me" for a
   * patient or reported themselves as needing help. A hint for the crew only. It never
   * shows the reporter the destination; only reporter_patient_confirmed_at does (C17).
   */
  reporterClaimsPatient: boolean;
}

/** What an open-transport notice needs to know about the transport. */
type TransportRef = Pick<TransportRecord, 'id' | 'incident_id' | 'dispatch_id' | 'destination_id'>;

/**
 * MOD-40 — Transport and Destination Tracking.
 * Manages TransportRecord lifecycle: start → en-route → facility arrival → handover.
 * Every way into TRANSPORTING (the crew's status button and POST /transport) goes
 * through beginTransport, so the incident never moves to TRANSPORTING without an
 * open record. Writes and their audit rows share one transaction; realtime events,
 * the route cache and the immediate ETA refresh follow the commit (best-effort).
 */
@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly statusService: IncidentStatusService,
    private readonly locations: LocationsService,
    private readonly routeCache: RouteCacheService,
    private readonly audience: TransportAudienceService,
    private readonly requests: TransportRequestCacheService,
  ) {}

  /**
   * Plan §19 / Rule 12: a transport mutation retried with the same clientRequestId
   * (the phone's outbox) gets the answer the first one got, for 24 h. Redis keeps that
   * answer; when Redis is down or has lost it, `run` recognises the id from the audit
   * row (findReplayedRecord), so a retry never writes twice. Callers run their crew
   * check first, so a stored answer only goes back to the crew it belongs to.
   */
  async once<T>(
    dispatchId: string,
    incidentId: string,
    clientRequestId: string | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!clientRequestId) return run();
    const stored = await this.requests.get(dispatchId, clientRequestId);
    if (stored && stored.incidentId === incidentId) return stored.response as T;
    const response = await run();
    await this.requests.set(dispatchId, clientRequestId, { incidentId, response });
    return response;
  }

  /** Hospital users see only transports bound for their own organization's facilities (contains patient names). */
  async listTransports(incidentId: string, actor: OrgActor) {
    await this.requireIncident(incidentId);
    const ownOrgs = actor.role === UserRole.HOSPITAL_USER ? await activeMemberOrgIds(this.prisma, actor.id) : null;
    // Hospital users do not need the reporter's self-claim; it is for the crew.
    const hint: ReporterPatientHint | null = ownOrgs
      ? null
      : {
          reporterSharingEnabled: this.audience.reporterSharingEnabled(),
          reporterClaimsPatient: await this.reporterClaimsPatient(incidentId),
        };
    const records = await this.prisma.transportRecord.findMany({
      where: {
        incident_id: incidentId,
        ...(ownOrgs && { facilities: { organization_id: { in: ownOrgs } } }),
      },
      orderBy: { created_at: 'desc' },
      include: {
        facilities: {
          select: {
            id: true, name: true, facility_type: true, address: true, municipality: true,
            latitude: true, longitude: true, location_status: true, receiving_status: true,
            // A destination deactivated mid-transport stays on the record; the console warns about it.
            is_active: true,
          },
        },
        incident_patients: { select: { id: true, patient_name: true, is_unknown: true } },
      },
    });
    if (ownOrgs && records.length === 0) {
      throw new ForbiddenException('No transport on this incident is bound for your hospital.');
    }
    return records.map((record) => ({
      ...record,
      facilities: record.facilities ? toFacilityView(record.facilities) : null,
      ...hint,
    }));
  }

  /**
   * C17: the crew on this transport (or a dispatcher/supervisor) records that the person
   * being carried is the registered reporter, or withdraws it. This is the only thing
   * that may show that reporter the destination (Prompt 09 enforces it); the reporter's
   * own claim never does. Asking for the state already recorded changes nothing, so the
   * original confirmer and time are kept. After a change: the cached audience is dropped
   * and the route is resent at once, so the reporter's view switches within seconds; a
   * withdrawal also tells the reporter to drop what they were shown. Refused (403) while
   * REPORTER_DESTINATION_SHARING_ENABLED is off.
   */
  async confirmReporterIsPatient(
    incidentId: string,
    transportId: string,
    actor: { id: string; role?: string },
    confirmed: boolean,
  ) {
    if (!this.audience.reporterSharingEnabled()) {
      throw new ForbiddenException('Sharing the hospital with the reporter is not enabled yet.');
    }
    const record = await this.prisma.transportRecord.findUnique({ where: { id: transportId } });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }
    await this.assertCrew(this.prisma, record.dispatch_id, actor.id, actor.role);
    const notOpen = () =>
      new ConflictException({
        code: 'TRANSPORT_NOT_OPEN',
        transportId,
        message: 'This transport has ended, so who is being carried can no longer be changed.',
      });
    const open = await this.prisma.transportRecord.count({ where: openTransportWhere({ id: transportId }) });
    if (open === 0) throw notOpen();
    const reporter = await this.prisma.incidentReporter.findUnique({
      where: { incident_id: incidentId },
      select: { user_id: true },
    });
    if (!reporter?.user_id) {
      throw new BadRequestException('This report was sent without an account, so there is no reporter to share with.');
    }

    const wasConfirmed = record.reporter_patient_confirmed_at !== null;
    if (wasConfirmed === confirmed) return record;

    const { updated, changed } = await this.prisma.$transaction(async (tx) => {
      const at = new Date();
      // Conditional on the transport still being open (an arrival in between wins) and
      // still in the other state (of two identical requests at once, only one writes).
      const { count } = await tx.transportRecord.updateMany({
        where: openTransportWhere({
          id: transportId,
          reporter_patient_confirmed_at: confirmed ? null : { not: null },
        }),
        data: {
          reporter_patient_confirmed_at: confirmed ? at : null,
          reporter_patient_confirmed_by_id: confirmed ? actor.id : null,
          updated_at: at,
        },
      });
      if (count === 0) {
        const current = await tx.transportRecord.findFirst({ where: openTransportWhere({ id: transportId }) });
        if (!current) throw notOpen();
        // Another request recorded this state first: keep its confirmer, write no audit.
        return { updated: current, changed: false };
      }
      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId: actor.id,
        ...(actor.role && { actorRole: actor.role }),
        entityType: 'transport_record',
        entityId: transportId,
        moduleId: 'MOD-40',
        incidentId,
        oldValues: { reporter_patient_confirmed: wasConfirmed },
        newValues: { reporter_patient_confirmed: confirmed },
      });
      return { updated: await tx.transportRecord.findUniqueOrThrow({ where: { id: transportId } }), changed: true };
    });

    if (changed) {
      this.audience.invalidate(incidentId);
      if (!confirmed) this.realtime.routeWithdrawn(incidentId, record.dispatch_id, 'TO_FACILITY', reporter.user_id);
      await this.locations.requestImmediateRefresh(record.dispatch_id, incidentId, 'audience_changed');
    }
    return updated;
  }

  /**
   * The one way into a transport (plan §12), inside the caller's transaction:
   * lock the incident row, check status / dispatch / crew / destination, then
   * return the dispatch's open record (setting its first destination) or create
   * one and, from ON_SCENE, move the incident to TRANSPORTING. Audited in the
   * same transaction. Emits nothing; callers announce after commit.
   */
  async beginTransport(tx: Prisma.TransactionClient, input: BeginTransportInput): Promise<BeginTransportResult> {
    const { incidentId, dispatchId, actor, destinationId } = input;

    // Serializes concurrent starts on this incident (two crews, or PATCH and POST
    // from one phone), so the open-record check below cannot race.
    const locked = await tx.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Incident not found');
    const previousStatus = locked[0]!.status as IncidentStatus;

    // A retry of a start that already committed returns its record as it is now, even
    // if the incident has moved on since (Rule 12); checked under the same lock.
    if (input.clientRequestId) {
      const replayed = await this.findReplayedRecord(tx, { incidentId, dispatchId, clientRequestId: input.clientRequestId });
      if (replayed) {
        await this.assertCrew(tx, dispatchId, actor.id, actor.role);
        return { previousStatus, warnings: [], destination: null, statusChanged: false, record: replayed, outcome: 'unchanged' };
      }
    }

    // ON_SCENE moves to TRANSPORTING; TRANSPORTING means another unit or patient.
    // Anything else (EN_ROUTE, ASSISTING, RESOLVED, …) cannot start a transport.
    if (previousStatus !== IncidentStatus.ON_SCENE && previousStatus !== IncidentStatus.TRANSPORTING) {
      throw new ConflictException({
        code: 'TRANSPORT_NOT_ALLOWED_IN_STATUS',
        status: previousStatus,
        message: `A transport can start only when the incident is ON_SCENE or TRANSPORTING (it is ${previousStatus}).`,
      });
    }

    const dispatch = await tx.dispatches.findUnique({ where: { id: dispatchId }, select: { incident_id: true } });
    if (!dispatch || dispatch.incident_id !== incidentId) {
      throw new BadRequestException('Dispatch not found or does not belong to this incident');
    }
    await this.assertCrew(tx, dispatchId, actor.id, actor.role);

    const open = await tx.transportRecord.findFirst({ where: openTransportWhere({ dispatch_id: dispatchId }) });
    if (open) {
      // A repeated start keeps the hospital already chosen without checking it again,
      // so it cannot fail if that hospital has since gone to review.
      if (!destinationId || open.destination_id === destinationId) {
        return { previousStatus, warnings: [], destination: null, statusChanged: false, record: open, outcome: 'unchanged' };
      }
      if (open.destination_id) {
        // Changing hospitals goes through PATCH /transport/:id, which records why.
        throw new ConflictException({
          code: 'TRANSPORT_ALREADY_OPEN',
          transportId: open.id,
          message: 'This unit is already transporting to another hospital. Change the destination instead.',
        });
      }
    }

    const destination = destinationId ? await assertSelectableDestination(tx, destinationId) : null;
    const warnings: DestinationWarning[] = destination?.warnings ?? [];
    const base = { previousStatus, warnings, destination, statusChanged: false };

    // Only reached with a destination: the open record had none and one was requested.
    if (open && destination) {
      const record = await tx.transportRecord.update({
        where: { id: open.id },
        data: { destination_id: destination.id, updated_at: new Date() },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId: actor.id,
        ...(actor.role && { actorRole: actor.role }),
        entityType: 'transport_record',
        entityId: record.id,
        moduleId: 'MOD-40',
        incidentId,
        oldValues: { destination_id: null },
        newValues: {
          destination_id: destination.id,
          ...(warnings.length > 0 && { warnings }),
          ...(input.clientRequestId && { clientRequestId: input.clientRequestId }),
        },
      });
      return { ...base, record, outcome: 'destination_set' };
    }

    const record = await tx.transportRecord.create({
      data: {
        incident_id: incidentId,
        dispatch_id: dispatchId,
        patient_id: input.patientId ?? null,
        destination_id: destinationId ?? null,
        transport_started_at: input.at ?? new Date(),
        estimated_arrival_at: input.estimatedArrivalAt ? new Date(input.estimatedArrivalAt) : null,
      },
    });
    const statusChanged = previousStatus === IncidentStatus.ON_SCENE;
    if (statusChanged) {
      await this.statusService.recordTransition(tx, {
        incidentId,
        from: previousStatus,
        to: IncidentStatus.TRANSPORTING,
        actorId: actor.id,
        ...(actor.role && { actorRole: actor.role }),
        notes: input.notes === undefined ? 'Transport started' : input.notes,
        ...(input.at && { at: input.at }),
      });
    }
    await this.audit.logInTransaction(tx, {
      action: AuditAction.STATUS_CHANGE,
      actorId: actor.id,
      ...(actor.role && { actorRole: actor.role }),
      entityType: 'transport_record',
      entityId: record.id,
      moduleId: 'MOD-40',
      incidentId,
      newValues: {
        dispatch_id: dispatchId,
        destination_id: destinationId ?? null,
        transport_started_at: record.transport_started_at?.toISOString(),
        ...(warnings.length > 0 && { warnings }),
        ...(input.clientRequestId && { clientRequestId: input.clientRequestId }),
      },
    });
    return { ...base, record, statusChanged, outcome: 'created' };
  }

  /**
   * After beginTransport commits: a new record → incident.transporting (ops: full
   * with destination; incident room: status only, Prompt 06; a confirmed
   * reporter-patient: with destination) and an immediate route; a first destination
   * on an open record → transport_updated. Never throws.
   */
  async announceTransportBegun(result: BeginTransportResult): Promise<void> {
    const { record, outcome, destination } = result;
    if (outcome === 'created') {
      // The unit is now on the hospital leg: its next fix must not reach the incident room.
      this.audience.invalidate(record.incident_id);
      this.realtime.incidentTransporting(
        {
          incidentId: record.incident_id,
          transportId: record.id,
          dispatchId: record.dispatch_id,
          destinationId: record.destination_id,
          destination: destination?.view ?? null,
          patientId: record.patient_id,
          transportStartedAt: record.transport_started_at!.toISOString(),
        },
        await this.audience.confirmedReporter(record.incident_id, record.dispatch_id),
      );
      await this.locations.requestImmediateRefresh(record.dispatch_id, record.incident_id, 'transport_started');
    } else if (outcome === 'destination_set') {
      await this.announceDestination(record, destination?.view ?? null, result.warnings, 'destination_changed');
    }
  }

  async startTransport(incidentId: string, dto: StartTransportDto, userId: string, role?: string) {
    // Before a stored answer can be returned; beginTransport checks it again under the lock.
    if (dto.clientRequestId) await this.assertCrew(this.prisma, dto.dispatchId, userId, role);
    return this.once(dto.dispatchId, incidentId, dto.clientRequestId, async () => {
      const result = await this.prisma.$transaction((tx) =>
        this.beginTransport(tx, {
          incidentId,
          dispatchId: dto.dispatchId,
          actor: { id: userId, ...(role && { role }) },
          ...(dto.destinationId && { destinationId: dto.destinationId }),
          ...(dto.patientId && { patientId: dto.patientId }),
          ...(dto.estimatedArrivalAt && { estimatedArrivalAt: dto.estimatedArrivalAt }),
          ...(dto.clientRequestId && { clientRequestId: dto.clientRequestId }),
        }),
      );

      // persist → commit → emit (best-effort).
      if (result.statusChanged) {
        this.realtime.statusChanged({
          incidentId,
          previousStatus: result.previousStatus,
          newStatus: IncidentStatus.TRANSPORTING,
          changedAt: new Date().toISOString(),
          changedBy: userId,
          reason: 'Transport started',
        });
      }
      await this.announceTransportBegun(result);

      return { ...result.record, warnings: result.warnings };
    });
  }

  async recordArrival(
    incidentId: string,
    transportId: string,
    dto: RecordArrivalDto,
    userId: string,
    role?: string,
  ) {
    const record = await this.prisma.transportRecord.findUnique({
      where: { id: transportId },
    });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }
    await this.assertCrew(this.prisma, record.dispatch_id, userId, role);
    return this.once(record.dispatch_id, incidentId, dto.clientRequestId, () =>
      this.arrive(record, dto, userId, role),
    );
  }

  private async arrive(record: TransportRecord, dto: RecordArrivalDto, userId: string, role?: string) {
    const { id: transportId, incident_id: incidentId } = record;
    const request = dto.clientRequestId
      ? { incidentId, dispatchId: record.dispatch_id, transportId, clientRequestId: dto.clientRequestId }
      : null;
    if (record.arrived_at) {
      // A retry of the request that recorded it gets the record back (Rule 12).
      const replayed = request && (await this.findReplayedRecord(this.prisma, request));
      if (replayed) return replayed;
      throw new BadRequestException('Arrival already recorded for this transport');
    }
    const receivedAt = new Date();
    const arrivedAt = arrivalTime(dto.occurredAt, receivedAt, record.transport_started_at);
    const destination = await selectNewDestination(this.prisma, record.destination_id, dto.destinationId);

    const changed = isDestinationChange(record.destination_id, dto.destinationId);
    const { updated, replayed } = await this.prisma.$transaction(async (tx) => {
      // Conditional on arrived_at still null, so two taps cannot both record it.
      const { count } = await tx.transportRecord.updateMany({
        where: { id: transportId, arrived_at: null },
        data: {
          arrived_at: arrivedAt,
          updated_at: receivedAt,
          ...(destination && { destination_id: destination.id }),
          ...(changed && { destination_changed: true }),
        },
      });
      if (count === 0) {
        // The same request sent twice at once: the other copy recorded it.
        const replayed = request && (await this.findReplayedRecord(tx, request));
        if (replayed) return { updated: replayed, replayed: true };
        throw new BadRequestException('Arrival already recorded for this transport');
      }
      const updated = await tx.transportRecord.findUniqueOrThrow({ where: { id: transportId } });

      await this.audit.logInTransaction(tx, {
        action: AuditAction.STATUS_CHANGE,
        actorId: userId,
        ...(role && { actorRole: role }),
        entityType: 'transport_record',
        entityId: transportId,
        moduleId: 'MOD-40',
        incidentId,
        newValues: {
          arrived_at: arrivedAt.toISOString(),
          destination_id: updated.destination_id,
          // Sent later from the phone's outbox: the tap time and when it reached the server.
          ...(dto.occurredAt && { occurredAt: dto.occurredAt, receivedAt: receivedAt.toISOString() }),
          ...(dto.clientRequestId && { clientRequestId: dto.clientRequestId }),
        },
      });
      await this.stampReferralArrival(tx, updated, arrivedAt, { id: userId, ...(role && { role }) });
      return { updated, replayed: false };
    });
    // The first copy already announced it.
    if (replayed) return updated;

    // AT_FACILITY: the audience entry carries the new leg.
    this.audience.invalidate(incidentId);
    this.realtime.facilityArrival(
      {
        incidentId,
        transportId,
        dispatchId: record.dispatch_id,
        destinationId: updated.destination_id ?? null,
        destination: destination?.view ?? (await this.destinationView(updated.destination_id)),
        arrivedAt: arrivedAt.toISOString(),
      },
      await this.audience.confirmedReporter(incidentId, record.dispatch_id),
    );
    // The unit is now AT_FACILITY: drop the hospital route and tell viewers.
    await this.routeCache.clear(record.dispatch_id);
    await this.locations.requestImmediateRefresh(record.dispatch_id, incidentId, 'arrived');

    return updated;
  }

  async updateTransport(
    incidentId: string,
    transportId: string,
    dto: UpdateTransportDto,
    userId: string,
    role?: string,
  ) {
    const record = await this.prisma.transportRecord.findUnique({ where: { id: transportId } });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }
    // A crew member sets the destination after "Decide later" or changes it en route;
    // once arrival is recorded the record is the dispatcher's to correct.
    await this.assertCrew(this.prisma, record.dispatch_id, userId, role);
    return this.once(record.dispatch_id, incidentId, dto.clientRequestId, () =>
      this.applyUpdate(record, dto, userId, role),
    );
  }

  private async applyUpdate(record: TransportRecord, dto: UpdateTransportDto, userId: string, role?: string) {
    const { id: transportId, incident_id: incidentId } = record;
    if (dto.clientRequestId) {
      // Already applied (its audit row holds the id): a later change is not undone (Rule 12).
      const replayed = await this.findReplayedRecord(this.prisma, {
        incidentId, dispatchId: record.dispatch_id, transportId, clientRequestId: dto.clientRequestId,
      });
      if (replayed) return { ...replayed, warnings: [] as DestinationWarning[] };
    }
    if (role === 'RESPONDER' && record.arrived_at) {
      throw new BadRequestException('Arrival is already recorded for this transport.');
    }

    // Re-sending the current hospital (the mobile picker does) is not a change: it is
    // not checked again and keeps its recorded reason.
    const destination = await selectNewDestination(this.prisma, record.destination_id, dto.destinationId);
    if (destination && record.arrived_at) {
      // The arrival already closed the referral to the recorded hospital (MOD-38);
      // moving the destination now would leave that hospital showing a patient who never came.
      throw new ConflictException({
        code: 'TRANSPORT_ARRIVED',
        transportId,
        message: 'Arrival is already recorded at this hospital. The destination can no longer change.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.transportRecord.update({
        where: { id: transportId },
        data: {
          ...(destination && { destination_id: destination.id, change_reason: dto.changeReason ?? null }),
          ...(isDestinationChange(record.destination_id, dto.destinationId) && { destination_changed: true }),
          ...(dto.estimatedArrivalAt && {
            estimated_arrival_at: new Date(dto.estimatedArrivalAt),
          }),
          updated_at: new Date(),
        },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId: userId,
        ...(role && { actorRole: role }),
        entityType: 'transport_record',
        entityId: transportId,
        moduleId: 'MOD-40',
        incidentId,
        oldValues: {
          destination_id: record.destination_id,
          estimated_arrival_at: record.estimated_arrival_at?.toISOString() ?? null,
        },
        newValues: dto as Record<string, unknown>,
      });
      return updated;
    });

    // Kept for the web console, which refetches the incident on incident.updated
    // and does not listen to incident.transport_updated yet (Prompt 12).
    this.realtime.incidentUpdated(incidentId, { transportUpdated: transportId });
    if (destination) {
      await this.announceDestination(updated, destination.view, destination.warnings, 'destination_changed');
    }
    // Same shape as POST /transport, so the crew sees FACILITY_AT_CAPACITY either way.
    return { ...updated, warnings: destination?.warnings ?? [] };
  }

  /** Open transports (openTransportWhere, C16) heading to a facility. */
  findOpenTransportsForFacility(facilityId: string): Promise<TransportRef[]> {
    return this.prisma.transportRecord.findMany({
      where: openTransportWhere({ destination_id: facilityId }),
      select: { id: true, incident_id: true, dispatch_id: true, destination_id: true },
    });
  }

  /**
   * A destination hospital changed (plan §12): its coordinates moved → each open
   * transport gets transport_updated and a new route; it was deactivated → each
   * gets transport_updated with FACILITY_DEACTIVATED. The transports themselves are
   * never cancelled or modified (Reliability Rules). Called after the facility
   * write commits; never throws.
   */
  async notifyFacilityChanged(facilityId: string, change: 'moved' | 'deactivated'): Promise<void> {
    try {
      const open = await this.findOpenTransportsForFacility(facilityId);
      if (open.length === 0) return;
      const view = await this.destinationView(facilityId);
      if (!view) return;
      for (const transport of open) {
        if (change === 'moved') {
          await this.announceDestination(transport, view, [], 'facility_moved');
        } else {
          await this.emitTransportUpdated(transport, view, 'FACILITY_DEACTIVATED');
        }
      }
    } catch (err) {
      this.logger.warn(`Open-transport notice failed for facility ${facilityId}: ${String(err)}`);
    }
  }

  /** transport_updated to ops and the hospital-leg audience, then a fresh route to the new point. */
  private async announceDestination(
    transport: TransportRef,
    view: TransportDestinationView | null,
    warnings: DestinationWarning[],
    reason: EtaRefreshReason,
  ): Promise<void> {
    this.audience.invalidate(transport.incident_id);
    await this.emitTransportUpdated(
      transport,
      view,
      warnings.includes('FACILITY_AT_CAPACITY') ? 'FACILITY_AT_CAPACITY' : undefined,
    );
    await this.routeCache.clear(transport.dispatch_id);
    await this.locations.requestImmediateRefresh(transport.dispatch_id, transport.incident_id, reason);
  }

  /** Ops, the crew and a crew-confirmed reporter-patient (C17). Never the incident room (C18). */
  private async emitTransportUpdated(
    transport: TransportRef,
    view: TransportDestinationView | null,
    warning: IncidentTransportUpdatedPayload['destinationWarning'] | undefined,
  ): Promise<void> {
    const { userIds } = await this.audience.roomsForDispatch(transport.incident_id, transport.dispatch_id, 'TO_FACILITY');
    this.realtime.transportUpdated(
      {
        incidentId: transport.incident_id,
        dispatchId: transport.dispatch_id,
        transportId: transport.id,
        destination: view && transport.destination_id ? { ...view, id: transport.destination_id } : null,
        ...(warning && { destinationWarning: warning }),
        changedAt: new Date().toISOString(),
      },
      userIds,
    );
  }

  /**
   * The transport record an earlier request with this clientRequestId wrote, from the
   * id kept in its audit row (last 24 h), or null. The Redis-free half of `once`.
   */
  private async findReplayedRecord(
    client: ReplayReader,
    request: { incidentId: string; dispatchId: string; clientRequestId: string; transportId?: string },
  ): Promise<TransportRecord | null> {
    const row = await client.auditLog.findFirst({
      where: {
        incident_id: request.incidentId,
        entity_type: 'transport_record',
        occurred_at: { gte: new Date(Date.now() - TRANSPORT_REQUEST_TTL_SECONDS * 1000) },
        new_values: { path: ['clientRequestId'], equals: request.clientRequestId },
      },
      select: { entity_id: true },
    });
    if (!row?.entity_id || (request.transportId && row.entity_id !== request.transportId)) return null;
    const record = await client.transportRecord.findUnique({ where: { id: row.entity_id } });
    return record && record.dispatch_id === request.dispatchId ? record : null;
  }

  /** The reporter-safe view of a hospital (numeric coordinates); null when there is none. */
  private async destinationView(facilityId: string | null): Promise<TransportDestinationView | null> {
    if (!facilityId) return null;
    const facility = await this.prisma.facility.findUnique({ where: { id: facilityId }, select: DESTINATION_VIEW_SELECT });
    return facility ? toTransportDestinationView(facility) : null;
  }

  /**
   * MOD-38: arrival also closes the open referral to that hospital for this
   * incident (one bound to this dispatch first, else one with no dispatch).
   * Same audit row as HospitalsService.markArrived, which has no other side effects.
   */
  private async stampReferralArrival(
    tx: Prisma.TransactionClient,
    transport: TransportRecord,
    arrivedAt: Date,
    actor: { id: string; role?: string },
  ): Promise<void> {
    if (!transport.destination_id) return;
    const candidates = await tx.facility_referrals.findMany({
      where: {
        incident_id: transport.incident_id,
        facility_id: transport.destination_id,
        patient_arrived_at: null,
        OR: [{ dispatch_id: transport.dispatch_id }, { dispatch_id: null }],
      },
      orderBy: { created_at: 'desc' },
      select: { id: true, dispatch_id: true, acknowledgment_status: true },
    });
    const referral = candidates.find((c) => c.dispatch_id === transport.dispatch_id) ?? candidates[0];
    if (!referral) return;

    await tx.facility_referrals.update({
      where: { id: referral.id },
      data: { patient_arrived_at: arrivedAt, updated_at: arrivedAt },
    });
    await this.audit.logInTransaction(tx, {
      action: AuditAction.UPDATE,
      actorId: actor.id,
      ...(actor.role && { actorRole: actor.role }),
      entityType: 'facility_referral',
      entityId: referral.id,
      moduleId: 'MOD-38',
      incidentId: transport.incident_id,
      oldValues: { acknowledgment_status: referral.acknowledgment_status, patient_arrived_at: null },
      newValues: { patient_arrived_at: arrivedAt.toISOString(), transport_id: transport.id },
    });
  }

  /** Counts and a status only: no patient name or other patient field is read. */
  private async reporterClaimsPatient(incidentId: string): Promise<boolean> {
    const [selfPatients, reporter] = await Promise.all([
      this.prisma.incident_patients.count({ where: { incident_id: incidentId, is_reporter: true } }),
      this.prisma.incidentReporter.findUnique({ where: { incident_id: incidentId }, select: { reporter_status: true } }),
    ]);
    return selfPatients > 0 || reporter?.reporter_status === ReporterStatus.NEEDS_HELP;
  }

  /** A Responder acts only on transports of a dispatch they are crewing. */
  private async assertCrew(client: CrewReader, dispatchId: string, userId: string, role?: string) {
    if (role !== 'RESPONDER') return;
    const crew = await client.dispatch_crew.findUnique({
      where: { dispatch_id_user_id: { dispatch_id: dispatchId, user_id: userId } },
    });
    if (!crew) throw new ForbiddenException('You are not on the crew for this dispatch.');
  }

  private async requireIncident(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }
}

/**
 * The requested hospital, checked by the destination rule, when it differs from the
 * current one; null when there is nothing to change.
 */
function selectNewDestination(
  client: Parameters<typeof assertSelectableDestination>[0],
  current: string | null,
  requested: string | undefined,
): Promise<SelectableDestination | null> {
  return requested !== undefined && requested !== current
    ? assertSelectableDestination(client, requested)
    : Promise.resolve(null);
}

/** Replacing a chosen hospital is a change; choosing the first one is not. */
function isDestinationChange(current: string | null, next: string | undefined): boolean {
  return current !== null && next !== undefined && next !== current;
}

/**
 * arrived_at for an arrival (plan §19): now, or the tap time an outbox sent later.
 * Older than 30 min or in the future → 400 (a minute of phone-clock drift counts as
 * now). Never before the transport started.
 */
export function arrivalTime(occurredAt: string | undefined, now: Date, startedAt: Date | null): Date {
  if (!occurredAt) return now;
  const at = new Date(occurredAt);
  if (at.getTime() > now.getTime() + ARRIVAL_CLOCK_SKEW_MS) {
    throw new BadRequestException("The arrival time is in the future. Check the phone's date and time.");
  }
  if (at.getTime() < now.getTime() - ARRIVAL_BACKDATE_LIMIT_MS) {
    throw new BadRequestException('The arrival time is more than 30 minutes ago. Record the arrival again.');
  }
  const capped = at > now ? now : at;
  return startedAt && capped < startedAt ? startedAt : capped;
}
