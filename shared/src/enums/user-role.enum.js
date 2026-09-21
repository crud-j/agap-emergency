"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRole = void 0;
/** Matches the PostgreSQL user_role enum exactly. */
var UserRole;
(function (UserRole) {
    UserRole["CITIZEN"] = "CITIZEN";
    UserRole["BYSTANDER"] = "BYSTANDER";
    UserRole["DISPATCHER"] = "DISPATCHER";
    UserRole["SUPERVISOR"] = "SUPERVISOR";
    UserRole["RESPONDER"] = "RESPONDER";
    UserRole["HOSPITAL_USER"] = "HOSPITAL_USER";
    UserRole["ORG_ADMINISTRATOR"] = "ORG_ADMINISTRATOR";
    UserRole["ANNOUNCEMENTS_PUBLISHER"] = "ANNOUNCEMENTS_PUBLISHER";
    UserRole["SYSTEM_ADMINISTRATOR"] = "SYSTEM_ADMINISTRATOR";
})(UserRole || (exports.UserRole = UserRole = {}));
//# sourceMappingURL=user-role.enum.js.map