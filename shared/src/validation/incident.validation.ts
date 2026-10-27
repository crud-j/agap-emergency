import { z } from 'zod';
import { IncidentType } from '../enums/incident-type.enum';
import { IncidentPriority } from '../enums/incident-priority.enum';
import { ReporterType } from '../enums/reporter-type.enum';
import { LANDMARK_MAX_LENGTH, ReporterStatus } from '../constants/incident-intake';

export const GuestReporterSchema = z.object({
  name: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  type: z.literal(ReporterType.GUEST_REPORTER),
});

export const CreateIncidentSchema = z.object({
  type: z.nativeEnum(IncidentType),
  triggerMethod: z.enum(['SOS_BUTTON', 'SHAKE_GESTURE', 'MANUAL_REPORT']).optional(),
  description: z.string().max(1000).optional(),
  priority: z.nativeEnum(IncidentPriority).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid(),
  reporter: z
    .object({
      type: z.nativeEnum(ReporterType),
      name: z.string().max(100).optional(),
      phone: z.string().max(20).optional(),
    })
    .optional(),
  patient: z
    .object({
      isReporter: z.boolean(),
      name: z.string().max(100).optional(),
      age: z.number().int().min(0).max(150).optional(),
      sex: z.enum(['male', 'female', 'other', 'unknown']).optional(),
      isUnknown: z.boolean().default(false),
    })
    .optional(),
  affectedCount: z.string().max(20).optional(),
  hazards: z.array(z.string().max(200)).max(20).optional(),
  responseNeeds: z.array(z.string().max(100)).max(10).optional(),
  /** Structured caller answers (MOD-09); the backend re-validates them against the intake catalog. */
  intake: z
    .object({
      answers: z.record(z.array(z.string().max(40)).max(10)).optional(),
      reporterStatus: z.nativeEnum(ReporterStatus).optional(),
      landmark: z.string().max(LANDMARK_MAX_LENGTH).optional(),
    })
    .optional(),
});

export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
