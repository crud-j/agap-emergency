# MODULE DOCUMENTATION

---

**System:** AGAP — A GPS-Based Mobile Emergency Alert System for Immediate Hospital Ambulance Dispatch
**Module ID:** MOD-48
**Module Name:** Privacy, Consent and Medical Data Protection
**Prepared By:** Arjar Mauricio
**Context:** Bocaue, Bulacan MDRRMO / LGU Operations Center

---
## 1. Module Identification

-   **Module Name:** Privacy, Consent and Medical Data Protection
-   **Module ID:** MOD-48
-   **Version:** 1.0
-   **Date Created / Updated:** September 8, 2026 / November 6, 2026
    (PhilHealth ID data, section 21)
-   **Module Owner:** AGAP product and operations team, with operational
    ownership assigned by the adopting MDRRMO/LGU or participating
    organization
-   **Related System:** AGAP

## 2. Purpose / Objective

Protects personal, location and medical data throughout its lifecycle.

The module exists to give this capability one clear owner, predictable
behavior and a testable interface to the rest of the emergency-response
workflow. It must improve information flow and coordination without
making claims that it can guarantee network delivery, ambulance
availability, medical outcomes or faster physical travel.

## 3. Scope

### In Scope

-   Data classification - consent/authorization -
    least privilege - minimization - access
    logging - retention and secure handling.

### Out of Scope

-   Functions whose authoritative ownership belongs to another AGAP
    module.
-   Independent replacement of 911, MDRRMO/local hotlines, emergency
    personnel, clinical judgment or organizational command authority.
-   Silent modification or deletion of historical operational records.

### Module Boundary

Exact legal/organizational retention and consent requirements must be
confirmed with the adopting organization.

## 4. Users and Roles

The following role model applies subject to the specific permissions
defined by MOD-47.

  -----------------------------------------------------------------------
  Role                                Typical Permission
  ----------------------------------- -----------------------------------
  Citizen / Registered User           Use citizen-facing functions and
                                      view permitted personal/incident
                                      information.

  Guest / Bystander Reporter          Submit an emergency through the
                                      guest path without a pre-existing
                                      account.

  Dispatcher / Operations Center      Receive, validate, triage,
  Staff                               coordinate and monitor incidents
                                      within assigned authority.

  Supervisor / Incident Commander     Review, approve, override, escalate
                                      and coordinate according to
                                      organizational authority.

  Responder / Ambulance Crew          Accept assignments, update response
                                      status and perform authorized field
                                      functions.

  Hospital / Receiving Facility User  Coordinate receiving and transport
                                      information within facility scope.

  Organization / MDRRMO Administrator Manage organization-scoped users,
                                      resources and configuration.

  System Administrator                Manage system-wide
                                      accounts/configuration where
                                      explicitly authorized.
  -----------------------------------------------------------------------

## 5. Main Features / Functionalities

### Functional Feature Set

-   Data classification.
-   Consent/authorization.
-   Least privilege.
-   Minimization.
-   Access logging.
-   Retention and secure handling..

### Detailed Functional Behavior

-   **Create/receive:** accepts only inputs permitted for the actor and
    source.
-   **Validate:** applies client-side usability checks and authoritative
    server-side validation.
-   **Persist:** stores the authoritative result with identifiers and
    timestamps.
-   **Notify:** emits operational notifications/events when a state
    change requires downstream action.
-   **Recover:** handles connectivity/provider failure without falsely
    reporting success.
-   **Audit:** records consequential changes, access and administrative
    actions where required.

## 6. Process Flow / Workflow

### Normal Flow

Classify → collect/use for purpose → authorize disclosure → log access →
retain/delete under policy.

### Exception Flow

1.  If a required input is missing, the affected operation is blocked
    and the missing field is clearly identified.
2.  If connectivity is unavailable, the operation uses the applicable
    offline queue or is marked pending/unavailable; the UI must not
    claim successful delivery without acknowledgement.
3.  If an external service fails, the AGAP source-of-truth record is
    preserved and the external result is retried or marked failed.
4.  If authorization fails, the operation is denied and the
    security/audit layer records the event when applicable.
5.  If conflicting or duplicate data is detected, the system uses a
    controlled resolution process instead of silently overwriting
    history.

## 7. Inputs

-   Consent/authorization.
-   Classification.
-   Access decisions.
-   Retention policy.
-   Sensitive access events..

### Input Validation

-   Required fields are validated before commit.
-   Enumerated states, identifiers and timestamps are validated
    server-side.
-   References to users, incidents, organizations, units and facilities
    are checked for existence and authorization.
-   Optional emergency information must remain optional and must not
    delay initial alert creation.

## 8. Outputs / Results

-   A persistent record or state change owned by the module.
-   A unique identifier or correlation identifier where the capability
    creates a record.
-   A success, pending, failed, denied or unavailable result appropriate
    to the operation.
-   Authorized real-time events for dependent clients when applicable.
-   Audit events for consequential actions where required.

## 9. Business Rules

1.  The module has one authoritative responsibility and does not
    duplicate another module's source-of-truth data.
2.  Emergency-critical workflows prioritize rapid creation and
    transmission over optional enrichment.
3.  Authorization is checked on the server for protected operations.
4.  Consequential actions are attributable to an authenticated user or
    service identity, except explicitly designed guest emergency
    submission.
5.  Data whose freshness matters includes timestamps and, where
    relevant, stale/offline indicators.
6.  Historical records are preserved when required for accountability,
    analytics or audit.
7.  Automated recommendations remain advisory unless an adopting
    organization explicitly authorizes a specific automation policy.

## 10. User Interface (Screens)

  -----------------------------------------------------------------------
  Screen / View                       Purpose
  ----------------------------------- -----------------------------------
  Primary Module Screen               Performs the main function for the
                                      current role.

  Detail / Status View                Shows current state, relevant
                                      fields, timestamps and permitted
                                      actions.

  Confirmation / Error View           Confirms success or explains
                                      recovery steps without technical
                                      jargon.

  Operations View (where applicable)  Gives authorized dispatch/command
                                      users the information required to
                                      act.
  -----------------------------------------------------------------------

### UI/UX Requirements

-   Keep emergency actions prominent and minimize unnecessary typing.
-   Use consistent terminology across mobile, responder and Operations
    Center interfaces.
-   Use status labels/icons in addition to color.
-   Show last-updated or stale state whenever data freshness affects a
    decision.
-   Support accessible touch targets, readable text and localization.
-   Do not reveal restricted patient, medical, contact or operational
    information in screens outside the user's scope.

## 11. Data Requirements

### Core Data

-   Primary record/state required for the Privacy, Consent and Medical
    Data Protection workflow.
-   Related incident, user, organization, resource, facility or message
    identifiers as applicable.
-   Creation/update/action timestamps.
-   Controlled status and reason codes.
-   Source/actor information where operational traceability is required.

### Data Quality

-   Validate at the API/database boundary, not only in the UI.
-   Apply duplicate controls to entities intended to be unique.
-   Preserve original source/timestamps when records are merged or
    updated.
-   Classify and protect sensitive information.
-   Avoid storing unnecessary personal data.

## 12. Integrations / Connections

### Related Functional Modules

-   **MOD-14** --- Emergency Incident Record and Ticketing
-   **MOD-15** --- Incident Lifecycle State Management
-   **MOD-17** --- Multi-Channel Emergency Transmission Gateway
-   **MOD-20** --- Real-Time Event / WebSocket Engine
-   **MOD-46** --- Immutable Audit Trail
-   **MOD-47** --- Role-Based Access Control
-   **MOD-48** --- Privacy, Consent and Medical Data Protection
-   Other related modules are invoked according to the capability
    represented by MOD-48.

### Integration Rules

-   REST APIs handle transactional commands and queries.
-   WebSocket events distribute real-time changes but do not replace
    persistence.
-   Background queues are used for retries, notifications,
    synchronization and other non-blocking work.
-   External provider integrations are isolated behind provider/service
    interfaces.

## 13. Access Control & Security

-   Enforce role, organization and incident scope through MOD-47.
-   Apply least privilege to personal, location and medical data through
    MOD-48.
-   Protect credentials, tokens and sensitive payloads in transit and at
    rest.
-   Never trust client-side role flags as the authorization source.
-   Record privileged and consequential actions in MOD-46.
-   Use secure session/token handling and rate limiting appropriate to
    the endpoint.

## 14. Non-Functional Requirements

-   **Reliability:** a secondary provider failure must not erase or
    corrupt the AGAP source-of-truth record.
-   **Performance:** normal transactions should be responsive on
    supported connectivity; emergency paths should avoid unnecessary
    blocking calls.
-   **Availability:** backend services should have health checks,
    monitoring and appropriate redundancy for the adopted environment.
-   **Scalability:** queues, database access and real-time events must
    support routine and surge workloads.
-   **Usability:** non-technical citizens and trained emergency
    personnel must be able to complete role-appropriate tasks with
    minimal ambiguity.
-   **Observability:** errors, retries, latency, provider failures and
    critical state changes must be measurable.
-   **Maintainability:** module boundaries, validation schemas,
    APIs/events and tests must remain explicit.

## 15. Error Handling

  -----------------------------------------------------------------------
  Condition                           System Response
  ----------------------------------- -----------------------------------
  Missing required field              Block the affected operation and
                                      identify the missing field.

  Invalid value                       Reject with a clear correction
                                      message.

  No connectivity                     Queue or mark pending when
                                      supported; never falsely claim
                                      delivery.

  External provider failure           Retry according to policy and
                                      preserve internal state.

  Unauthorized action                 Deny access and audit when
                                      required.

  Duplicate/conflicting data          Flag or route for controlled
                                      resolution; do not silently delete
                                      history.

  Stale data                          Display freshness and use the
                                      documented fallback/source-of-truth
                                      rule.
  -----------------------------------------------------------------------

## 16. Reports and Notifications

-   Generate operational notifications when this module creates a
    condition requiring human action.
-   Publish authorized real-time events for active workflows.
-   Include appropriate data in analytics and reporting.
-   Distinguish pending, sent, delivered/acknowledged and failed states
    whenever the channel supports those states.
-   Do not expose sensitive data through notification previews unless
    the disclosure is explicitly permitted.

## 17. Assumptions and Constraints

-   AGAP depends on formal adoption, staffing, response resources and
    operating policies of participating organizations.
-   GPS, mobile connectivity, push notifications, SMS and external
    mapping/geocoding services can fail or be unavailable.
-   AGAP cannot guarantee ambulance travel time, responder availability,
    medical outcomes or third-party message delivery.
-   Exact local job titles, escalation thresholds, response
    capabilities, retention periods and interoperability agreements must
    be confirmed during stakeholder validation.

## 18. Future Enhancements

-   Additional approved government/emergency interoperability.
-   Improved provider failover and offline synchronization.
-   Expanded analytics, accessibility and localization.
-   More configurable organization-specific workflows and capability
    catalogs.
-   Advanced decision-support models subject to validation, governance
    and human oversight.

## 19. Team Responsibility and Non-Overlap Justification

-   **Assigned Module:** MOD-48 --- Privacy, Consent and Medical Data
    Protection
-   **Primary Responsibility:** Own the business capability described in
    this module.
-   **Non-Overlap Justification:** The capability is separated from
    related modules so its records, rules, UI actions and APIs have one
    clear owner. Related modules consume its outputs rather than
    reimplementing the same business logic.

## 20. Acceptance Criteria

-   [ ] Authorized users can complete the supported Privacy, Consent and
    Medical Data Protection workflow end-to-end.
-   [ ] Required inputs and identifiers are validated server-side.
-   [ ] Unauthorized actions are rejected regardless of UI state.
-   [ ] Successful actions persist the expected result and timestamps.
-   [ ] Relevant real-time events are emitted where required.
-   [ ] Failure and offline conditions produce explicit recovery/pending
    states.
-   [ ] Audit requirements are satisfied for consequential actions.
-   [ ] Sensitive information is limited to authorized roles.
-   [ ] Integrations use stable IDs/contracts and are covered by
    integration tests.
-   [ ] Emergency-critical behavior is not blocked by optional
    enrichment or nonessential secondary services.
-   [ ] Functional, security, usability, integration and appropriate
    offline/failure-path tests pass.

------------------------------------------------------------------------

---

## 21. PhilHealth ID Data

Registration reads a citizen's PhilHealth ID (MOD-01, section 22). A government-issued ID number is *sensitive personal information* under the Data Privacy Act (RA 10173, Sec. 3(l)). It needs explicit consent, encryption at rest, least-privilege access and an audit trail. Full design: `docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md`, §5.2a and §11.

### What is read, and why

| Read from the card | Why | How it is stored |
|---|---|---|
| Name | So the account's name matches the ID | AES-256-GCM sealed (`name_on_id_sealed`) |
| PhilHealth number (PIN) | So each card holds only one account | Never in full: an HMAC (`pin_hmac`) and the last 4 digits (`pin_last4`) |
| Image of the card | So the server can read it, and staff can review unclear cases | AES-256-GCM sealed, under `id-documents/` in private storage |

The date of birth, address and photo on the card are not extracted or stored. Reading happens on AGAP's own server with local `tesseract.js`, and no cloud OCR service receives the card. The text the OCR returns is not saved.

### Consent

- The citizen must tick the consent box on the ID intro before scanning, and the server refuses a scan without it (`CONSENT_REQUIRED`).
- The `consent_records` row (type `ID_VERIFICATION_PHILHEALTH`) is written at registration, because the record needs an account to belong to. A scan that never becomes an account has no record, and its data is erased at 30 minutes.
- This consent is separate from medical consent.
- The seeded demo citizen has no consent record, so it has no Withdraw card.

### When the data is deleted

**The image is kept only while something still needs it.**

| Situation | When the image is deleted |
|---|---|
| Name matched at registration | Right after the registration transaction commits |
| Sent for staff review | When staff approve or reject |
| Scanned but never registered | When the claim expires, 30 minutes after the scan |

A failed delete never fails the registration or the review. The key stays on the row and the cleanup job retries every 10 minutes.

**The name and PIN data stay for as long as the account holds the card, and are erased here:**

| Situation | What happens | Status |
|---|---|---|
| Scan never claimed | The cleanup job erases the data when the claim expires | `EXPIRED` |
| Citizen withdraws consent | Erased at once, with any image. The account shows "Not verified" until the citizen scans again | `RELEASED` |
| Account never confirmed its phone, 24 hours after the scan | The cleanup job releases the claim, so nobody can hold a card using a number they don't control | `RELEASED` |
| Staff release the card | Erased at once. The holder is told to scan again | `RELEASED` |

A release never blocks the account: it can still sign in and send an SOS. Suspended and deactivated accounts keep their claim unless staff release it, so waiting can't undo a ban. A `REJECTED` row keeps its card data until the citizen withdraws or staff release it, because a rejection may be evidence (`SUSPECTED_FRAUD`).

### Withdrawing consent

**Profile → Privacy & Data → PhilHealth ID Check → Withdraw Consent.** The screen says what will be erased and that SOS still works. The account stays usable, and scanning again verifies it again.

### Who can see what

| Who | Sees |
|---|---|
| The citizen | Their own name as read and the last 4 digits, only while registering or scanning again |
| Reviewers: System Administrator, MDRRMO Org Administrator | The queue: typed name, phone, submitted time, scan count, reason. The image only on request |
| Dispatcher, Supervisor, System Administrator, Org Administrator (any organization) | Only the "ID verified" or "ID not verified" label on a citizen reporter, through the incident record. The console shows it on the incident drawer |
| Responders, Hospital Users, reporters | Nothing |

**Staff routes**, under `/v1/administration/id-verifications`:

| Route | Does | Audit action |
|---|---|---|
| `GET /` | The queue. No image, no PIN, no card name | None |
| `GET /:id/image` | Streams the image with `Cache-Control: no-store`. 410 once it is deleted. If the audit write fails, the image is not shown | `ID_IMAGE_VIEWED`, every view |
| `POST /:id/approve` | Approves, then deletes the image | `IDENTITY_VERIFICATION_APPROVED` |
| `POST /:id/reject` | Rejects with a fixed reason code, then deletes the image | `IDENTITY_VERIFICATION_REJECTED` |
| `POST /find-by-pin` | Staff type the number from the card in front of them. Compares only the HMAC and returns the account, never the number | `ID_CARD_LOOKUP`, found or not, without the number |
| `POST /:id/release` | Erases the card data and marks the account not verified. Needs a recent sign-in | `IDENTITY_VERIFICATION_RELEASED` |

Registration writes `IDENTITY_VERIFICATION_CLAIMED`, with the outcome and user id only. A withdrawal writes `IDENTITY_VERIFICATION_RELEASED`.

### Never

The full PIN, the OCR text, the name read from the card and the image never go into a log line, an audit entry, a WebSocket payload, a notification or an SMS. The API returns only `nameOnId` and `pinLast4`, and only from the scan endpoint. The citizen's SMS and push say only that the check was approved, not approved or removed.

`backend/test/emergency-flow-id-required.e2e-spec.ts` checks this against every log line and queued job while citizens register, both matched and sent for review. Staff decisions, lookups, releases and withdrawals are not part of that run; `id-review.spec.ts` checks the exact SMS and push texts of a decision.

### Operating rules

- **Keep the storage bucket private.** ID images share it with incident media, sealed with a key kept outside storage. Anonymous read and list were checked on the development storage only; check production when it is set up.
- **Back up `ID_DOCUMENT_ENCRYPTION_KEY`.** Losing it makes the stored names and any images awaiting review unreadable.
- **Don't change `ID_PIN_PEPPER`.** Changing it breaks the one-ID-per-account check for every existing account.

### Open items

These need a decision by a person. They are not settled by this document.

1. **There is no privacy policy or terms page.** On the registration form, "Terms of Service" and "Privacy Policy" are styled text with no link and no page behind them, and the agree box starts ticked. The form also says information is used "only for emergency response", which does not cover the ID check. The ID intro screen and the Privacy & Data screen do explain what is read, why and when it is deleted.
2. **Legal wording has not been confirmed as reviewed.** Module Boundary (section 3) still applies: exact legal and retention requirements must be confirmed with the adopting organization. The plan asks for the adviser to review the consent text; that review is not recorded yet.
3. **Minors** (a dependent under 18 with their own PhilHealth ID) are outside this work.
