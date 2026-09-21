"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIORITY_WEIGHTS = exports.IncidentPriority = void 0;
var IncidentPriority;
(function (IncidentPriority) {
    IncidentPriority["CRITICAL"] = "CRITICAL";
    IncidentPriority["HIGH"] = "HIGH";
    IncidentPriority["MEDIUM"] = "MEDIUM";
    IncidentPriority["LOW"] = "LOW";
})(IncidentPriority || (exports.IncidentPriority = IncidentPriority = {}));
exports.PRIORITY_WEIGHTS = {
    [IncidentPriority.CRITICAL]: 4,
    [IncidentPriority.HIGH]: 3,
    [IncidentPriority.MEDIUM]: 2,
    [IncidentPriority.LOW]: 1,
};
//# sourceMappingURL=incident-priority.enum.js.map