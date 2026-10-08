import { z } from 'zod';
import { IncidentType } from '../enums/incident-type.enum';
import { IncidentPriority } from '../enums/incident-priority.enum';
import { ReporterType } from '../enums/reporter-type.enum';

export const GuestReporterSchema = z.object({
  name: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  type: z.literal(ReporterType.GUEST_REPORTER),
});

export const CreateIncidentSchema = z.object({
  type: z.nativeEnum(IncidentType),
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
});

export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
