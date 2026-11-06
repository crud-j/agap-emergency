# MODULE DOCUMENTATION

---

**System:** AGAP — A GPS-Based Mobile Emergency Alert System for Immediate Hospital Ambulance Dispatch
**Module ID:** MOD-01
**Module Name:** User Registration and Profile Management
**Prepared By:** Justine R. Soliman
**Context:** Bocaue, Bulacan MDRRMO / LGU Operations Center

---
## 1. Module Identification

-   **Module Name:** User Registration and Profile Management
-   **Module ID:** MOD-01
-   **Version:** 1.0
-   **Date Created / Updated:** September 8, 2026 / November 6, 2026
    (PhilHealth ID verification, section 22)
-   **Module Owner:** AGAP product and operations team, with operational
    ownership assigned by the adopting MDRRMO/LGU or participating
    organization
-   **Related System:** AGAP

## 2. Purpose / Objective

Creates the authoritative AGAP account and basic profile used to
associate emergency reports with a registered reporter.

The module exists to give this capability one clear owner, predictable
behavior and a testable interface to the rest of the emergency-response
workflow. It must improve information flow and coordination without
making claims that it can guarantee network delivery, ambulance
availability, medical outcomes or faster physical travel.

## 3. Scope

### In Scope

-   Account creation - verification - profile
    editing - unique user ID - account
    status - profile completeness - secure
    sessions - guest emergency path.

### Out of Scope

-   Functions whose authoritative ownership belongs to another AGAP
    module.
-   Independent replacement of 911, MDRRMO/local hotlines, emergency
    personnel, clinical judgment or organizational command authority.
-   Silent modification or deletion of historical operational records.

### Module Boundary

Users may edit their own permitted profile fields; administrators manage
lifecycle; registration is not required to report an emergency.

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

-   Account creation.
-   Verification.
-   Profile editing.
-   Unique user id.
-   Account status.
-   Profile completeness.
-   Secure sessions.
-   Guest emergency path.
-   PhilHealth ID check before a citizen account is created (section 22).

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

Location check → PhilHealth ID scan (section 22) → registration →
validation → account creation → OTP → profile completion →
verification/status update.

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

-   Name: last, first, middle (optional), suffix (optional).
-   PhilHealth ID scan (section 22).
-   Birth/date fields as configured.
-   Contact details.
-   Address/locality.
-   Credentials.
-   Verification state..

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

-   Primary record/state required for the User Registration and Profile
    Management workflow.
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
    represented by MOD-01.

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

-   **Assigned Module:** MOD-01 --- User Registration and Profile
    Management
-   **Primary Responsibility:** Own the business capability described in
    this module.
-   **Non-Overlap Justification:** The capability is separated from
    related modules so its records, rules, UI actions and APIs have one
    clear owner. Related modules consume its outputs rather than
    reimplementing the same business logic.

## 20. Acceptance Criteria

-   [ ] Authorized users can complete the supported User Registration
    and Profile Management workflow end-to-end.
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

## 21. Passkey Authentication (WebAuthn / FIDO2)

### Overview

AGAP supports **passkey login** as a modern, password-free authentication method. Passkeys use the WebAuthn (FIDO2) standard and rely on the device's built-in biometric authenticator (fingerprint, face recognition) or device PIN. They are phishing-resistant, require no password to remember, and are significantly faster than traditional login for returning users — critical in an emergency context where seconds matter.

### Why Passkeys in AGAP

In an emergency, a user who cannot remember their password or fails a CAPTCHA wastes seconds that cost outcomes. Passkeys allow a registered user to authenticate with one tap or one biometric gesture, then immediately reach the SOS trigger screen.

### Passkey Registration Flow

```
User is authenticated via password or OTP (first-time setup)
  ↓
User navigates to Security Settings → Enable Passkey
  ↓
App calls navigator.credentials.create() (WebAuthn API)
  ↓
Device prompts for biometric / PIN confirmation
  ↓
Device generates public-private key pair
  ↓
Public key + credential ID returned to the app
  ↓
App sends to backend → stored in passkey_credentials table
  ↓
Passkey is active — password login now optional
```

### Passkey Login Flow

```
User opens AGAP login screen
  ↓
Taps "Sign in with Passkey"
  ↓
Backend generates and returns a one-time challenge (random bytes)
  ↓
App calls navigator.credentials.get() with the challenge
  ↓
Device prompts for biometric / PIN (e.g., fingerprint scan)
  ↓
Device signs the challenge using the stored private key
  ↓
Signed assertion returned to app → sent to backend
  ↓
Backend verifies signature against stored public key
  ↓
If valid → JWT issued → user is logged in
  ↓
User lands directly on emergency home screen (SOS button visible)
```

### Passkey Database Schema

```sql
CREATE TABLE passkey_credentials (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id       TEXT NOT NULL UNIQUE,       -- Base64url-encoded credential ID
  public_key          TEXT NOT NULL,              -- COSE-encoded public key
  sign_count          BIGINT NOT NULL DEFAULT 0,  -- Replay attack prevention
  aaguid              UUID,                       -- Authenticator model identifier
  device_type         VARCHAR(50),                -- 'platform' or 'cross-platform'
  backup_eligible     BOOLEAN DEFAULT FALSE,      -- Synced passkey indicator
  backup_state        BOOLEAN DEFAULT FALSE,      -- Currently backed up
  transports          TEXT[],                     -- ['internal','hybrid']
  friendly_name       VARCHAR(100),               -- User-facing label e.g. "iPhone Face ID"
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at        TIMESTAMPTZ,
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Key Features

- **Multiple passkeys per account:** A user may register passkeys on multiple devices (phone, tablet, laptop). Each stores a separate credential.
- **Fallback to password / OTP:** If the device is unavailable or biometric fails, the user falls back to the standard login path. Passkeys are additive, never blocking.
- **Passkey management screen:** Users can view, rename, and revoke any registered passkey from their profile settings.
- **Sync passkeys (optional):** If the device OS supports synced passkeys (e.g., Apple iCloud Keychain, Google Password Manager), the passkey can be restored on a new device automatically.
- **Replay attack prevention:** The `sign_count` is incremented on every use and verified server-side to detect cloned authenticators.

### Business Rules

1. A passkey may only be registered by an authenticated user in a verified session.
2. A passkey login does not require an active internet connection to perform the biometric step — the device handles authentication locally; only the challenge and assertion require network.
3. If `sign_count` received is lower than the stored value, the backend must reject the assertion and flag the credential for review (possible cloning attempt).
4. Revoking a passkey immediately invalidates it — all subsequent login attempts with that credential are rejected.
5. A guest user cannot register a passkey. Account creation is required first.

### Integration Points

- **MOD-47 (Role-Based Access Control):** Passkey login produces the same JWT as password login; role and permission enforcement is unchanged.
- **MOD-46 (Audit Trail):** All passkey registrations, logins, and revocations are logged.
- **MOD-48 (Privacy and Data Protection):** The private key never leaves the device. AGAP only stores the public key — it cannot reconstruct the private key.
- **MOD-05 (Emergency Readiness):** Passkey availability is checked during the app readiness scan; if no passkey is registered, a gentle prompt to set one up is shown (not required).

---

## 22. PhilHealth ID Verification at Registration

### Overview

A citizen scans the front of their PhilHealth ID before an AGAP account is created. This cuts down on fake and scam accounts. The name the citizen types must match the name on the card, and each card can hold only one account at a time.

It is controlled by `ID_VERIFICATION_REQUIRED`, which is `true` in `.env.example`. It gates **account creation only**. Guest emergency reporting never needs it (rule 14).

Full design and decisions: `docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md`. How the data is protected, kept and erased: MOD-48, section 21.

### What it does and does not prove

It proves the person had a PhilHealth ID in hand and that the name on it matches the name they typed. It does **not** prove the card is genuine or that it belongs to the person holding it, because there is no public PhilHealth API to check a card against. One ID per account, phone OTP and staff review reduce misuse; they do not close it completely. Do not describe this as "identity verified".

### Registration flow

```
Location check: inside Bocaue
  ↓
ID intro: what is read, why, when it is deleted; consent box
  ↓
The phone's document scanner opens (front of the card, 1 page)
  ↓                     no Google Play services → fallback camera with a card-shaped frame
On-device text reading: the phone's own check for the PhilHealth heading and number
  ↓                     refused → retry, up to 3 attempts
Upload: the server reads the image again with its own OCR and decides
  ↓                     returns a token, the name as read, and the last 4 digits of the PIN
Form: Last / First / Middle (optional) / Suffix (optional), mobile, email, password
  ↓                     the shared matcher checks the typed name; Create Account stays disabled until it matches
POST /v1/auth/register with the token: the server checks the match again
  ↓
OTP → account ACTIVE
```

**Review path.** After 3 failed scans, or when the citizen is sure the typed name is right, they can choose **Send to MDRRMO for review**. The account is created under review, and it can sign in and send an SOS while staff check the card from Administration → ID Reviews.

"Report an emergency" (the button reads **Emergency? Report without an Account**) stays on every ID step.

### Data collected

| Item | Comes from | Where it ends up |
|---|---|---|
| Last, first, middle name and suffix | Typed by the citizen | `users.full_name`, joined as `First Middle Last Suffix` |
| Name on the card | Server OCR | Sealed in `identity_verifications.name_on_id_sealed` |
| PhilHealth number (PIN) | Server OCR | Only as an HMAC (`pin_hmac`) and its last 4 digits (`pin_last4`) |
| Image of the card | Phone's scanner | Sealed in private storage until the check is done |
| Consent | Consent box on the ID intro | `consent_records`, type `ID_VERIFICATION_PHILHEALTH`, written at registration |

The date of birth, address and photo on the card are **not** extracted or stored. Text read on the phone is only a usability hint and is never trusted: the server always reads the image itself.

### Business rules

1. Only a PhilHealth ID is accepted.
2. Every citizen account goes through the scan. Seeded demo citizens are pre-verified. Staff accounts are provisioned by administrators and do not scan.
3. The name fields are never pre-filled from the scan. The citizen types the name and the system checks it.
4. One card holds one account at a time, enforced by a partial unique index on `pin_hmac`. Expired, rejected and released scans do not block a new scan.
5. A scan token is valid for 30 minutes.
6. An account under review can sign in and send an SOS.
7. A verified citizen cannot change their name (`PATCH /v1/users/me` returns 409). To change it, they withdraw consent and scan again.
8. The "ID verified" and "ID not verified" labels on the dispatch console describe the **reporter**, never the patient, and only for citizen accounts. They are information only and never change priority, recommendations or dispatch.

### Profile status

Profile shows **PhilHealth ID** with one of: Verified, Under review by MDRRMO, Not approved, Not verified. The last two offer **Scan again**, which repeats the location check, scan and typed name for a signed-in citizen.

### Endpoints

| Route | Who | Does |
|---|---|---|
| `POST /v1/auth/id-verification` | Public, throttled, geo-fenced | Reads a scan and returns the token, the name as read and the last 4 digits. JPEG or PNG, up to 2 MB |
| `POST /v1/auth/register` | Public, throttled | Creates the account and claims the scan in one transaction |
| `GET /v1/auth/id-verification/status` | Signed-in citizen | The profile status |
| `POST /v1/auth/id-verification/claim` | Signed-in citizen | Claims a new scan (Scan again) |

The staff routes are under `/v1/administration/id-verifications`; see MOD-48, section 21.

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `CONSENT_REQUIRED` | 400 | The consent box was not ticked |
| `OUTSIDE_SERVICE_AREA` | 400 | The scan was sent from outside Bocaue |
| `IMAGE_TOO_LARGE` | 413 | Over 2 MB |
| `UNSUPPORTED_IMAGE_TYPE` | 415 | Not a JPEG or PNG, judged by the file's signature (400 when no image was sent) |
| `NOT_PHILHEALTH_ID` | 422 | Read clearly, but it is another kind of card |
| `UNREADABLE` | 422 | The server could not read the card |
| `ID_ALREADY_REGISTERED` | 409 | The card is already on an active account. The citizen is told to call MDRRMO, and staff can release it |
| `ID_SCAN_EXPIRED` | 400 | The token is over 30 minutes old, or already used |
| `NAME_DOES_NOT_MATCH_ID` | 400 | The typed name differs; nothing is created |
| `ID_VERIFICATION_REQUIRED` | 400 | The flag is on and no token was sent |

### Configuration

| Variable | Purpose |
|---|---|
| `ID_VERIFICATION_REQUIRED` | `true` requires the scan on `POST /v1/auth/register` |
| `ID_DOCUMENT_ENCRYPTION_KEY` | 32 random bytes, base64. Seals the name read from the card and the image |
| `ID_PIN_PEPPER` | At least 32 characters. Secret for `pin_hmac`. Changing it breaks the one-ID-per-account check |

With the flag on, the server refuses to start if the key or the pepper is missing. The scan endpoint returns 503 without them even with the flag off. The scanner needs an Expo dev build; Expo Go cannot run it.

### Integration Points

- **MOD-48 (Privacy):** consent, retention, erasure and staff access.
- **MOD-46 (Audit Trail):** claims, image views, decisions, card lookups and releases.
- **MOD-47 (RBAC):** reviewers are System Administrators and MDRRMO Org Administrators only.
- **MOD-49 (Administration):** the ID Reviews page.
- **MOD-21 (Dispatch Dashboard):** the reporter label, for information only.
