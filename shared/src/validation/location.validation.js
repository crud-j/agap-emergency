"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoPointSchema = void 0;
const zod_1 = require("zod");
exports.GeoPointSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    accuracy: zod_1.z.number().positive().optional(),
});
//# sourceMappingURL=location.validation.js.map