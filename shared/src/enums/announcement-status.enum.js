"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnnouncementStatus = void 0;
/**
 * Municipal announcements are a one-way broadcast system.
 * They are completely separate from emergency incident records.
 */
var AnnouncementStatus;
(function (AnnouncementStatus) {
    AnnouncementStatus["DRAFT"] = "DRAFT";
    AnnouncementStatus["REVIEW"] = "REVIEW";
    AnnouncementStatus["APPROVED"] = "APPROVED";
    AnnouncementStatus["PUBLISHED"] = "PUBLISHED";
    AnnouncementStatus["EXPIRED"] = "EXPIRED";
    AnnouncementStatus["ARCHIVED"] = "ARCHIVED";
})(AnnouncementStatus || (exports.AnnouncementStatus = AnnouncementStatus = {}));
//# sourceMappingURL=announcement-status.enum.js.map