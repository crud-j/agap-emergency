import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { AuditService } from '../../audit/audit.service';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';

/**
 * MOD-37 — On-Scene Patient Assessment.
 *
 * Persists a responder's on-scene findings. Every field is optional: missing
 * vitals/notes must never block submission (CLAUDE.md reliability rule — missing
 * medical info never stops dispatch/response). After the write commits it audits
 * (MOD-46) and emits incident.assessment_updated so the ops dashboard sees it live.
 */
@Injectable()
export class AssessmentService {
  private readonly logger = new Logger(AssessmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async submit(incidentId: string, dto: SubmitAssessmentDto, responderId: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);
    // Only a crew member of an active dispatch on this incident assesses its patients.
    const crewed = await this.prisma.dispatches.findFirst({
      where: {
        incident_id: incidentId,
        dispatch_crew: { some: { user_id: responderId } },
        status: { in: ['PENDING', 'SENT', 'ACCEPTED'] as any[] },
      },
      select: { id: true },
    });
    if (!crewed) throw new ForbiddenException('You are not on an active crew for this incident.');
    // During a surge the START tag also goes on the surge's triage board (MOD-52).
    const surge = dto.triageTag
      ? await this.prisma.surge_incidents.findFirst({
          where: { status: 'ACTIVE' },
          orderBy: { activated_at: 'desc' },
          select: { id: true },
        })
      : null;

    const v = dto.vitals ?? {};

    const { assessment, triageTag } = await this.prisma.$transaction(async (tx) => {
      let triageTag: { id: string; surge_id: string } | null = null;
      const created = await tx.on_scene_assessments.create({
        data: {
          incident_id: incidentId,
          assessed_by_id: responderId,
          patient_id: dto.patientId ?? null,
          dispatch_id: dto.dispatchId ?? null,
          consciousness_state: (dto.consciousnessState as any) ?? null,
          breathing_status: (dto.breathingStatus as any) ?? null,
          blood_pressure_sys: v.bloodPressureSys ?? null,
          blood_pressure_dia: v.bloodPressureDia ?? null,
          pulse_bpm: v.pulseBpm ?? null,
          respiratory_rate: v.respiratoryRate ?? null,
          temperature_celsius: v.temperatureCelsius ?? null,
          oxygen_saturation: v.oxygenSaturation ?? null,
          gcs_score: v.gcsScore ?? null,
          visible_injuries: dto.visibleInjuries ?? [],
          interventions: dto.interventions ?? [],
          triage_tag: dto.triageTag ?? null,
          assessment_notes: dto.notes ?? null,
        },
      });

      if (surge && dto.triageTag) {
        triageTag = await tx.triage_tags.create({
          data: {
            surge_id: surge.id,
            incident_id: incidentId,
            patient_id: dto.patientId ?? null,
            triage_color: dto.triageTag,
            triage_notes: dto.notes ?? null,
            tagged_by_id: responderId,
          },
        });
        await tx.incident.update({
          where: { id: incidentId },
          data: { surge_incident_id: surge.id, is_surge_incident: true },
        });
      }
      // number_of_patients lives on the incident record, not the assessment.
      if (dto.numberOfPatients != null) {
        await tx.incident.update({
          where: { id: incidentId },
          data: { number_of_patients: dto.numberOfPatients },
        });
      }

      return { assessment: created, triageTag };
    });

    // Immutable audit trail (MOD-46) — best-effort, never blocks the write.
    try {
      await this.audit.log({
        action: 'CREATE',
        actorId: responderId,
        entityType: 'on_scene_assessment',
        entityId: assessment.id,
        moduleId: 'MOD-37',
        incidentId,
        newValues: {
          consciousnessState: assessment.consciousness_state,
          breathingStatus: assessment.breathing_status,
          numberOfPatients: dto.numberOfPatients ?? incident.number_of_patients,
          ...(dto.triageTag && { triageTag: dto.triageTag, surgeId: surge?.id ?? null }),
        },
      });
    } catch (err) {
      this.logger.warn(`Audit log failed for assessment ${assessment.id}: ${String(err)}`);
    }

    // Distribute to the ops dashboard + incident room (best-effort).
    try {
      this.realtime.assessmentUpdated(incidentId, {
        assessmentId: assessment.id,
        consciousnessState: assessment.consciousness_state,
        breathingStatus: assessment.breathing_status,
        numberOfPatients: dto.numberOfPatients ?? incident.number_of_patients,
        assessedAt: assessment.assessed_at.toISOString(),
        assessedById: responderId,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for assessment_updated: ${String(err)}`);
    }

    // Live surge triage board (MOD-52): the responder app files START tags here.
    if (triageTag) {
      this.realtime.triageTagUpdated({ surgeId: triageTag.surge_id, tagId: triageTag.id });
    }

    return assessment;
  }
}
