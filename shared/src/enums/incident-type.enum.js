"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncidentType = void 0;
/** Matches the PostgreSQL incident_category enum exactly. */
var IncidentType;
(function (IncidentType) {
    IncidentType["MEDICAL"] = "MEDICAL";
    IncidentType["ROAD_ACCIDENT"] = "ROAD_ACCIDENT";
    IncidentType["FLOOD"] = "FLOOD";
    IncidentType["RESCUE"] = "RESCUE";
    IncidentType["FIRE"] = "FIRE";
    IncidentType["INDUSTRIAL"] = "INDUSTRIAL";
    IncidentType["DEBRIS"] = "DEBRIS";
    IncidentType["OTHER"] = "OTHER";
})(IncidentType || (exports.IncidentType = IncidentType = {}));
//# sourceMappingURL=incident-type.enum.js.map