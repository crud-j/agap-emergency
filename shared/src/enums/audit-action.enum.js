"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditAction = void 0;
/** Matches the PostgreSQL audit_action enum exactly. */
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["READ"] = "READ";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    AuditAction["STATUS_CHANGE"] = "STATUS_CHANGE";
    AuditAction["DISPATCH"] = "DISPATCH";
    AuditAction["ESCALATE"] = "ESCALATE";
    AuditAction["PUBLISH"] = "PUBLISH";
    AuditAction["SUBSCRIBE"] = "SUBSCRIBE";
    AuditAction["UNSUBSCRIBE"] = "UNSUBSCRIBE";
    AuditAction["CONSENT_GRANT"] = "CONSENT_GRANT";
    AuditAction["CONSENT_WITHDRAW"] = "CONSENT_WITHDRAW";
    AuditAction["DATA_EXPORT"] = "DATA_EXPORT";
    AuditAction["SYSTEM"] = "SYSTEM";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
//# sourceMappingURL=audit-action.enum.js.map