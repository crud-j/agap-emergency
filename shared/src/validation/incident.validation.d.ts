import { z } from 'zod';
import { IncidentType } from '../enums/incident-type.enum';
import { IncidentPriority } from '../enums/incident-priority.enum';
import { ReporterType } from '../enums/reporter-type.enum';
export declare const GuestReporterSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    type: z.ZodLiteral<ReporterType.GUEST_REPORTER>;
}, "strip", z.ZodTypeAny, {
    type: ReporterType.GUEST_REPORTER;
    name?: string | undefined;
    phone?: string | undefined;
}, {
    type: ReporterType.GUEST_REPORTER;
    name?: string | undefined;
    phone?: string | undefined;
}>;
export declare const CreateIncidentSchema: z.ZodObject<{
    type: z.ZodNativeEnum<typeof IncidentType>;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodNativeEnum<typeof IncidentPriority>>;
    lat: z.ZodOptional<z.ZodNumber>;
    lng: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodString;
    reporter: z.ZodOptional<z.ZodObject<{
        type: z.ZodNativeEnum<typeof ReporterType>;
        name: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: ReporterType;
        name?: string | undefined;
        phone?: string | undefined;
    }, {
        type: ReporterType;
        name?: string | undefined;
        phone?: string | undefined;
    }>>;
    patient: z.ZodOptional<z.ZodObject<{
        isReporter: z.ZodBoolean;
        name: z.ZodOptional<z.ZodString>;
        age: z.ZodOptional<z.ZodNumber>;
        sex: z.ZodOptional<z.ZodEnum<["male", "female", "other", "unknown"]>>;
        isUnknown: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        isReporter: boolean;
        isUnknown: boolean;
        name?: string | undefined;
        age?: number | undefined;
        sex?: "unknown" | "male" | "female" | "other" | undefined;
    }, {
        isReporter: boolean;
        name?: string | undefined;
        age?: number | undefined;
        sex?: "unknown" | "male" | "female" | "other" | undefined;
        isUnknown?: boolean | undefined;
    }>>;
    affectedCount: z.ZodOptional<z.ZodString>;
    hazards: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    responseNeeds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: IncidentType;
    idempotencyKey: string;
    description?: string | undefined;
    priority?: IncidentPriority | undefined;
    lat?: number | undefined;
    lng?: number | undefined;
    address?: string | undefined;
    reporter?: {
        type: ReporterType;
        name?: string | undefined;
        phone?: string | undefined;
    } | undefined;
    patient?: {
        isReporter: boolean;
        isUnknown: boolean;
        name?: string | undefined;
        age?: number | undefined;
        sex?: "unknown" | "male" | "female" | "other" | undefined;
    } | undefined;
    affectedCount?: string | undefined;
    hazards?: string[] | undefined;
    responseNeeds?: string[] | undefined;
}, {
    type: IncidentType;
    idempotencyKey: string;
    description?: string | undefined;
    priority?: IncidentPriority | undefined;
    lat?: number | undefined;
    lng?: number | undefined;
    address?: string | undefined;
    reporter?: {
        type: ReporterType;
        name?: string | undefined;
        phone?: string | undefined;
    } | undefined;
    patient?: {
        isReporter: boolean;
        name?: string | undefined;
        age?: number | undefined;
        sex?: "unknown" | "male" | "female" | "other" | undefined;
        isUnknown?: boolean | undefined;
    } | undefined;
    affectedCount?: string | undefined;
    hazards?: string[] | undefined;
    responseNeeds?: string[] | undefined;
}>;
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>;
//# sourceMappingURL=incident.validation.d.ts.map