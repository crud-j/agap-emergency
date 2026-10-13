# MODULE DOCUMENTATION

---

**System:** AGAP — A GPS-Based Mobile Emergency Alert System for Immediate Hospital Ambulance Dispatch
**Module ID:** MOD-53
**Module Name:** Municipal Announcements and Public Broadcast
**Prepared By:** Justine R. Soliman
**Context:** Bocaue, Bulacan MDRRMO / LGU Operations Center

---
## 1. Module Identification

- **Module Name:** Municipal Announcements and Public Broadcast
- **Module ID:** MOD-53
- **Version:** 1.0
- **Date Created / Updated:** September 15, 2026 / initial detailed specification
- **Module Owner:** AGAP product and operations team, with operational ownership assigned to the Bocaue MDRRMO/LGU Communications Office
- **Related System:** AGAP

## 2. Purpose / Objective

Provides the Bocaue municipality and its MDRRMO with a structured, reliable channel to broadcast official announcements — such as class suspensions, forced evacuations, flood alerts, road closures, and post-disaster community updates — directly to both registered AGAP users and unregistered citizens via SMS and push notification.

The module exists to ensure that critical public information reaches the widest possible audience, including residents who have not registered with AGAP, using the same dual-path (data and SMS) transmission infrastructure the rest of the system relies on.

## 3. Scope

### In Scope

- Composing and publishing official announcements from authorized LGU/MDRRMO staff.
- Targeting announcements by scope (municipality-wide, barangay-specific, or category-specific).
- Delivering announcements via push notification to registered users and SMS to all subscribers.
- Allowing unregistered citizens to subscribe to SMS announcements using their phone number only.
- Displaying a public announcements feed accessible without login.
- Scheduling announcements for future publication.
- Archiving all past announcements for public reference.

### Out of Scope

- Two-way communication or citizen replies to announcements.
- Announcements from unauthorized sources or private organizations.
- Clinical or emergency dispatch functions — this module is for broadcast information only, not emergency alert triggering.

### Module Boundary

Only users with the Announcements Publisher role (LGU/MDRRMO Communications staff) may create and publish announcements. All citizens — registered or unregistered — may read and subscribe.

## 4. Users and Roles

| Role | Typical Permission |
|---|---|
| Citizen / Registered User | Read announcements feed, receive push notifications, manage notification preferences |
| Unregistered Citizen / Guest | Read public announcements feed, subscribe via phone number for SMS |
| Announcements Publisher (LGU/MDRRMO Staff) | Compose, schedule, publish, and archive announcements |
| MDRRMO Administrator | Manage publisher accounts and system-wide announcement settings |
| System Administrator | Platform-level configuration only |

## 5. Main Features / Functionalities

### Functional Feature Set

- Announcement composition with title, body, category, and severity level.
- Barangay and municipality scope targeting.
- Scheduled and immediate publication.
- Push notification delivery to registered users.
- SMS broadcast to all SMS subscribers including unregistered citizens.
- Unregistered citizen SMS opt-in subscription via phone number.
- Public announcements feed (no login required).
- Announcement categories: class suspension, flood alert, evacuation order, road closure, fire advisory, post-disaster update, general information.
- Severity levels: informational, advisory, warning, critical.
- Announcement archive with search and filter.
- Delivery status tracking per channel.

### Detailed Functional Behavior

- **Create/receive:** accepts announcement inputs only from users with the Publisher role.
- **Validate:** checks required fields (title, body, category, severity, scope) before publishing.
- **Persist:** stores the announcement with a unique ID, publisher identity, and timestamp.
- **Notify:** delivers via push notification (registered users) and SMS (all subscribers) simultaneously.
- **Recover:** if a delivery channel fails, retries according to the same retry logic used by MOD-17.
- **Audit:** records all publish, edit, and archive actions in the audit trail (MOD-46).

## 6. Process Flow / Workflow

### Normal Flow

Publisher composes announcement and selects scope, category, and severity. Publisher chooses immediate or scheduled publication. On publish, the system simultaneously sends push notifications to all registered users within the targeted scope and SMS to all phone-number subscribers in that scope. The announcement appears on the public feed immediately. Delivery status is tracked per channel.

### Exception Flow

1. If a required field is missing, publication is blocked and the missing field is identified.
2. If SMS delivery fails for a subscriber, the system retries using exponential backoff.
3. If push notification delivery fails, the notification is queued and retried.
4. If a scheduled announcement is due but the system is temporarily unavailable, it publishes at the next available opportunity and logs the delay.
5. If an unauthorized user attempts to publish, the action is denied and logged.

## 7. Inputs

- Announcement title.
- Announcement body text.
- Category (class suspension, flood alert, evacuation order, road closure, fire advisory, post-disaster update, general information).
- Severity level (informational, advisory, warning, critical).
- Target scope (municipality-wide, specific barangay list).
- Publication time (immediate or scheduled).
- Publisher identity (from authenticated session).

### Input Validation

- Title and body are required and must not be empty.
- Category and severity must be selected from defined enumerated lists.
- Scheduled publication time must be in the future.
- Target scope must include at least one valid selection.

## 8. Outputs / Results

- A persisted announcement record with unique ID.
- Push notifications delivered to all registered users within scope.
- SMS messages delivered to all phone-number subscribers within scope.
- A public feed entry visible to all visitors without login.
- Delivery status records per channel and per recipient batch.
- Audit log entries for all publisher actions.

## 9. Business Rules

1. Only users with the Announcements Publisher role may create and publish announcements.
2. All published announcements are permanently archived and cannot be deleted — only marked as archived or superseded.
3. SMS subscriptions require only a valid Philippine mobile number — no account creation required.
4. Unregistered subscribers may opt out at any time by replying STOP to any announcement SMS.
5. Push notifications are delivered only to registered users who have granted notification permissions.
6. Critical severity announcements are delivered immediately, ignoring any scheduled time.
7. All publisher actions are recorded in the audit trail.
8. Announcement content must not include personal health data or identifiable patient information.

## 10. User Interface (Screens)

| Screen / View | Purpose |
|---|---|
| Public Announcements Feed | Shows all active announcements, accessible without login, sorted by recency and severity |
| Announcement Detail View | Full content of a single announcement with timestamp and publisher name |
| SMS Subscription Screen | Unregistered citizens enter phone number to subscribe to SMS alerts |
| Composer Screen (Publisher) | Create and schedule announcements with all required fields |
| Announcements Management Dashboard (Publisher) | View, edit, archive, and monitor delivery of past and scheduled announcements |
| Notification Preferences (Registered User) | Toggle push notification preferences by category |

### UI/UX Requirements

- The public feed must be accessible without login on both mobile and web.
- Critical severity announcements display with a high-visibility indicator (distinct color and icon — not solely color).
- The SMS subscription form must be minimal — phone number and consent only.
- The composer must show a preview of how the announcement will appear on the public feed before publishing.
- Keep emergency actions (SOS trigger) clearly separate from the announcements feed — this module is informational only.

## 11. Data Requirements

### Core Data

- `announcements` table: announcement_id (uuid PK), title (varchar), body (text), category (varchar), severity (varchar), scope_type (varchar), target_barangays (jsonb), published_at (timestamp), scheduled_at (timestamp), status (varchar), publisher_id (uuid FK), created_at (timestamp), updated_at (timestamp).
- `sms_subscribers` table: subscriber_id (uuid PK), phone_number (varchar UK), scope_preference (varchar), subscribed_at (timestamp), is_active (boolean), opted_out_at (timestamp).
- `announcement_deliveries` table: delivery_id (uuid PK), announcement_id (uuid FK), channel (varchar), recipient_batch (varchar), status (varchar), sent_at (timestamp), failed_at (timestamp), retry_count (integer).

### Data Quality

- Phone numbers are normalized to E.164 format before storage.
- Duplicate phone number subscriptions are prevented by the unique constraint on phone_number.
- Published announcements cannot be overwritten — edits create a new version linked to the original.

## 12. Integrations / Connections

### Related Functional Modules

- **MOD-17** --- Multi-Channel Emergency Transmission Gateway (reuses the same SMS and push delivery infrastructure)
- **MOD-46** --- Immutable Audit Trail (all publisher actions logged)
- **MOD-47** --- Role-Based Access Control (publisher role enforcement)
- **MOD-48** --- Privacy, Consent and Medical Data Protection (SMS subscriber data handling)
- **MOD-49** --- System Administration and Account Management (publisher account management)
- **MOD-04** --- Accessibility and Multi-Language Support (Filipino language announcements)

### Integration Rules

- This module reuses MOD-17's transmission infrastructure rather than maintaining a separate SMS or push provider integration.
- REST API handles announcement creation, scheduling, and subscriber management.
- WebSocket events (MOD-20) distribute new announcement notifications to connected web/mobile clients in real time.
- SMS opt-out processing (STOP reply) is handled via MOD-17's inbound SMS handling.

## 13. Access Control & Security

- Publisher role is enforced server-side through MOD-47.
- SMS subscriber phone numbers are classified as personal data under MOD-48 and are not exposed in any public endpoint.
- All publish, edit, and archive actions are attributed to the authenticated publisher and recorded in MOD-46.
- The public announcements feed exposes only title, body, category, severity, scope, and timestamp — no personal or operational data.

## 14. Non-Functional Requirements

- **Reliability:** announcement delivery must retry on failure using the same retry logic as MOD-17; a single channel failure must not prevent delivery on the other channel.
- **Performance:** push notifications and SMS must be dispatched within 30 seconds of a critical severity announcement being published.
- **Availability:** the public announcements feed must remain readable even if the authenticated API is temporarily unavailable.
- **Scalability:** the SMS broadcast must support municipality-wide delivery to several thousand subscribers in a single announcement event.

## 15. Error Handling

| Error | System Response |
|---|---|
| Missing required field | Publication blocked; missing field identified clearly to the publisher |
| Unauthorized publish attempt | Action denied; event logged in audit trail |
| SMS delivery failure | Retry with exponential backoff; failure recorded in delivery status |
| Push notification failure | Notification queued and retried; failure recorded in delivery status |
| Duplicate phone number subscription | Subscription accepted silently if already active; subscriber notified if previously opted out |
| Scheduled announcement missed due to outage | Published at next available opportunity; delay logged in audit trail |

## 16. Reports and Notifications

- Delivery status report per announcement (sent count, failed count, retry count) visible to the publisher on the management dashboard.
- Opt-out rate tracking for SMS subscribers.
- Announcement volume and category breakdown available in MOD-50 analytics.

## 17. Assumptions and Constraints

- Assumes the adopting municipality (Bocaue) has designated at least one authorized Announcements Publisher from the LGU/MDRRMO Communications Office before the module is activated.
- Constrained by the SMS provider's throughput limits for large broadcast batches — high-volume announcements may be delivered in batches over a short window rather than simultaneously.
- Assumes citizens are aware of the SMS subscription option through local government communication channels.

## 18. Future Enhancements

- Multi-language announcement support (English and Filipino in the same announcement).
- Automated flood alert integration with river level monitoring data for Bocaue River.
- Announcement acknowledgment tracking (registered users confirm they have read a critical announcement).
- Inter-municipality announcement sharing for region-wide disaster events.

## 19. Team Responsibility and Non-Overlap Justification

- **Assigned Member:** Justine R. Soliman
- **Purpose:** Provides the Bocaue LGU/MDRRMO with a broadcast channel for official public announcements reaching both registered and unregistered citizens.
- **Main Features:** Announcement composition and publication, push notification and SMS broadcast, unregistered citizen SMS subscription, public announcements feed.
- **Non-Overlap Justification:** This module is exclusively for one-way broadcast of official LGU/MDRRMO information. It does not handle emergency alert triggering (MOD-06), incident ticketing (MOD-14), or dispatch coordination — those remain in their respective modules. The transmission infrastructure is borrowed from MOD-17 rather than duplicated.

## 20. Acceptance Criteria

- [ ] Authorized publishers can compose and publish announcements with all required fields.
- [ ] Published announcements appear on the public feed immediately (or at scheduled time).
- [ ] Registered users within the target scope receive push notifications.
- [ ] SMS subscribers within the target scope receive SMS delivery.
- [ ] Unregistered citizens can subscribe using a phone number only (no account required).
- [ ] STOP reply successfully opts a subscriber out.
- [ ] Critical severity announcements are delivered within 30 seconds of publication.
- [ ] All publisher actions are recorded in the audit trail.
- [ ] Unauthorized publish attempts are rejected and logged.
- [ ] Delivery status is visible to the publisher per announcement.
