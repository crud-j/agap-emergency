"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INCIDENT_STATUS_TRANSITIONS = exports.TERMINAL_INCIDENT_STATUSES = exports.IncidentStatus = void 0;
var IncidentStatus;
(function (IncidentStatus) {
    IncidentStatus["DRAFT"] = "DRAFT";
    IncidentStatus["SUBMITTED"] = "SUBMITTED";
    IncidentStatus["RECEIVED"] = "RECEIVED";
    IncidentStatus["ACKNOWLEDGED"] = "ACKNOWLEDGED";
    IncidentStatus["ASSESSED"] = "ASSESSED";
    IncidentStatus["DISPATCH_PENDING"] = "DISPATCH_PENDING";
    IncidentStatus["DISPATCHED"] = "DISPATCHED";
    IncidentStatus["EN_ROUTE"] = "EN_ROUTE";
    IncidentStatus["ON_SCENE"] = "ON_SCENE";
    IncidentStatus["TRANSPORTING"] = "TRANSPORTING";
    IncidentStatus["ASSISTING"] = "ASSISTING";
    IncidentStatus["RESOLVED"] = "RESOLVED";
    IncidentStatus["CLOSED"] = "CLOSED";
    IncidentStatus["CANCELLED"] = "CANCELLED";
    IncidentStatus["FALSE_ALERT"] = "FALSE_ALERT";
    IncidentStatus["DUPLICATE"] = "DUPLICATE";
    IncidentStatus["UNABLE_TO_RESPOND"] = "UNABLE_TO_RESPOND";
    IncidentStatus["REFERRED"] = "REFERRED";
})(IncidentStatus || (exports.IncidentStatus = IncidentStatus = {}));
exports.TERMINAL_INCIDENT_STATUSES = new Set([
    IncidentStatus.CLOSED,
    IncidentStatus.FALSE_ALERT,
    IncidentStatus.DUPLICATE,
    IncidentStatus.CANCELLED,
]);
exports.INCIDENT_STATUS_TRANSITIONS = {
    [IncidentStatus.DRAFT]: [IncidentStatus.SUBMITTED, IncidentStatus.CANCELLED],
    [IncidentStatus.SUBMITTED]: [IncidentStatus.RECEIVED, IncidentStatus.CANCELLED],
    [IncidentStatus.RECEIVED]: [
        IncidentStatus.ACKNOWLEDGED,
        IncidentStatus.CANCELLED,
        IncidentStatus.DUPLICATE,
    ],
    [IncidentStatus.ACKNOWLEDGED]: [
        IncidentStatus.ASSESSED,
        IncidentStatus.FALSE_ALERT,
        IncidentStatus.CANCELLED,
        IncidentStatus.DUPLICATE,
    ],
    [IncidentStatus.ASSESSED]: [
        IncidentStatus.DISPATCH_PENDING,
        IncidentStatus.FALSE_ALERT,
        IncidentStatus.CANCELLED,
        IncidentStatus.DUPLICATE,
        IncidentStatus.REFERRED,
    ],
    [IncidentStatus.DISPATCH_PENDING]: [
        IncidentStatus.DISPATCHED,
        IncidentStatus.UNABLE_TO_RESPOND,
        IncidentStatus.CANCELLED,
    ],
    [IncidentStatus.DISPATCHED]: [IncidentStatus.EN_ROUTE, IncidentStatus.UNABLE_TO_RESPOND],
    [IncidentStatus.EN_ROUTE]: [IncidentStatus.ON_SCENE, IncidentStatus.UNABLE_TO_RESPOND],
    [IncidentStatus.ON_SCENE]: [
        IncidentStatus.TRANSPORTING,
        IncidentStatus.ASSISTING,
        IncidentStatus.RESOLVED,
    ],
    [IncidentStatus.TRANSPORTING]: [IncidentStatus.RESOLVED],
    [IncidentStatus.ASSISTING]: [IncidentStatus.RESOLVED],
    [IncidentStatus.RESOLVED]: [IncidentStatus.CLOSED],
    [IncidentStatus.UNABLE_TO_RESPOND]: [IncidentStatus.DISPATCH_PENDING],
    [IncidentStatus.REFERRED]: [IncidentStatus.CLOSED],
    [IncidentStatus.CLOSED]: [],
    [IncidentStatus.CANCELLED]: [],
    [IncidentStatus.FALSE_ALERT]: [],
    [IncidentStatus.DUPLICATE]: [],
};
//# sourceMappingURL=incident-status.enum.js.map