"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateIncidentSchema = exports.GuestReporterSchema = void 0;
const zod_1 = require("zod");
const incident_type_enum_1 = require("../enums/incident-type.enum");
const incident_priority_enum_1 = require("../enums/incident-priority.enum");
const reporter_type_enum_1 = require("../enums/reporter-type.enum");
exports.GuestReporterSchema = zod_1.z.object({
    name: zod_1.z.string().max(100).optional(),
    phone: zod_1.z.string().max(20).optional(),
    type: zod_1.z.literal(reporter_type_enum_1.ReporterType.GUEST_REPORTER),
});
exports.CreateIncidentSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(incident_type_enum_1.IncidentType),
    description: zod_1.z.string().max(1000).optional(),
    priority: zod_1.z.nativeEnum(incident_priority_enum_1.IncidentPriority).optional(),
    lat: zod_1.z.number().min(-90).max(90).optional(),
    lng: zod_1.z.number().min(-180).max(180).optional(),
    address: zod_1.z.string().max(500).optional(),
    idempotencyKey: zod_1.z.string().uuid(),
    reporter: zod_1.z
        .object({
        type: zod_1.z.nativeEnum(reporter_type_enum_1.ReporterType),
        name: zod_1.z.string().max(100).optional(),
        phone: zod_1.z.string().max(20).optional(),
    })
        .optional(),
    patient: zod_1.z
        .object({
        isReporter: zod_1.z.boolean(),
        name: zod_1.z.string().max(100).optional(),
        age: zod_1.z.number().int().min(0).max(150).optional(),
        sex: zod_1.z.enum(['male', 'female', 'other', 'unknown']).optional(),
        isUnknown: zod_1.z.boolean().default(false),
    })
        .optional(),
});
//# sourceMappingURL=incident.validation.js.map