import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

    const v = dto.vitals ?? {};

    const assessment = await this.prisma.$transaction(async (tx) => {
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

      // number_of_patients lives on the incident record, not the assessment.
      if (dto.numberOfPatients != null) {
        await tx.incident.update({
          where: { id: incidentId },
          data: { number_of_patients: dto.numberOfPatients },
        });
      }

      return created;
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

    return assessment;
  }
}
