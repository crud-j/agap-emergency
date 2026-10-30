import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, facility_location_status } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { SetLocationDto } from './dto/set-location.dto';
import { VerifyLocationDto } from './dto/verify-location.dto';
import { SetActiveDto } from './dto/set-active.dto';
import { CreateReferralDto } from './dto/create-referral.dto';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransportService } from '../incidents/transport/transport.service';
import { AuditAction, IncidentStatus, UserRole, haversineMeters, isCoordinateInServiceArea, looksSwapped } from '@agap/shared';
import { activeMemberOrgIds, assertCanManageOrg } from '../organizations/org-scope';
import { UNREVIEWED_STATUSES } from './destination-rules';
import { toFacilityView } from './facility-view';
import { needFor, scoreFacility } from './referral-ranking';

const LOCATION_REVIEWERS: string[] = [UserRole.SYSTEM_ADMINISTRATOR, UserRole.SUPERVISOR];

/** C6: how many ranked hospitals the referral dialog shows. */
const RECOMMENDATION_LIMIT = 10;

@Injectable()
export class HospitalsService {
  private readonly logger = new Logger(HospitalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly transport: TransportService,
  ) {}

  /**
   * `includeInactive` lists deactivated hospitals too, for reviewers only (the registry
   * page, so they can be reactivated). Pickers and every other caller stay active-only.
   */
  async findAll(actor?: ReferralActor, includeUnreviewed = false, includeInactive = false) {
    const showInactive = includeInactive && !!actor && LOCATION_REVIEWERS.includes(actor.role);
    const facilities = await this.prisma.facility.findMany({
      where: {
        facility_type: 'HOSPITAL',
        ...(!showInactive && { is_active: true }),
        ...(await this.reviewVisibility(actor, includeUnreviewed)),
      },
      orderBy: { name: 'asc' },
    });
    return facilities.map((facility) => toFacilityView(facility));
  }

  /** GET /hospitals/:id: an unreviewed or rejected hospital is hidden exactly as in findAll. */
  async findVisibleById(id: string, actor: ReferralActor) {
    const facility = await this.prisma.facility.findFirst({
      where: { id, ...(await this.reviewVisibility(actor, true)) },
      include: { facility_capabilities: true },
    });
    if (!facility) throw new NotFoundException('Hospital not found');
    return toFacilityView(facility);
  }

  async findNearby(lat: number, lng: number, limit = 10) {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, unknown> & { distance_meters: number | string | Prisma.Decimal }>
    >(Prisma.sql`
      SELECT f.*, ST_Distance(
        f.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) AS distance_meters
      FROM facilities f
      WHERE f.facility_type = 'HOSPITAL'
        AND f.is_active = true
        AND f.location_status = 'VERIFIED'
        AND f.location IS NOT NULL
      ORDER BY distance_meters ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      ...toFacilityView(row),
      distanceMeters: Math.round(Number(row.distance_meters)),
      distanceKind: 'STRAIGHT_LINE' as const,
    }));
  }

  /**
   * C6: active hospitals ranked for an incident's referral, best first, with reasons. Only
   * hospitals the dispatcher's referral list shows, and only facility data (no patient
   * data). Distance is straight-line from a VERIFIED hospital location, as in findNearby.
   * The dispatcher still picks (CLAUDE.md rule 8).
   */
  async recommendations(incidentId: string, actor: ReferralActor, now = new Date()) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { category: true, priority: true, incident_locations: { select: { latitude: true, longitude: true } } },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    const need = needFor(incident);
    const at = incident.incident_locations;
    const origin = at?.latitude != null && at.longitude != null ? { lat: Number(at.latitude), lng: Number(at.longitude) } : null;

    const facilities = await this.prisma.facility.findMany({
      where: { facility_type: 'HOSPITAL', is_active: true, ...(await this.reviewVisibility(actor, false)) },
      select: {
        id: true, name: true, receiving_status: true, receiving_status_updated_at: true,
        has_emergency_room: true, has_icu: true, capacity_available: true, capacity_total: true,
        latitude: true, longitude: true, location_status: true,
      },
    });

    const ranked = facilities.map((f) => {
      const located = f.location_status === 'VERIFIED' && f.latitude != null && f.longitude != null;
      const meters = origin && located
        ? haversineMeters(origin.lat, origin.lng, Number(f.latitude), Number(f.longitude))
        : null;
      const result = scoreFacility(f, need, meters === null ? null : meters / 1000, now);
      const reasons = [...result.reasons];
      if (!origin) reasons.push('Incident location unknown');
      else if (!located) reasons.push('Hospital location not verified');
      return {
        id: f.id,
        name: f.name,
        receivingStatus: f.receiving_status,
        effectiveStatus: result.effectiveStatus,
        statusAgeHours: result.statusAgeHours,
        hasEmergencyRoom: !!f.has_emergency_room,
        hasIcu: !!f.has_icu,
        capacityAvailable: f.capacity_available,
        capacityTotal: f.capacity_total,
        score: result.score,
        reasons,
        distanceMeters: meters === null ? null : Math.round(meters),
        distanceLabel: result.distanceLabel,
      };
    });

    ranked.sort((a, b) =>
      b.score - a.score
      || (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity)
      || a.name.localeCompare(b.name));
    return ranked.slice(0, RECOMMENDATION_LIMIT);
  }

  async findById(id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { facility_capabilities: true },
    });
    if (!facility) throw new NotFoundException('Hospital not found');
    return toFacilityView(facility);
  }

  /**
   * System Administrator: any organization or none; a given location is VERIFIED.
   * Org Administrator: only for their own HOSPITAL organization, and a location is
   * PENDING_REVIEW until a Supervisor or System Administrator verifies it.
   */
  async create(dto: CreateHospitalDto, actor: ReferralActor) {
    const isOrgAdmin = actor.role === UserRole.ORG_ADMINISTRATOR;
    if (isOrgAdmin && !dto.organizationId) {
      throw new BadRequestException('organizationId is required for an Organization Administrator.');
    }
    if (dto.organizationId) {
      const organization = await this.prisma.organization.findUnique({
        where: { id: dto.organizationId },
        select: { organization_type: true },
      });
      if (!organization) throw new BadRequestException('Organization not found.');
      if (isOrgAdmin) {
        await assertCanManageOrg(this.prisma, actor, dto.organizationId);
        if (organization.organization_type !== 'HOSPITAL') {
          throw new ForbiddenException('The organization must be a hospital organization.');
        }
      }
    }
    if (dto.location) this.assertValidLocation(dto.location.latitude, dto.location.longitude);
    await this.assertNoDuplicate(dto.name, dto.municipality, dto.location?.sourceRef);

    const status = !dto.location
      ? facility_location_status.UNVERIFIED
      : isOrgAdmin
        ? facility_location_status.PENDING_REVIEW
        : facility_location_status.VERIFIED;
    try {
      const hospital = toFacilityView(await this.prisma.facility.create({
        data: {
          name: dto.name,
          facility_type: 'HOSPITAL',
          organization_id: dto.organizationId ?? null,
          barangay: dto.barangay ?? null,
          address: dto.address ?? null,
          municipality: dto.municipality ?? null,
          province: dto.province ?? null,
          contact_number: dto.contactNumber ?? null,
          emergency_contact: dto.emergencyContact ?? null,
          has_emergency_room: dto.hasEmergencyRoom ?? false,
          has_icu: dto.hasIcu ?? false,
          blood_bank: dto.bloodBank ?? false,
          location_status: status,
          ...(dto.location && {
            latitude: dto.location.latitude,
            longitude: dto.location.longitude,
            location_source: dto.location.source,
            location_source_ref: dto.location.sourceRef ?? null,
            location_confidence: dto.location.confidence ?? null,
          }),
          ...(status === facility_location_status.VERIFIED && {
            location_verified_by_id: actor.id,
            last_verified_at: new Date(),
          }),
        },
      }));
      await this.audit.log({
        action: AuditAction.CREATE,
        actorId: actor.id,
        entityType: 'facility',
        entityId: hospital.id,
        moduleId: 'MOD-39',
        newValues: {
          name: hospital.name,
          organization_id: hospital.organization_id,
          latitude: hospital.latitude,
          longitude: hospital.longitude,
          location_status: hospital.location_status,
        },
      });
      return hospital;
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  /** The System Administrator edits any hospital; an Org Administrator only their organization's. */
  async update(id: string, dto: UpdateHospitalDto, actor?: ReferralActor) {
    const existing = await this.findById(id);
    if (actor && actor.role !== UserRole.SYSTEM_ADMINISTRATOR) {
      if (!existing.organization_id) throw new ForbiddenException('This hospital is not linked to your organization.');
      await assertCanManageOrg(this.prisma, actor, existing.organization_id);
    }
    const updated = await this.prisma.facility.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.barangay !== undefined && { barangay: dto.barangay }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.municipality !== undefined && { municipality: dto.municipality }),
        ...(dto.province !== undefined && { province: dto.province }),
        ...(dto.contactNumber !== undefined && { contact_number: dto.contactNumber }),
        ...(dto.emergencyContact !== undefined && {
          emergency_contact: dto.emergencyContact,
        }),
        ...(dto.hasEmergencyRoom !== undefined && {
          has_emergency_room: dto.hasEmergencyRoom,
        }),
        ...(dto.hasIcu !== undefined && { has_icu: dto.hasIcu }),
        ...(dto.bloodBank !== undefined && { blood_bank: dto.bloodBank }),
        updated_at: new Date(),
      },
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      ...(actor && { actorId: actor.id }),
      entityType: 'facility',
      entityId: id,
      moduleId: 'MOD-39',
      newValues: { ...dto },
    });
    return toFacilityView(updated);
  }

  async setLocation(id: string, dto: SetLocationDto, actor: ReferralActor) {
    const existing = await this.findById(id);
    if (actor.role === UserRole.ORG_ADMINISTRATOR) {
      if (!existing.organization_id) throw new ForbiddenException('This hospital is not linked to your organization.');
      await assertCanManageOrg(this.prisma, actor, existing.organization_id);
    }
    this.assertValidLocation(dto.latitude, dto.longitude);
    await this.assertNoDuplicate(existing.name, existing.municipality, dto.sourceRef, id);
    const status = actor.role === UserRole.ORG_ADMINISTRATOR
      ? facility_location_status.PENDING_REVIEW
      : facility_location_status.VERIFIED;
    try {
      const updated = await this.prisma.facility.update({
        where: { id },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          location_status: status,
          location_source: dto.source,
          location_source_ref: dto.sourceRef ?? null,
          location_confidence: dto.confidence ?? null,
          location_verified_by_id: status === facility_location_status.VERIFIED ? actor.id : null,
          last_verified_at: status === facility_location_status.VERIFIED ? new Date() : null,
          updated_at: new Date(),
        },
      });
      await this.audit.log({
        action: AuditAction.UPDATE,
        actorId: actor.id,
        entityType: 'facility',
        entityId: id,
        moduleId: 'MOD-39',
        oldValues: {
          latitude: existing.latitude,
          longitude: existing.longitude,
          location_status: existing.location_status,
        },
        newValues: { latitude: dto.latitude, longitude: dto.longitude, location_status: status, reason: dto.reason ?? null },
      });
      await this.onFacilityLocationChanged(id);
      return toFacilityView(updated);
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  async verifyLocation(id: string, dto: VerifyLocationDto, actor: ReferralActor) {
    const existing = await this.findById(id);
    if (dto.decision === 'VERIFIED' && (existing.latitude === null || existing.longitude === null)) {
      throw new UnprocessableEntityException({ code: 'LOCATION_MISSING', message: 'A facility must have coordinates before verification.' });
    }
    const updated = await this.prisma.facility.update({
      where: { id },
      data: {
        location_status: dto.decision,
        location_verified_by_id: actor.id,
        last_verified_at: new Date(),
        updated_at: new Date(),
      },
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      entityType: 'facility',
      entityId: id,
      moduleId: 'MOD-39',
      oldValues: { latitude: existing.latitude, longitude: existing.longitude, location_status: existing.location_status },
      newValues: { location_status: dto.decision, note: dto.note ?? null },
    });
    return toFacilityView(updated);
  }

  /**
   * Deactivate or reactivate a hospital (plan §9.4, §12). An inactive hospital cannot be
   * chosen as a new destination (destination-rules.ts). Open transports to it are never
   * cancelled or changed (Reliability Rules): after a true → false change their crews and
   * the console get transport_updated FACILITY_DEACTIVATED, and the crew decides.
   */
  async setActive(id: string, dto: SetActiveDto, actor: ReferralActor) {
    const existing = await this.findById(id);
    if (existing.is_active === dto.isActive) return existing;
    // Inactive rows are outside the active-name index, so a same-named hospital may exist by now.
    if (dto.isActive) await this.assertNoDuplicate(existing.name, existing.municipality, null, id);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.facility.update({
          where: { id },
          data: { is_active: dto.isActive, updated_at: new Date() },
        });
        await this.audit.logInTransaction(tx, {
          action: AuditAction.UPDATE,
          actorId: actor.id,
          entityType: 'facility',
          entityId: id,
          moduleId: 'MOD-39',
          oldValues: { is_active: existing.is_active },
          newValues: { is_active: dto.isActive, reason: dto.reason ?? null },
        });
        return row;
      });
      if (!dto.isActive) await this.transport.notifyFacilityChanged(id, 'deactivated');
      return toFacilityView(updated);
    } catch (error) {
      this.rethrowDuplicate(error);
    }
  }

  private assertValidLocation(latitude: number, longitude: number): void {
    if (!isCoordinateInServiceArea(latitude, longitude)) {
      if (looksSwapped(latitude, longitude)) {
        throw new UnprocessableEntityException({
          code: 'COORDINATES_LIKELY_SWAPPED',
          message: 'The latitude and longitude appear to be reversed.',
          suggested: { latitude: longitude, longitude: latitude },
        });
      }
      throw new UnprocessableEntityException({
        code: 'COORDINATES_OUT_OF_SERVICE_AREA',
        message: 'The facility coordinates are outside the configured service area.',
      });
    }
  }

  private async assertNoDuplicate(
    name: string,
    municipality?: string | null,
    sourceRef?: string | null,
    excludeId?: string,
  ): Promise<void> {
    // Mirrors the DB unique indexes: lower(name) + lower(coalesce(municipality, '')) among
    // active hospitals, and location_source_ref across all facilities. The ref alone is the
    // place: a 'nominatim' pick of a 'manual+osm-crosscheck' hospital is the same hospital.
    const sameMunicipality: Prisma.FacilityWhereInput = municipality
      ? { municipality: { equals: municipality, mode: 'insensitive' } }
      : { OR: [{ municipality: null }, { municipality: '' }] };
    const duplicate = await this.prisma.facility.findFirst({
      where: {
        ...(excludeId && { id: { not: excludeId } }),
        OR: [
          {
            is_active: true,
            facility_type: 'HOSPITAL',
            name: { equals: name, mode: 'insensitive' },
            ...sameMunicipality,
          },
          ...(sourceRef ? [{ location_source_ref: sourceRef }] : []),
        ],
      },
      select: { id: true, name: true },
    });
    if (duplicate) {
      throw new ConflictException({
        code: 'DUPLICATE_FACILITY',
        existingFacilityId: duplicate.id,
        existingName: duplicate.name,
      });
    }
  }

  /**
   * The shared directory hides PENDING_REVIEW and REJECTED hospitals. With
   * `includeUnreviewed`, reviewers see all of them and an Org Administrator sees
   * only their own organizations' ones; every other role is unaffected.
   */
  private async reviewVisibility(
    actor: ReferralActor | undefined,
    includeUnreviewed: boolean,
  ): Promise<Prisma.FacilityWhereInput> {
    const reviewed: Prisma.FacilityWhereInput = { location_status: { notIn: UNREVIEWED_STATUSES } };
    if (!includeUnreviewed || !actor) return reviewed;
    if (LOCATION_REVIEWERS.includes(actor.role)) return {};
    if (actor.role === UserRole.ORG_ADMINISTRATOR) {
      return { OR: [reviewed, { organization_id: { in: await activeMemberOrgIds(this.prisma, actor.id) } }] };
    }
    return reviewed;
  }

  private rethrowDuplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({ code: 'DUPLICATE_FACILITY', message: 'A matching hospital already exists.' });
    }
    throw error;
  }

  /** Open transports to this hospital get transport_updated and a new route (plan §12). Never throws. */
  private async onFacilityLocationChanged(facilityId: string): Promise<void> {
    await this.transport.notifyFacilityChanged(facilityId, 'moved');
  }

  async createReferral(
    hospitalId: string,
    dto: CreateReferralDto,
    userId: string,
  ) {
    const [hospital, incident] = await Promise.all([
      this.prisma.facility.findFirst({
        where: { id: hospitalId, facility_type: 'HOSPITAL', is_active: true },
        include: { facility_capabilities: true },
      }),
      this.prisma.incident.findUnique({ where: { id: dto.incidentId } }),
    ]);
    if (!hospital) throw new NotFoundException('Hospital not found');
    if (!incident) throw new NotFoundException('Incident not found');
    const terminal = new Set<IncidentStatus>([
      IncidentStatus.CLOSED,
      IncidentStatus.CANCELLED,
      IncidentStatus.FALSE_ALERT,
      IncidentStatus.DUPLICATE,
    ]);
    if (terminal.has(incident.status as IncidentStatus)) {
      throw new BadRequestException('A terminal incident cannot receive a hospital referral.');
    }
    if (dto.dispatchId) {
      const dispatch = await this.prisma.dispatches.findUnique({ where: { id: dto.dispatchId } });
      if (!dispatch) throw new NotFoundException('Dispatch not found');
      if (dispatch.incident_id !== dto.incidentId) {
        throw new BadRequestException('Dispatch does not belong to this incident.');
      }
    }
    if (dto.patientId) {
      const patient = await this.prisma.incident_patients.findUnique({ where: { id: dto.patientId } });
      if (!patient || patient.incident_id !== dto.incidentId) {
        throw new BadRequestException('Patient does not belong to this incident.');
      }
    }
    const pending = await this.prisma.facility_referrals.findFirst({
      where: {
        incident_id: dto.incidentId,
        facility_id: hospitalId,
        acknowledgment_status: 'PENDING',
        patient_arrived_at: null,
      },
    });
    if (pending) {
      throw new ConflictException('A pending referral already exists for this incident and hospital.');
    }

    const referral = await this.prisma.facility_referrals.create({
      data: {
        facility_id: hospitalId,
        incident_id: dto.incidentId,
        dispatch_id: dto.dispatchId ?? null,
        patient_id: dto.patientId ?? null,
        coordinated_by_id: userId,
        pre_arrival_notes: dto.preArrivalNotes ?? null,
        eta_minutes: dto.etaMinutes ?? null,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE,
      actorId: userId,
      entityId: referral.id,
      entityType: 'facility_referral',
      moduleId: 'MOD-38',
      incidentId: dto.incidentId,
      newValues: { facilityId: hospitalId, etaMinutes: dto.etaMinutes ?? null },
    });

    if (hospital.organization_id) {
      const members = await this.prisma.organization_memberships.findMany({
        where: { organization_id: hospital.organization_id, is_active: true },
        select: { user_id: true },
      });
      await Promise.all(members.map((member) => this.notifications.create({
          userId: member.user_id,
          eventType: 'HOSPITAL_REFERRAL_CREATED',
          title: 'New hospital referral',
          body: `A patient referral has been sent to ${hospital.name}.`,
          incidentId: dto.incidentId,
          dataPayload: { referralId: referral.id, facilityId: hospitalId },
        }).catch((error: unknown) => {
          this.logger.warn(`Hospital referral notification failed: ${String(error)}`);
        })));
    }

    return referral;
  }

  async findReferrals(hospitalId: string, actor: ReferralActor) {
    await this.assertHospitalAccess(hospitalId, actor);
    return this.prisma.facility_referrals.findMany({
      where: { facility_id: hospitalId },
      orderBy: { created_at: 'desc' },
    });
  }

  /** A hospital user sees only the referrals sent to their own hospital. */
  async findIncidentReferrals(incidentId: string, actor: ReferralActor) {
    const ownOrgs = actor.role === UserRole.HOSPITAL_USER ? await activeMemberOrgIds(this.prisma, actor.id) : null;
    return this.prisma.facility_referrals.findMany({
      where: {
        incident_id: incidentId,
        ...(ownOrgs && { facilities: { organization_id: { in: ownOrgs } } }),
      },
      include: { facilities: { select: { id: true, name: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async findReferral(refId: string) {
    const referral = await this.prisma.facility_referrals.findUnique({
      where: { id: refId },
    });
    if (!referral) throw new NotFoundException('Referral not found');
    return referral;
  }

  async findReferralFor(refId: string, actor: ReferralActor) {
    const referral = await this.findReferral(refId);
    await this.assertHospitalAccess(referral.facility_id, actor);
    return referral;
  }

  async acknowledgeReferral(refId: string, actor: ReferralActor) {
    const referral = await this.findReferralFor(refId, actor);
    if (referral.patient_arrived_at) {
      throw new BadRequestException('The patient has already arrived.');
    }
    const updated = await this.prisma.facility_referrals.update({
      where: { id: refId },
      data: { acknowledgment_status: 'ACKNOWLEDGED', acknowledged_at: new Date(), updated_at: new Date() },
    });
    await this.auditReferral(AuditAction.UPDATE, actor, referral, {
      acknowledgment_status: 'ACKNOWLEDGED',
      acknowledged_at: updated.acknowledged_at?.toISOString() ?? null,
    });
    return updated;
  }

  async markArrived(refId: string, actor: ReferralActor) {
    const referral = await this.findReferralFor(refId, actor);
    if (referral.patient_arrived_at) {
      throw new BadRequestException('Arrival is already recorded for this referral.');
    }
    const updated = await this.prisma.facility_referrals.update({
      where: { id: refId },
      data: { patient_arrived_at: new Date(), updated_at: new Date() },
    });
    await this.auditReferral(AuditAction.UPDATE, actor, referral, {
      patient_arrived_at: updated.patient_arrived_at?.toISOString() ?? null,
    });
    return updated;
  }

  /** Hospital users act only on hospitals whose organization they belong to. */
  private async assertHospitalAccess(facilityId: string, actor: ReferralActor) {
    if (actor.role !== UserRole.HOSPITAL_USER) return;
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
      select: { organization_id: true },
    });
    const ownOrgs = await activeMemberOrgIds(this.prisma, actor.id);
    if (!facility?.organization_id || !ownOrgs.includes(facility.organization_id)) {
      throw new ForbiddenException('This referral belongs to another hospital.');
    }
  }

  private async auditReferral(
    action: AuditAction,
    actor: ReferralActor,
    referral: { id: string; incident_id: string; acknowledgment_status: string | null; patient_arrived_at: Date | null },
    newValues: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      actorId: actor.id,
      entityId: referral.id,
      entityType: 'facility_referral',
      moduleId: 'MOD-38',
      incidentId: referral.incident_id,
      oldValues: {
        acknowledgment_status: referral.acknowledgment_status,
        patient_arrived_at: referral.patient_arrived_at?.toISOString() ?? null,
      },
      newValues,
    });
  }
}

export interface ReferralActor {
  id: string;
  role: string;
}
