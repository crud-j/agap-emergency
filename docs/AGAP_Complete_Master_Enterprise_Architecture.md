# AGAP — Complete Master Enterprise Architecture
## A GPS-Based Mobile Emergency Alert System for Immediate Hospital Ambulance Dispatch
### Bocaue, Bulacan MDRRMO / LGU Operations Center

**Project:** AGAP (formerly AlagaLink)
**Repository:** `AGAPSYSTEM-Backend-Frontend`
**System Type:** Emergency Reporting, Dispatch Coordination, Response Monitoring, Incident Management, and Municipal Public Broadcast Platform
**Primary Context:** Bocaue MDRRMO / LGU Operations Center, Bocaue, Bulacan
**Document Version:** 2.0 — Updated to reflect the 53-module scope, Bocaue operational research, professor-directed pivot, and all locked design decisions
**Total Modules:** 53

---

## Table of Contents

1. Purpose and Mission
2. Central Architecture Principle
3. What AGAP Solves
4. Bocaue Operational Context
5. Emergency Categories in Scope
6. Relationship to 911 and Existing MDRRMO Channels
7. System Actors and Roles
8. Master System Architecture Diagram
9. Technology Stack
10. Repository Structure
11. Application Architecture — Three Client Surfaces
12. Backend Architecture
13. Database Architecture
14. Incident Architecture
15. Emergency Status Lifecycle
16. Core Emergency Workflows
17. Dual-Path Alert Delivery
18. Offline Architecture
19. Real-Time Architecture
20. Dispatch Architecture
21. Fleet Architecture
22. ETA Architecture
23. Escalation Architecture
24. Notification Architecture
25. Announcements Architecture (MOD-53)
26. API Architecture
27. WebSocket Events
28. Automation Architecture
29. Security Architecture
30. Privacy and Data Protection
31. Role-Based Access Control
32. Database Entities
33. Complete 53-Module Inventory
34. Technical Module Mapping
35. UI/UX Architecture
36. Connectivity and Resilience
37. Disaster and Surge Mode
38. Analytics and Reporting
39. Development Phases
40. Testing Strategy
41. Observability
42. Backup and Recovery
43. Dependency Policy
44. Environment Variables
45. Docker Development
46. Reliability Rules
47. Architectural Rules
48. Definition of Done

---

## 1. Purpose and Mission

AGAP is a digital emergency reporting and response coordination system designed to reduce the time and informational gap between when an emergency occurs and when the right responders are moving toward it, with the correct information in hand.

AGAP complements existing emergency channels such as 911 and local MDRRMO hotlines. It is not intended to replace them.

**What AGAP improves:**
- The speed of alert delivery from citizen to operations center
- The accuracy and completeness of location information
- The quality of incident information reaching responders before arrival
- The visibility of response progress to the person who triggered the alert
- The automatic notification of emergency contacts without manual intervention
- The accountability and traceability of every operational decision

**What AGAP does not claim:**
- Faster physical ambulance travel
- Creation of additional response resources
- Replacement of emergency personnel or clinical judgment
- Guaranteed network delivery
- Guaranteed faster response in all conditions

Its principal improvement is the **digital flow of information and coordination** from reporting through dispatch, response monitoring, and closure.

---

## 2. Central Architecture Principle: Incident-Centered Design

The **Incident** is the central business object of AGAP. Every module, every workflow, every data table, and every real-time event exists to support the lifecycle of an incident.

An incident connects:

- reporter (the person who triggered the alert)
- patient (the person who needs assistance — may be unknown, may be the reporter, may be multiple people)
- incident type and category
- GPS location and accuracy
- condition and details
- optional medical information
- emergency contacts
- operations center personnel
- response resources and fleet
- responder status and live location
- facility or hospital coordination
- notifications sent
- escalation state
- timestamps for every key transition
- audit events
- final resolution and closure

### Reporter vs. Patient — Always Separate Concepts

**Reporter** — the person who triggers or submits the emergency report. Examples: the victim, a bystander, a family member, barangay personnel, a responder.

**Patient** — the person who appears to need assistance. Possible values: the reporter, another identified person, an unknown person, multiple people, or none/not applicable.

A patient does **not** need an AGAP account to receive assistance.

AGAP must **never** automatically identify a nearby AGAP user as the patient.

```
Example — victim reports own accident:
  Reporter: Juan Dela Cruz
  Patient:  Juan Dela Cruz
  Incident: Road accident, MacArthur Highway, Bocaue

Example — bystander reports accident:
  Reporter: Maria Santos
  Patient:  Unknown Male
  Incident: Road accident, near Bocaue NLEX Interchange
```

---

## 3. What AGAP Solves

| Problem | Root Cause | AGAP's Answer |
|---|---|---|
| Location accuracy | Callers under panic cannot reliably describe their location | Automatic GPS coordinates captured at the moment of the trigger |
| Speed of dispatch | Voice call intake has too many sequential steps | One button press sends the alert directly to the dispatch dashboard |
| Information quality | Information depends on how calm the caller is | Structured chip-select incident form; pre-filled medical profile for registered users |
| Certainty that help is coming | No confirmation after a phone call | Live status line: Alert Received → Dispatched → En Route → Arrived |
| Family notification | Someone has to remember to call the family | Automatic SMS to registered emergency contacts at trigger moment |
| Crew preparation | Crews arrive knowing little about the patient | Medical profile and incident details on crew app before arrival |
| Connectivity failure | System fails silently when data is down | Simultaneous data + SMS dual-path; offline queue as last resort |
| Response accountability | No automatic record of response times | Every incident auto-logs full timeline from trigger to closure |
| False alarm management | General-public trigger at scale produces accidentals | 3-second cancel window; dispatcher-side false-alert controls |
| Public information broadcast | No fast channel for municipal announcements | MOD-53: Announcements broadcast to registered and unregistered citizens |

---

## 4. Bocaue Operational Context

AGAP is designed and validated around the actual emergency operations of Bocaue, Bulacan, Philippines.

**Bocaue's documented emergency response profile:**

| Category | Key Scenarios | Locations |
|---|---|---|
| Daily Medical & Trauma | Vehicular accidents, motorcycle crashes, medical dispatches, pre-hospital care | MacArthur Highway, NLEX Interchange, Governor F. Halili Avenue |
| Seasonal Flood Operations | Pre-emptive and forced evacuations, rescue boat deployment, river monitoring | Bocaue River (critical level: 11.50m+), Barangays Lolomboy, Bunlo, Igulot, Bambang |
| Fire & Industrial Hazards | Fireworks factory fires and explosions, BFP tactical support, EMT support, structural fires | Barangays Bundukan, Biñang 1st (fireworks hubs) |
| Post-Disaster Community Safety | Debris clearing, fallen trees, downed electrical poles, road restoration after typhoons | Municipality-wide |

**Key infrastructure facts:**
- The Bocaue River at 11.50 meters triggers mandatory evacuation operations
- Bocaue has an active fireworks manufacturing industry — industrial fire and explosion response is a regular operational reality, not a theoretical scenario
- Connectivity in flood-affected barangays is degraded during typhoon events — the dual-path SMS fallback is not optional for Bocaue
- The MDRRMO coordinates with BFP (Bureau of Fire Protection) for multi-agency fire and industrial hazard response

---

## 5. Emergency Categories in Scope

Based on Bocaue research and professor direction, AGAP covers all four of Bocaue's operational emergency categories:

1. **Medical & Trauma** — vehicular accidents, medical dispatches, EMT support
2. **Flood Operations & Rescue** — evacuation, rescue boat dispatch, river monitoring
3. **Fire & Industrial Hazards** — structural fires, fireworks factory incidents, BFP coordination
4. **Post-Disaster Community Safety** — clearing operations, debris, typhoon response

These map to the following incident category options in MOD-06 (Incident Detail Capture):

```
MEDICAL         → Medical emergency, cardiac, stroke, trauma
ROAD_ACCIDENT   → Vehicular accident, motorcycle crash
FLOOD           → Flooding, storm surge, drowning, entrapment
RESCUE          → Person in danger, missing person, entrapment
FIRE            → Structure fire, vehicle fire, fireworks explosion
INDUSTRIAL      → Factory hazard, chemical, explosion
DEBRIS          → Fallen tree, downed pole, road obstruction
OTHER           → Other emergency requiring MDRRMO response
```

**Deferred categories (future semesters):**
- HazMat (chemical/toxic spill requiring specialized protocol)
- Violence/Safety (requiring police coordination and separate legal handling)
- Mass Casualty beyond disaster surge (dedicated clinical mass-triage system)

---

## 6. Relationship to 911 and Existing MDRRMO Channels

```
Existing hotline model:
  Citizen
    ↓
  Phone / Hotline
    ↓
  Information collection (verbal, under stress)
    ↓
  Responder contact
    ↓
  Response

AGAP model:
  Citizen / Bystander
    ↓
  AGAP App (one button or shake)
    ↓
  GPS + Incident Details + Reporter Identity + Patient Info
    ↓
  MDRRMO Operations Center (live map, alarm, structured data)
    ↓
  Dispatcher Assessment
    ↓
  Resource Selection (nearest capable unit)
    ↓
  Dispatch Authorization
    ↓
  Responder (receives details on crew app, navigates to exact GPS)
    ↓
  Scene / Patient
    ↓
  Facility Coordination (hospital or evacuation center)
    ↓
  Resolution and Closure
    ↓
  Analytics + Audit + History
```

Existing 911 and MDRRMO hotline channels remain available as parallel and fallback options. AGAP does not eliminate or block them.

---

## 7. System Actors and Roles

| Actor | Role | Primary Interaction |
|---|---|---|
| **Citizen / Reporter** | Anyone who witnesses or experiences an emergency | Triggers SOS or shake alert, receives status updates |
| **Bystander** | A person who discovers someone else in distress | Triggers alert, provides incident details and location |
| **Dispatcher / Operations Center Staff** | MDRRMO staff managing active incidents | Receives alerts on dashboard, validates, dispatches resources |
| **Supervisor / Incident Commander** | Senior MDRRMO officer with authority over operational decisions | Reviews escalations, approves special actions, oversees multi-incident operations |
| **Responder / Ambulance Crew** | Personnel physically responding to the scene | Receives dispatch on crew app, navigates, updates status |
| **Hospital / Receiving Facility User** | ER staff or facility coordinator | Coordinates patient receiving, updates receiving status |
| **Organization / MDRRMO Administrator** | Manages the organization's AGAP configuration | Manages resources, accounts, reference data, fleet |
| **System Administrator** | Platform-level technical administration | System-wide configuration, health monitoring, platform governance |
| **Emergency Contact** | Registered contact of the person who triggered the alert | Receives automatic SMS notifications at key incident stages |
| **Announcements Publisher** | Designated LGU/MDRRMO communications staff | Composes and publishes municipal broadcasts (MOD-53) |

---

## 8. Master System Architecture

```
+===========================================================================+
|                              AGAP ECOSYSTEM                               |
|                  Bocaue MDRRMO / LGU Operations Center                    |
+===========================================================================+

+---------------------------+   +---------------------------+
|   CITIZEN MOBILE APP      |   |   RESPONDER MOBILE APP    |
|   React Native + Expo     |   |   React Native + Expo     |
|                           |   |                           |
|  SOS Button               |   |  Dispatch inbox           |
|  Shake-to-Alert           |   |  GPS navigation           |
|  Incident detail form     |   |  Patient profile          |
|  GPS capture              |   |  Status updates           |
|  Live status              |   |  Crew communication       |
|  Offline queue            |   |  Field assessment         |
|  Announcements feed       |   |  Location sharing         |
+----------+----------------+   +----------+----------------+
           |                               |
           | HTTPS / WebSocket / SMS       | HTTPS / WebSocket
           v                               v
+===========================================================================+
|                        AGAP APPLICATION BACKEND                           |
|                        Node.js + NestJS + TypeScript                      |
|                                                                           |
|  Auth & Identity  |  Users  |  Incidents  |  Alerts  |  Location        |
|  Dispatch  |  Fleet  |  Responders  |  Hospitals  |  Organizations      |
|  Notifications  |  SMS  |  Escalation  |  Media  |  Offline Sync       |
|  Analytics  |  Audit  |  Privacy  |  Consent  |  Administration        |
|  Announcements  |  Risk Intelligence  |  Disaster Mode                  |
+----------+-----------------------------------+-----------------------------+
           |                                   |
           v                                   v
  +------------------+               +------------------+
  |   PostgreSQL     |               |   Redis          |
  |   Source of Truth|               |   Cache / Jobs   |
  |   (PostGIS ready)|               |   BullMQ queues  |
  +------------------+               +------------------+
           |
           v
  +------------------+
  |  Object Storage  |
  |  Incident Photos |
  |  Media files     |
  +------------------+

           |
           v
+===========================================================================+
|                    OPERATIONS CENTER WEB PORTAL                           |
|                    Next.js + React + Tailwind CSS                         |
|                                                                           |
|  Live incident map     |  Alert queue         |  Dispatch controls       |
|  Fleet tracker         |  Responder status    |  Hospital coordination   |
|  Analytics dashboard   |  Audit log viewer    |  Admin management        |
|  Announcements manager |  SLA monitor         |  Risk heatmap            |
+===========================================================================+

+===========================================================================+
|                    HOSPITAL / FACILITY WEB PORTAL                         |
|                    Next.js + React + Tailwind CSS                         |
|                                                                           |
|  Incoming referrals    |  Patient pre-arrival info  |  Receiving status  |
+===========================================================================+

External Integrations:
  Firebase Cloud Messaging   → Push notifications
  Textbee (textbee.dev)      → SMS delivery via Android device SIM card
  Map Provider               → Maps, geocoding, routing, ETA
  Redis + BullMQ             → Background jobs and retry queues
  Object Storage             → Incident photos and uploaded media
```

---

## 9. Technology Stack

### Mobile (Citizen App + Responder App)

```
React Native + Expo (TypeScript)
Expo Router           — file-based navigation
Expo Location         — GPS capture and live tracking
Expo Notifications    — push notification receiving
Expo Secure Store     — credential and token storage
Expo Sensors          — accelerometer for shake-to-alert (MOD-07)
Expo Camera / Image Picker — incident photo capture (MOD-10)
TanStack Query        — server state management
Zustand               — local UI state
Zod                   — runtime validation
```

### Web (Operations Center + Hospital Portal + Admin)

```
Next.js + React (TypeScript)
Tailwind CSS          — utility-first styling
Radix UI              — accessible component primitives
TanStack Query        — server state and cache
Zod                   — validation
Map library           — compatible with selected map provider
Socket.io client      — WebSocket connection management
```

### Backend

```
Node.js LTS
NestJS (TypeScript)   — modular monolith architecture
Prisma ORM            — type-safe database access
PostgreSQL            — primary relational database
PostGIS               — geographic query support (reserved for flood zone / risk heatmap features)
Redis                 — cache and session state
BullMQ                — background job queues
REST API              — primary transactional interface
WebSocket (Socket.io) — real-time event distribution
OpenAPI / Swagger      — API documentation
```

### External Services

```
Firebase Cloud Messaging  — push notifications
Textbee (textbee.dev)     — SMS gateway via Android device SIM card
                             (TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID, MDRRMO_OPS_PHONE)
Map provider              — geocoding, routing, ETA calculation
Object storage            — incident photos and media
```

### Infrastructure

```
Docker + Docker Compose   — local and production containerization
Git + GitHub              — version control
GitHub Actions            — CI/CD pipeline
Environment variables     — configuration management
Database migrations       — Prisma migrate
Automated tests           — unit, integration, and E2E
Health checks             — backend and database monitoring
```

---

## 10. Repository Structure

```
AGAPSYSTEM-Backend-Frontend/
│
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .gitignore
├── .env.example
├── docker-compose.yml
│
├── docs/
│   ├── architecture/
│   │   ├── master-architecture.md         ← This document
│   │   ├── system-workflow.md
│   │   ├── emergency-workflow.md
│   │   ├── dispatch-workflow.md
│   │   ├── incident-lifecycle.md
│   │   ├── data-flow.md
│   │   ├── integration-architecture.md
│   │   └── disaster-mode.md
│   ├── modules/                           ← 53 module documentation files
│   ├── operations/
│   │   ├── mdrrmo-bocaue-operations.md
│   │   ├── dispatcher-procedure.md
│   │   ├── responder-procedure.md
│   │   ├── escalation-procedure.md
│   │   └── incident-closure-procedure.md
│   ├── database/
│   │   ├── entity-relationship.md
│   │   ├── tables.md
│   │   └── data-retention.md
│   ├── api/
│   │   ├── api-overview.md
│   │   └── [endpoint documentation per cluster]
│   ├── security/
│   │   ├── authentication.md
│   │   ├── authorization.md
│   │   ├── privacy.md
│   │   └── audit-policy.md
│   └── research/
│       ├── bocaue-operational-research.md
│       ├── survey-instrument-a.md         ← General public instrument
│       ├── survey-instrument-b.md         ← Hospital/dispatch instrument
│       ├── interview-results.md
│       └── requirements-traceability.md
│
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   ├── filters/
│   │   │   ├── pipes/
│   │   │   └── utils/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── emergency-contacts/
│   │   ├── medical-profiles/
│   │   ├── incidents/
│   │   │   ├── incidents.module.ts
│   │   │   ├── incidents.controller.ts
│   │   │   ├── incidents.service.ts
│   │   │   ├── incident-status/
│   │   │   ├── incident-events/
│   │   │   ├── incident-validation/
│   │   │   ├── incident-history/
│   │   │   └── dto/
│   │   ├── emergency-alerts/
│   │   ├── locations/
│   │   │   ├── gps/
│   │   │   ├── live-tracking/
│   │   │   ├── geocoding/
│   │   │   └── location-history/
│   │   ├── dispatch/
│   │   │   ├── assignment/
│   │   │   ├── resource-matching/
│   │   │   ├── priority/
│   │   │   └── escalation/
│   │   ├── responders/
│   │   ├── fleet/
│   │   ├── hospitals/
│   │   ├── organizations/
│   │   ├── notifications/
│   │   │   ├── push/
│   │   │   ├── sms/
│   │   │   └── notification.service.ts
│   │   ├── announcements/              ← MOD-53
│   │   │   ├── announcements.module.ts
│   │   │   ├── announcements.controller.ts
│   │   │   ├── announcements.service.ts
│   │   │   ├── sms-subscribers/
│   │   │   └── dto/
│   │   ├── realtime/
│   │   │   ├── websocket.gateway.ts
│   │   │   ├── events/
│   │   │   └── presence/
│   │   ├── offline-sync/
│   │   ├── media/
│   │   ├── analytics/
│   │   ├── audit/
│   │   ├── permissions/
│   │   ├── privacy/
│   │   ├── consent/
│   │   ├── false-alerts/
│   │   ├── risk-intelligence/
│   │   ├── disaster-mode/
│   │   └── administration/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── test/
│   └── package.json
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── operations/
│   │   │   ├── page.tsx            ← Live incident map + queue
│   │   │   ├── incidents/
│   │   │   ├── map/
│   │   │   ├── dispatch/
│   │   │   ├── responders/
│   │   │   ├── fleet/
│   │   │   └── alerts/
│   │   ├── announcements/          ← MOD-53 publisher interface
│   │   ├── hospitals/
│   │   ├── organizations/
│   │   ├── reports/
│   │   ├── analytics/
│   │   ├── audit/
│   │   ├── users/
│   │   └── administration/
│   ├── components/
│   │   ├── ui/
│   │   ├── maps/
│   │   ├── incidents/
│   │   ├── dispatch/
│   │   ├── fleet/
│   │   ├── announcements/
│   │   └── charts/
│   └── package.json
│
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── onboarding/
│   │   ├── auth/
│   │   ├── home/
│   │   ├── emergency/
│   │   │   ├── sos.tsx             ← MOD-06
│   │   │   ├── shake.tsx           ← MOD-07
│   │   │   ├── confirmation.tsx    ← MOD-08
│   │   │   ├── incident-details.tsx ← MOD-09
│   │   │   ├── active-incident.tsx ← MOD-15
│   │   │   └── status.tsx          ← MOD-14
│   │   ├── announcements/          ← MOD-53 public feed
│   │   ├── tracking/
│   │   ├── profile/
│   │   ├── medical/
│   │   ├── contacts/
│   │   └── settings/
│   ├── services/
│   │   ├── gps/
│   │   ├── sms/
│   │   ├── offline/
│   │   ├── websocket/
│   │   └── shake-detector/
│   └── package.json
│
├── shared/
│   ├── types/
│   ├── constants/
│   ├── enums/
│   └── validation/
│
├── infrastructure/
│   ├── docker/
│   ├── database/
│   └── nginx/
│
└── .github/
    └── workflows/
        ├── backend.yml
        ├── frontend.yml
        ├── mobile.yml
        └── tests.yml
```

---

## 11. Application Architecture — Three Client Surfaces

### Why Three Applications

**Mobile** — required because GPS location capture, the SOS button, and the shake-to-alert trigger all depend on native device capabilities that a website cannot access reliably in an emergency context. Used by citizens, bystanders, and responders.

**Web** — operations center dispatchers, supervisors, hospital staff, and administrators work at desks with large screens and do not need native device capabilities. A web portal provides richer dashboard interfaces without requiring app installation. Also serves as the Announcements publisher interface.

**Backend** — one shared source of truth, one set of business rules. A single backend serves all three client surfaces. Do not create separate backends per role.

---

## 12. Backend Architecture

NestJS operates as a **modular monolith** — all functionality in one deployable service, organized into independently testable modules.

### Backend Module Groups

```
Auth                  — JWT authentication, session management, token refresh
Users                 — account lifecycle, profile, role assignment
EmergencyContacts     — contact storage and notification trigger
MedicalProfiles       — optional health data with consent controls
Incidents             — central incident lifecycle (all 53 modules depend on this)
EmergencyAlerts       — SOS processing, shake detection, incident creation
Locations             — GPS capture, geocoding, live tracking, location history
Dispatch              — resource matching, priority, assignment, authorization
Responders            — crew management, availability, status
Fleet                 — vehicle registry, real-time status, GPS positions
Hospitals             — facility registry, capabilities, receiving coordination
Organizations         — MDRRMO and partner organization management
Notifications         — push (FCM) and SMS (Textbee) delivery
Announcements         — municipal broadcast, SMS subscribers, feed (MOD-53)
Realtime              — WebSocket gateway, event distribution
OfflineSync           — offline queue reconciliation, deduplication
Media                 — photo upload, validation, storage
Analytics             — response time metrics, reporting
Audit                 — immutable action log
Permissions           — role and organization scope enforcement
Privacy               — data classification, consent ledger, least-privilege
FalseAlerts           — cancellation, classification, repeat review
RiskIntelligence      — incident heatmap, flood zone awareness
DisasterMode          — surge activation, mass-casualty grouping
Administration        — account control, platform health, system config
```

---

## 13. Database Architecture

**Primary database:** PostgreSQL (relational, ACID-compliant, source of truth)

**Geographic extensions:** PostGIS reserved for flood zone boundary queries, geofence-based risk visualization, and GPS proximity matching

**Cache and jobs:** Redis — session cache, BullMQ job queues

**Media storage:** Object storage (separate from PostgreSQL) — incident photos, attachments

### Core Entities

```
User
Role
Permission
Organization
OrganizationMembership

EmergencyContact
MedicalProfile

Incident
IncidentReporter
IncidentPatient
IncidentEvent
IncidentLocation
IncidentAttachment

Dispatch
DispatchAssignment
Resource
Vehicle
Responder
ResponderLocation

Hospital
HospitalCapability
HospitalReferral

EvacuationCenter            ← Bocaue flood operations
EvacuationCenterStatus

Notification
NotificationDelivery

Escalation
AuditLog
ConsentRecord

FeedbackRating
FalseAlert

RiskArea
FirstAidGuide

Announcement                ← MOD-53
SmsSubscriber
AnnouncementDelivery

SystemConfiguration
```

---

## 14. Incident Architecture

```
Incident
├── incidentId              (uuid, primary key)
├── publicReference         (human-readable reference, e.g. INC-2026-001234)
├── reporter
│   ├── userId (if registered)
│   ├── name
│   └── contactNumber
├── patient
│   ├── isReporter (boolean)
│   ├── isUnknown (boolean)
│   ├── name (if known)
│   └── medicalProfile (if registered and consented)
├── incidentType            (MEDICAL, ROAD_ACCIDENT, FLOOD, RESCUE, FIRE, INDUSTRIAL, DEBRIS, OTHER)
├── priority                (CRITICAL, HIGH, MEDIUM, LOW)
├── description
├── condition               (CONSCIOUS, UNCONSCIOUS, UNKNOWN)
├── breathingStatus         (NORMAL, DIFFICULTY, NOT_BREATHING, UNKNOWN)
├── location
│   ├── latitude
│   ├── longitude
│   ├── accuracy
│   ├── address (geocoded)
│   └── barangay (for Bocaue routing)
├── currentStatus
├── createdAt
├── acknowledgedAt
├── assessedAt
├── dispatchedAt
├── enRouteAt
├── arrivedAt
├── resolvedAt
├── closedAt
├── assignedResources       []
├── notifications           []
├── attachments             [] (incident photos)
├── medicalInformation
├── escalationState
├── auditEvents             []
└── resolution
    ├── outcome
    ├── patientDisposition
    ├── responseNotes
    └── closedBy
```

---

## 15. Emergency Status Lifecycle

```
DRAFT
  ↓
SUBMITTED
  ↓
RECEIVED
  ↓
ACKNOWLEDGED
  ↓
ASSESSED
  ↓
DISPATCH_PENDING
  ↓
DISPATCHED
  ↓
EN_ROUTE
  ↓
ON_SCENE
  ↓
TRANSPORTING / ASSISTING
  ↓
RESOLVED
  ↓
CLOSED
```

Alternative terminal outcomes:
```
CANCELLED       — user cancelled within the 3-second window
FALSE_ALERT     — dispatcher classified as false alarm
DUPLICATE       — merged into a master incident record
UNABLE_TO_RESPOND
REFERRED        — referred to another agency or channel
```

Status transitions are controlled by permissions and business rules. A responder cannot close an incident. A citizen cannot acknowledge one. Every transition is timestamped and audited.

---

## 16. Core Emergency Workflows

### Standard Workflow

```
Emergency occurs
  ↓
Citizen / Bystander opens AGAP
  ↓
Presses SOS button OR performs shake gesture (MOD-06, MOD-07)
  ↓
3-second confirmation / cancel window (MOD-08)
  ↓
GPS captured automatically (MOD-11)
  ↓
Incident detail form: type, condition, breathing (MOD-09)
  ↓
Optional photo attachment within 30 seconds (MOD-10)
  ↓
Reporter identity captured (registered or guest)
  ↓
Patient identified if known; unknown is a valid value
  ↓
Incident created and persisted (MOD-14)
  ↓
Dual-path transmission fires: data + SMS simultaneously (MOD-17, MOD-19)
  ↓
Operations Center notified — alarm sounds, red pin on map (MOD-21)
  ↓
Dispatcher acknowledges (MOD-21)
  ↓
Dispatcher assesses and validates (MOD-25)
  ↓
Duplicate check (MOD-26)
  ↓
Severity and priority recommendation (MOD-24)
  ↓
Suitable resource identified (MOD-29, MOD-30)
  ↓
Dispatcher authorizes dispatch (MOD-31)
  ↓
Responder receives assignment on crew app (MOD-18, MOD-32)
  ↓
Responder goes en route — live GPS tracked (MOD-43)
  ↓
ETA pushed to citizen app (MOD-17)
  ↓
Emergency contacts notified automatically (MOD-16)
  ↓
Background SLA timer running — escalates if stalled (MOD-13, MOD-41)
  ↓
Responder arrives — status updated (MOD-32)
  ↓
On-scene assessment logged (MOD-37)
  ↓
Facility coordination if transport needed (MOD-38, MOD-39)
  ↓
Transport tracked to destination (MOD-40)
  ↓
Incident resolved and formally closed (MOD-45, MOD-15)
  ↓
Full timeline auto-compiled (MOD-22, MOD-50)
  ↓
Audit trail complete (MOD-46)
```

### Bystander Workflow (No Prior Account Required)

```
Stranger sees accident
  ↓
Opens AGAP → guest path (no login required)
  ↓
Location and incident type captured
  ↓
Patient = Unknown (valid, system proceeds normally)
  ↓
Alert fires to Operations Center
  ↓
MDRRMO dispatches response
```

### Shake-to-Alert Workflow (MOD-07)

```
Accelerometer detects strong, intentional shake above threshold
  ↓
High threshold prevents casual movement triggering
  ↓
3-second cancel window appears
  ↓
Alert fires → same pipeline as SOS button
  ↓
Runs passively in background when app is minimized
```

### Multi-Agency Coordination (Bocaue BFP Partnership)

```
Fire or industrial hazard incident created
  ↓
Operations Center activates multi-agency coordination (MOD-34)
  ↓
BFP invited as participant on the shared incident
  ↓
Each agency sees incident from their scoped view
  ↓
Resource requests sent between agencies (MOD-35)
  ↓
ICS structure activated for large incidents (MOD-36)
  ↓
Incident Handover if shift changes during extended operation (MOD-44)
```

---

## 17. Dual-Path Alert Delivery

```
Emergency trigger
  ↓
+-------------------+-------------------+
|                                       |
v                                       v
Data path                          SMS path
(REST API over HTTPS)              (Textbee SMS gateway)
|                                       |
v                                       v
Backend receives                   Backend SMS encoder
and processes                      compresses to <160 chars
|                                       |
+-------------------+-------------------+
                    |
                    v
            Incident processing
            (whichever path arrives first wins)
```

**SMS payload format (under 160 characters):**
```
AGAP|INC-2026-001234|14.5995,120.9842|1754179200|FIRE|C:Y
     [incident_ref]  [lat,lng]         [unix_ts]  [type][conscious:yes]
```

**Why parallel and not sequential:** The SMS path cannot wait to detect a data failure. In a flood zone with degraded connectivity during a typhoon, the data path may fail silently. Both fire immediately so whichever transport has signal in that moment delivers the alert.

---

## 18. Offline Architecture

```
Emergency trigger
  ↓
Assign unique client event ID (idempotency key)
  ↓
Try data path + SMS path simultaneously
  ↓
If both fail (true zero connectivity):
  ↓
Save event to secure local queue (MOD-20)
  ↓
Monitor connectivity state
  ↓
Connection restored
  ↓
Send queued events with original event IDs
  ↓
Backend validates and deduplicates using event ID (MOD-26)
  ↓
Persist or acknowledge duplicate
  ↓
Return sync result
```

Every offline event must have a unique client event ID to prevent duplicate incidents when the queue flushes.

---

## 19. Real-Time Architecture

WebSocket (Socket.io) powers all live data. The database is always the source of truth. WebSocket distributes changes; it does not replace persistence.

```
Backend event (e.g. responder location update)
  ↓
Persist to PostgreSQL
  ↓
Publish WebSocket event
  ↓
+--------------------+--------------------+
|                    |                    |
v                    v                    v
Operations Center   Citizen App          Responder App
(map pin moves)     (ETA updates)        (sees own status)
```

**Authenticated and authorized:** WebSocket connections must present a valid token. Subscriptions are scoped by role and organization. A citizen can only receive events for their own incident.

---

## 20. Dispatch Architecture

```
Incident created and acknowledged
  ↓
Assessment — incident type, priority, condition (MOD-25)
  ↓
Required resource type determined (MOD-29)
  │
  ├─ MEDICAL → Ambulance with EMT
  ├─ FLOOD   → Rescue boat + crew
  ├─ FIRE    → Fire truck (BFP) + MDRRMO support
  ├─ DEBRIS  → Clearing equipment + crew
  └─ OTHER   → General response unit
  ↓
Available resources filtered (MOD-28)
  │
  ├─ Status: AVAILABLE
  ├─ Capability matches requirement (MOD-29)
  ├─ Within operational area
  └─ Not already assigned to higher priority
  ↓
Nearest suitable unit surfaced (MOD-30)
  ↓
Dispatcher reviews and selects (MOD-31)
  ↓
Dispatch authorized — recorded with dispatcher identity + timestamp
  ↓
Responder notified (MOD-18)
  ↓
Responder acknowledges → EN_ROUTE
```

Automation assists the dispatcher. It never silently makes the operational dispatch decision.

---

## 21. Fleet Architecture

Each response unit maintains:

```
Resource
├── resourceId
├── organizationId
├── vehicleId
├── resourceType      (AMBULANCE, RESCUE_BOAT, FIRE_TRUCK, CLEARING_EQUIPMENT)
├── status            (AVAILABLE, DISPATCHED, EN_ROUTE, ON_SCENE, TRANSPORTING, RETURNING, OUT_OF_SERVICE, OFFLINE)
├── capability        (DEFIBRILLATOR, OXYGEN, TRAUMA_KIT, RESCUE_BOAT_CAPACITY, CHAINSAW, etc.)
├── crew              []
├── currentLocation   (lat, lng, updatedAt)
├── currentIncidentId
└── operationalAvailability
```

Fleet statuses visible on the Operations Center map in real time via WebSocket.

---

## 22. ETA Architecture

```
Responder location update received
  ↓
Routing service queried with:
  - responder current position
  - incident GPS position
  - current traffic conditions
  ↓
Estimated travel time calculated
  ↓
ETA stored and published via WebSocket
  ↓
+---------------------+---------------------+
|                     |                     |
v                     v                     v
Citizen app         Operations Center     Responder app
(ETA displayed)     (ETA shown on queue)  (confirms nav ETA)
```

ETA is always labeled as an estimate. If routing is unavailable, ETA is shown as "Calculating..." — never an invented number.

---

## 23. Escalation Architecture

```
Incident created → SLA timer starts (MOD-13, MOD-41)
  ↓
Check at configurable intervals:
  - Acknowledgement threshold: e.g. 2 minutes
  - Dispatch threshold: e.g. 5 minutes
  - On-scene threshold: e.g. 15 minutes
  ↓
Threshold not met?
  ↓
Level 1: Alert dispatcher supervisor
  ↓
Level 2: Alert incident commander
  ↓
Level 3: Alert MDRRMO Administrator + DRRMO (for unresolved critical)
  ↓
Escalation record created in audit trail at each level
```

Thresholds are configurable by the participating organization.

---

## 24. Notification Architecture

```
Notification Service
  │
  ├── Push (Firebase Cloud Messaging)
  │     → Registered users with notification permission
  │     → Responders
  │     → Operations center staff
  │
  ├── SMS (Textbee — Android device SIM gateway)
  │     → Emergency contacts (registered)
  │     → SMS-only subscribers (unregistered, via MOD-53)
  │     → Fallback for registered users without app
  │
  └── In-App (WebSocket)
        → Live status updates in active sessions
```

**Events triggering notifications:**

```
incident.created          → Operations Center
incident.acknowledged     → Reporter (citizen app status update)
resource.dispatched       → Reporter, Emergency Contacts, Responder
responder.en_route        → Reporter (ETA shown), Emergency Contacts
responder.arrived         → Reporter, Emergency Contacts
incident.escalated        → Supervisor, Administrator
incident.closed           → Reporter, Emergency Contacts
announcement.published    → Registered users (push), SMS subscribers (SMS) ← MOD-53
```

Notification failure (FCM down, SMS gateway down) must **never** delete or cancel an incident. Failures are logged and retried.

---

## 25. Announcements Architecture (MOD-53)

MOD-53 is a one-way broadcast module specific to the Bocaue municipality context.

```
LGU/MDRRMO Publisher
  ↓
Composes announcement:
  - Title + Body
  - Category: CLASS_SUSPENSION, FLOOD_ALERT, EVACUATION_ORDER,
               ROAD_CLOSURE, FIRE_ADVISORY, POST_DISASTER, GENERAL
  - Severity: INFORMATIONAL, ADVISORY, WARNING, CRITICAL
  - Scope: MUNICIPALITY_WIDE or BARANGAY_SPECIFIC (select barangays)
  - Schedule: immediate or scheduled time
  ↓
On publish:
  │
  ├── Push notification → all registered users in scope
  │
  └── SMS broadcast → all phone-number subscribers in scope
         (no AGAP account required to receive SMS)
  ↓
Announcement appears on public feed
  (accessible without login on both mobile and web)

Unregistered Citizen:
  → Opens AGAP app or web page
  → Views public announcements feed (no login)
  → Optionally subscribes with phone number for SMS
  → Receives SMS announcements for their area
  → May opt out at any time by replying STOP
```

**Announcements data model:**
```
Announcement: id, title, body, category, severity, scope_type,
              target_barangays[], published_at, scheduled_at,
              status, publisher_id

SmsSubscriber: id, phone_number, scope_preference, subscribed_at,
               is_active, opted_out_at

AnnouncementDelivery: id, announcement_id, channel, recipient_batch,
                      status, sent_at, retry_count
```

---

## 26. API Architecture

```
/api/v1/auth
/api/v1/users
/api/v1/contacts
/api/v1/medical-profiles
/api/v1/incidents
/api/v1/incidents/:id/events
/api/v1/alerts
/api/v1/locations
/api/v1/tracking
/api/v1/dispatch
/api/v1/resources
/api/v1/responders
/api/v1/fleet
/api/v1/hospitals
/api/v1/facilities            ← evacuation centers, Bocaue context
/api/v1/notifications
/api/v1/announcements         ← MOD-53
/api/v1/announcements/subscribe
/api/v1/escalations
/api/v1/reports
/api/v1/analytics
/api/v1/audit
/api/v1/organizations
/api/v1/admin
```

**API requirements:** versioning, request validation, authentication, authorization, consistent error structure, OpenAPI documentation, no internal database identifiers exposed in public responses.

---

## 27. WebSocket Events

```
incident.created
incident.updated
incident.status_changed
incident.escalated
incident.closed

dispatch.created
dispatch.updated
dispatch.cancelled

resource.status_changed
resource.location_updated

responder.location_updated
responder.status_changed
responder.eta_updated

notification.created

escalation.created
escalation.updated

announcement.published        ← MOD-53
```

All WebSocket connections require authentication. Subscriptions are scoped by role and organization. Citizens receive only events for their own active incident.

---

## 28. Automation Architecture

All automation uses BullMQ queues backed by Redis. The primary incident record is always persisted **before** background jobs are relied upon.

```
Operational event (e.g. SOS pressed)
  ↓
Backend synchronous path:
  - Validate
  - Create incident record
  - Persist to PostgreSQL
  - Publish WebSocket event
  ↓
Background jobs enqueued:
  - SMS notification job
  - Push notification job
  - Emergency contact notification job
  - SLA timer job
  - ETA refresh job
  - Offline sync reconciliation job
  - Analytics event job
  - Audit log job
  - Announcement SMS broadcast job (MOD-53)
```

Critical incident creation never depends on a queue completing. If the queue fails, the incident is already persisted.

---

## 29. Security Architecture

```
Mobile / Web client
  ↓
HTTPS / TLS (all traffic encrypted in transit)
  ↓
NestJS API
  ↓
Authentication guard (JWT validation)
  ↓
Authorization guard (role + organization + ownership)
  ↓
Input validation (Zod / class-validator)
  ↓
Business logic
  ↓
Prisma ORM
  ↓
PostgreSQL
```

Every protected operation checks:
1. Identity (valid JWT token, not expired)
2. Role (permission exists for this action)
3. Organization (resource belongs to the actor's organization)
4. Ownership (user is authorized for this specific resource)
5. Permission (specific capability confirmed)

**Additional security controls:**
- Rate limiting on authentication and alert endpoints
- Secure token storage on mobile (Expo Secure Store)
- Password hashing (bcrypt)
- Token expiration and refresh rotation
- No sensitive data in logs, public URLs, or SMS payloads
- Secrets managed through environment variables, never committed

---

## 30. Privacy and Data Protection

**Data classification:**

| Class | Examples | Controls |
|---|---|---|
| Public | Announcement content, incident reference numbers | No restrictions |
| Personal | Name, phone number, email | Authenticated access only |
| Sensitive | Location history, contact list | Least-privilege, access-logged |
| Medical | Blood type, allergies, conditions | Separate consent, encrypted, audited |

**Key rules:**
- Medical profile requires a separate consent record before access
- Emergency contacts receive only the information the user consented to share
- Detailed medical information is not sent via SMS unless explicitly justified
- SMS subscriber phone numbers are never exposed in public endpoints
- Location history is retained only for the period required for analytics
- Audit logs are immutable — no update or delete operations permitted
- Data minimization: collect only what is necessary for the emergency function

---

## 31. Role-Based Access Control

| Role | Key Permissions |
|---|---|
| Citizen | Manage own profile, contacts, medical profile; report emergency; view own incident status |
| Bystander | Report emergency (no account required); provide incident details; provide location |
| Dispatcher | Receive and acknowledge alerts; assess incidents; view resources; dispatch (within authority); escalate |
| Supervisor | Monitor operations; receive escalations; review dispatcher decisions; authorize special actions |
| Responder | Receive assignment; view authorized incident details; navigate; update status; share location |
| Hospital User | View authorized referrals; coordinate receiving; update receiving status |
| Organization Administrator | Manage organization-scoped users, resources, and configuration |
| Announcements Publisher | Compose, schedule, publish, and archive announcements; view delivery status |
| System Administrator | System-wide account management, platform health, global configuration |

---

## 32. Database Entities (Quick Reference)

All entities use UUID primary keys. All timestamps are stored in UTC. All sensitive data is encrypted at rest.

**Core incident entities:** Incident, IncidentReporter, IncidentPatient, IncidentEvent, IncidentLocation, IncidentAttachment

**User and identity entities:** User, Role, Permission, Organization, OrganizationMembership, EmergencyContact, MedicalProfile, ConsentRecord

**Dispatch and response entities:** Dispatch, DispatchAssignment, Resource, Vehicle, Responder, ResponderLocation, Hospital, HospitalCapability, EvacuationCenter

**Notification entities:** Notification, NotificationDelivery

**Announcements entities (MOD-53):** Announcement, SmsSubscriber, AnnouncementDelivery

**Governance entities:** Escalation, AuditLog, FalseAlert, FeedbackRating, RiskArea, SystemConfiguration

---

## 33. Complete 53-Module Inventory

### Cluster A — User and Identity Management

| Module | Name |
|---|---|
| MOD-01 | User Registration and Profile Management |
| MOD-02 | Emergency Contact Management |
| MOD-03 | Medical Profile |
| MOD-04 | Accessibility and Multi-Language / Basic User Support |
| MOD-05 | Emergency Readiness and Permission Status |

### Cluster B — Alert Triggering

| Module | Name |
|---|---|
| MOD-06 | Immediate SOS Trigger / One-Button SOS |
| MOD-07 | Shake-to-Alert Trigger |
| MOD-08 | Emergency Cancellation and False Alert Management |

### Cluster C — Location and Tracking

| Module | Name |
|---|---|
| MOD-09 | Rapid Incident Detail Capture |
| MOD-10 | Incident Photo and Evidence Capture |
| MOD-11 | Precision GPS Capture |
| MOD-12 | Location Context and Reverse Geocoding |
| MOD-13 | Live Incident Location Tracking |

### Cluster D — Alert Processing and Dispatch

| Module | Name |
|---|---|
| MOD-14 | Emergency Incident Record and Ticketing |
| MOD-15 | Incident Lifecycle State Management |
| MOD-16 | Emergency Contact Notification |
| MOD-17 | Multi-Channel Emergency Transmission Gateway |
| MOD-18 | Responder Assignment Notification and Dispatch Messaging |
| MOD-19 | Offline Emergency Queue and Retry |
| MOD-20 | Real-Time Event / WebSocket Engine |
| MOD-21 | Emergency Operations and Dispatch Dashboard |
| MOD-22 | Real-Time Incident Map |
| MOD-23 | Incident Command Queue |
| MOD-24 | Emergency Severity and Priority Recommendation |

### Cluster E — Monitoring and Escalation

| Module | Name |
|---|---|
| MOD-25 | Incident Triage and Validation |
| MOD-26 | Duplicate Incident Detection and Merging |
| MOD-27 | Emergency Organization and Resource Registry |
| MOD-28 | Response Unit Availability and Readiness |
| MOD-29 | Incident-to-Response Capability Matrix |
| MOD-30 | Suitable Response Unit Recommendation |
| MOD-31 | Dispatcher Assignment and Dispatch Authorization |
| MOD-32 | Responder / Ambulance Crew Mobile Interface |

### Cluster F — Field Response and Coordination

| Module | Name |
|---|---|
| MOD-33 | Secure Incident Communication |
| MOD-34 | Multi-Agency Coordination |
| MOD-35 | Resource Request and Mutual Aid |
| MOD-36 | Incident Command / ICS Support |
| MOD-37 | On-Scene Patient Assessment |
| MOD-38 | Hospital Receiving Coordination |
| MOD-39 | Hospital and Receiving Facility Registry |
| MOD-40 | Transport and Destination Tracking |

### Cluster G — Status, Escalation, and Closure

| Module | Name |
|---|---|
| MOD-41 | Dispatcher SLA and Escalation Engine |
| MOD-42 | User-Facing Emergency Status |
| MOD-43 | Live ETA and Responder Tracking |
| MOD-44 | Incident Handover |
| MOD-45 | Incident Resolution and Closure |

### Cluster H — Governance and Compliance

| Module | Name |
|---|---|
| MOD-46 | Immutable Audit Trail |
| MOD-47 | Role-Based Access Control |
| MOD-48 | Privacy, Consent and Medical Data Protection |
| MOD-49 | System Administration and Account Management |

### Cluster I — Analytics, Intelligence, and Surge

| Module | Name |
|---|---|
| MOD-50 | Emergency Response Analytics |
| MOD-51 | Emergency Intelligence and Risk Visualization |
| MOD-52 | Disaster Surge and Mass-Casualty Mode |

### Cluster J — Municipal Broadcast (Bocaue-Specific)

| Module | Name |
|---|---|
| MOD-53 | Municipal Announcements and Public Broadcast |

---

## 34. Technical Module Mapping

```
MOD-01  → backend/users + mobile/auth + mobile/profile
MOD-02  → backend/emergency-contacts + mobile/contacts
MOD-03  → backend/medical-profiles + mobile/medical
MOD-04  → mobile UI accessibility layer + i18n config
MOD-05  → mobile/permissions + mobile/settings
MOD-06  → mobile/emergency/sos.tsx + backend/emergency-alerts
MOD-07  → mobile/services/shake-detector + backend/emergency-alerts
MOD-08  → mobile/emergency/confirmation.tsx + backend/false-alerts
MOD-09  → mobile/emergency/incident-details.tsx + backend/incidents
MOD-10  → mobile/emergency + backend/media + object storage
MOD-11  → mobile/services/gps + backend/locations/gps
MOD-12  → backend/locations/geocoding + map provider API
MOD-13  → backend/locations/live-tracking + backend/realtime
MOD-14  → backend/incidents (core) + backend/emergency-alerts
MOD-15  → backend/incidents/incident-status
MOD-16  → backend/notifications (push + SMS)
MOD-17  → backend/notifications/sms + Textbee + backend/realtime
MOD-18  → backend/notifications + backend/dispatch
MOD-19  → mobile/services/offline + backend/offline-sync
MOD-20  → backend/realtime/websocket.gateway.ts
MOD-21  → frontend/operations/page.tsx + realtime subscriptions
MOD-22  → frontend/operations/map + map provider
MOD-23  → frontend/operations/incidents (queue view)
MOD-24  → backend/dispatch/priority
MOD-25  → backend/incidents/incident-validation
MOD-26  → backend/incidents/incident-validation (dedup logic)
MOD-27  → backend/organizations + backend/resources
MOD-28  → backend/fleet + realtime
MOD-29  → backend/dispatch/resource-matching
MOD-30  → backend/dispatch/resource-matching (recommendation)
MOD-31  → backend/dispatch/assignment + frontend/operations/dispatch
MOD-32  → mobile/emergency (responder-specific routes) + backend/responders
MOD-33  → backend/realtime (incident-scoped chat) + frontend + mobile
MOD-34  → backend/organizations + backend/incidents (multi-org)
MOD-35  → backend/resources (inter-org requests)
MOD-36  → backend/incidents (ICS state) + frontend/operations
MOD-37  → backend/incidents + mobile (responder assessment form)
MOD-38  → backend/hospitals + backend/incidents
MOD-39  → backend/hospitals + frontend/hospitals
MOD-40  → backend/locations + backend/hospitals + realtime
MOD-41  → backend/dispatch/escalation + BullMQ timers
MOD-42  → mobile/emergency/status.tsx + realtime
MOD-43  → backend/locations + map routing API + realtime
MOD-44  → backend/incidents (handover state) + frontend
MOD-45  → backend/incidents + frontend/operations
MOD-46  → backend/audit (all modules write here)
MOD-47  → backend/permissions + backend/common/guards
MOD-48  → backend/privacy + backend/consent
MOD-49  → backend/administration + frontend/administration
MOD-50  → backend/analytics + frontend/reports
MOD-51  → backend/risk-intelligence + frontend/analytics + PostGIS
MOD-52  → backend/disaster-mode + frontend/operations (surge view)
MOD-53  → backend/announcements + mobile/announcements + frontend/announcements
```

---

## 35. UI/UX Architecture

### Citizen Mobile App Flow

```
Splash / Onboarding
  ↓
Permissions setup (GPS, notifications, motion)
  ↓
Optional registration (guest path always available)
  ↓
Home screen
  ├─ Large SOS button (always visible)
  ├─ Announcements feed (public, no login needed)
  └─ Profile / settings
  ↓
On SOS or shake trigger:
  3-second cancel → incident details form → status screen
  ↓
Status screen: Received → Dispatched → En Route (ETA) → Arrived
  ↓
Incident closure confirmation
```

### Operations Center Dashboard Flow

```
Login → Dashboard
  ↓
Active incident queue (sorted by priority)
  ↓
Live map with incident pins and resource positions
  ├─ New alert: alarm sounds, red pin appears
  ├─ Select incident → detail panel opens
  │   ├─ GPS location, address, barangay
  │   ├─ Incident type, condition, details
  │   ├─ Photo (if attached)
  │   ├─ Reporter profile (if registered)
  │   └─ Patient info (if known)
  └─ Dispatch panel
      ├─ Available resources ranked by proximity
      ├─ Confirm assignment (one click)
      └─ SLA timer visible
  ↓
Live monitoring of dispatched incident
  ↓
Closure and timeline review
```

### Responder Mobile App Flow

```
Login → Availability status
  ↓
Assignment received → incident summary (type, location, patient)
  ↓
Accept / Acknowledge
  ↓
Navigate (GPS to incident location)
  ↓
Status updates: En Route → Arrived → On Scene → Complete
  ↓
Assessment form (field observations)
  ↓
Facility coordination (if transport)
  ↓
Case closure
```

---

## 36. Connectivity and Resilience

**Priority order of transmission:**

```
1. Data path (HTTPS REST) — fastest, most information
2. SMS path (Textbee) — fires simultaneously with data path
3. Offline local queue — fires when any connectivity returns
```

**The system must never silently fail.** Every state — connected, degraded, offline — must produce a clear UI indicator. "Saved on your device" is a valid and correct state, not an error.

**Specific Bocaue resilience requirements:**
- Typhoon season floods Barangays Lolomboy, Bunlo, Igulot, and Bambang — connectivity in these areas is degraded seasonally
- The SMS path uses Textbee (Android device SIM gateway) which delivers via the local carrier SIM inserted in the gateway device
- The offline queue uses a unique client event ID per alert to prevent duplicate incidents when the queue flushes after a signal returns

---

## 37. Disaster and Surge Mode (MOD-52)

Activated when:
- A mass-casualty or large-scale incident is declared by an authorized supervisor
- A typhoon or flood event produces a surge of simultaneous incidents

Surge mode functions:
```
Surge dashboard — all active incidents in a consolidated mass view
Multi-patient grouping — one incident record with multiple patient tags
START triage support — patient tagging (Immediate, Delayed, Minor, Deceased)
Resource surge view — all available units across all organizations
Inter-agency broadcast — organization-wide alert to all responders
Simplified responder reporting — reduced form fields under mass-casualty conditions
ICS integration — activates MOD-36 command structure automatically
Mutual aid request — MOD-35 resource requests at scale
```

For Bocaue specifically: a fireworks factory explosion in Bundukan or Biñang 1st is a real-world mass-casualty scenario for which this module is the designated response mechanism.

---

## 38. Analytics and Reporting (MOD-50, MOD-51)

**Operational metrics tracked per incident:**

```
Time to Report         — incident trigger timestamp
Time to Receive        — incident record created
Time to Acknowledge    — dispatcher acknowledgement
Time to Assess         — dispatch decision point
Time to Dispatch       — resource assigned
Time to En Route       — responder accepted
Time to Arrival        — responder marked on scene
Time to Resolution     — incident resolved
Total Response Time    — trigger to resolution
```

**Reports generated:**
- Per-incident response timeline (auto-compiled at closure)
- Daily/weekly/monthly response time averages
- Incident volume by category, barangay, and time of day
- SLA breach analysis by dispatcher and incident type
- Resource utilization and deployment frequency
- False alert rate and pattern analysis

**Risk Visualization (MOD-51):**
- Incident heatmap by barangay and incident type
- Flood-zone awareness overlay (Bocaue River barangays)
- Seasonal trend analysis (typhoon season vs. dry season)
- High-risk intersection identification (MacArthur Highway, NLEX Interchange)

---

## 39. Development Phases

### Phase 1 — Critical Emergency Path (MVP)

```
Authentication and user registration
SOS button and shake trigger
Incident creation and GPS capture
Incident detail form
Dual-path transmission (data + SMS)
Operations Center dashboard (basic)
Dispatcher acknowledge and dispatch
Responder status updates
Citizen status screen
Incident closure
```

### Phase 2 — Real-Time Response

```
WebSocket engine
Live responder tracking
Fleet status board
ETA calculation and display
Emergency contact auto-notification
Push notifications
```

### Phase 3 — Resilience

```
Offline queue and retry
SMS fallback path
Deduplication
SLA escalation timers
```

### Phase 4 — Operational Completeness

```
Hospitals and evacuation center registry
Resource capability matrix
Medical profile
Incident photos
False alert management
Audit trail
Multi-agency coordination (BFP partnership)
```

### Phase 5 — Intelligence and Broadcast

```
Disaster and surge mode
Risk visualization and heatmap
Advanced analytics
Announcements module (MOD-53)
Operational optimization
```

---

## 40. Testing Strategy

### Unit Tests

```
Incident validation rules
Status transition rules and guards
Permission and authorization logic
Priority scoring algorithm
Dispatch matching rules
Notification trigger conditions
Escalation timer conditions
Deduplication logic
SMS payload compression
```

### Integration Tests

```
API + PostgreSQL (all CRUD operations)
API + Redis (session and job state)
API + notification services (FCM, Textbee)
API + WebSocket (event distribution)
API + object storage (photo upload)
Offline sync reconciliation
```

### End-to-End Tests (Core Emergency Flow)

```
SOS pressed
  → Incident created in database
  → Operations Center dashboard receives alert
  → Dispatcher acknowledges
  → Resource assigned
  → Responder receives dispatch
  → Responder goes en route
  → ETA appears on citizen app
  → Emergency contact receives SMS
  → Responder marks arrived
  → Incident resolved and closed
  → Timeline logged in analytics
  → Audit trail complete
```

### Failure Tests

```
No internet connection during SOS
  → Alert saved to offline queue
  → Fires on reconnection
  → No duplicate incident created

SMS provider down
  → Data path succeeds independently
  → Failure logged and retried

GPS unavailable
  → Incident created with null location
  → Manually entered location accepted

Push notification failure
  → Incident not deleted
  → SMS fallback attempted
  → Failure logged

App killed during active incident
  → Incident state preserved in database
  → Status visible on reconnection
```

---

## 41. Observability

Production monitoring requirements:

```
Structured JSON logs          — all API requests and errors
Error tracking                — Sentry or equivalent
Health check endpoints        — /health (backend, database, Redis)
API latency monitoring        — p50, p95, p99 per endpoint
Database connection pool       — active connections, query time
Redis queue depth              — BullMQ pending/failed job counts
Notification delivery rate     — FCM success rate, SMS success rate
Incident processing time       — alert-to-database latency
WebSocket connection count     — active authenticated connections
```

**Never log:** passwords, JWT tokens, full medical profile content, or unnecessary personal data.

---

## 42. Backup and Recovery

```
PostgreSQL:
  - Scheduled automated backups (daily minimum)
  - Protected offsite backup storage
  - 30-day retention minimum
  - Tested restoration procedure (monthly)
  - Documented recovery owner and contact
  - Recovery time objective (RTO): defined per deployment

Object storage:
  - Replication configured at storage provider level
  - Incident photos retained for the duration defined in data retention policy

Redis:
  - Persistence configured (RDB snapshot minimum)
  - Redis failure should not lose incident records (PostgreSQL is source of truth)
```

---

## 43. Dependency Policy

```
Node.js:        Current supported LTS version
Package manager: pnpm
TypeScript:     Current stable compatible version
Framework packages: current stable compatible releases
Lockfile:       committed to Git (pnpm-lock.yaml)
```

**Process for new installations:**
1. Install current Node.js LTS
2. Use current compatible stable releases of Next.js, NestJS, Expo, React Native, Prisma, Tailwind
3. Let pnpm resolve compatible versions
4. Commit the resulting lockfile
5. Run the emergency-flow test suite after any dependency upgrade
6. Do not use unbounded `latest` in production dependency manifests

---

## 44. Environment Variables

```
# Database
DATABASE_URL=

# Redis
REDIS_URL=

# Authentication
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRY=
JWT_REFRESH_EXPIRY=

# Firebase (push notifications)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# SMS (Textbee — Android device SMS gateway)
TEXTBEE_API_KEY=
TEXTBEE_DEVICE_ID=
MDRRMO_OPS_PHONE=

# Map provider
MAP_PROVIDER_API_KEY=
MAP_PROVIDER_GEOCODING_URL=
MAP_PROVIDER_ROUTING_URL=

# Object storage (incident photos)
STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=

# Application
API_BASE_URL=
WEBSOCKET_URL=
FRONTEND_URL=

# Bocaue operational settings
BOCAUE_RIVER_CRITICAL_LEVEL_METERS=11.50
DEFAULT_SLA_ACKNOWLEDGE_SECONDS=120
DEFAULT_SLA_DISPATCH_SECONDS=300
```

Never commit real credentials. Use `.env.example` with placeholder values in version control.

---

## 45. Docker Development

```yaml
# docker-compose.yml (conceptual)
services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on: [postgres, redis]
    env_file: .env

  frontend:
    build: ./frontend
    ports: ["3001:3001"]
    env_file: .env

  postgres:
    image: postgis/postgis:16-3.4
    volumes: [postgres_data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: agap
      POSTGRES_USER: agap
      POSTGRES_PASSWORD: [from env]

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

volumes:
  postgres_data:
  redis_data:
```

The Expo mobile application runs through the Expo development server on the local machine, not as a Docker container.

---

## 46. Reliability Rules

1. Never lose the original emergency request because an optional service failed.
2. Persist the incident record before treating it as created.
3. Use unique client event IDs for all retries and offline events.
4. A failed push notification must never delete or cancel an incident.
5. A failed SMS must never delete or cancel an incident.
6. A failed ETA calculation must never stop dispatch.
7. Missing medical information must never stop dispatch.
8. Unknown patient identity must never stop dispatch.
9. Dispatcher remains responsible for operational decisions unless approved automation is explicitly enabled by the participating organization.
10. All consequential operational transitions must be recorded with actor and timestamp.
11. Offline retries must be idempotent (same event ID must produce the same result, not a duplicate incident).
12. ETA is always an estimate, never a guarantee.
13. SMS payload must always be under 160 characters to guarantee single-segment delivery.
14. Guest emergency reporting must always be available — registration must never be a barrier to getting help.

---

## 47. Architectural Rules

1. Incident is the central business object. Every module supports its lifecycle.
2. Reporter and patient are always separate concepts.
3. A patient can be unknown. This must never prevent a response.
4. A patient does not need an AGAP account.
5. Optional information (photos, medical profile, location) must never block emergency submission.
6. GPS is captured when available but its absence must not prevent incident creation.
7. PostgreSQL is the source of truth. WebSocket distributes changes; it does not replace persistence.
8. Queues handle background work and retries. Critical incident persistence is synchronous.
9. Dispatch recommendations assist authorized personnel. They never make the decision autonomously.
10. Existing 911 and MDRRMO hotline channels remain available. AGAP complements, not replaces.
11. Sensitive information follows least-privilege access at all times.
12. All consequential operational actions are auditable and attributable.
13. Offline retries are idempotent.
14. ETA is always labeled as an estimate.
15. AGAP must never reveal the identity of a nearby AGAP user to a stranger or bystander.
16. AGAP should claim reduced information and coordination delays — not guaranteed faster physical travel.
17. The Announcements module (MOD-53) is for one-way broadcast only. It is not an emergency dispatch mechanism.
18. All four of Bocaue's operational emergency categories are in scope: Medical & Trauma, Flood Operations, Fire & Industrial Hazards, and Post-Disaster Community Safety.

---

## 48. Definition of Done — Core Emergency System

```
[ ] Citizen can open AGAP without an account (guest path)
[ ] Citizen can trigger SOS with one button press
[ ] Citizen can trigger SOS by shaking the phone
[ ] 3-second cancel window prevents accidental alerts
[ ] Bystander can report an emergency without an account
[ ] Reporter and patient are always stored separately
[ ] Unknown patient is fully supported and does not block dispatch
[ ] GPS is captured automatically at trigger moment
[ ] Incident is persisted to PostgreSQL before any other action
[ ] Alert transmits simultaneously over data and SMS
[ ] Offline alert is queued and fires when connectivity returns
[ ] Duplicate offline events are prevented by client event ID
[ ] Operations Center receives the alert with alarm and map pin
[ ] Dispatcher can acknowledge, assess, and validate
[ ] Available resources are visible with real-time status
[ ] Dispatcher can assign a resource with one confirmed action
[ ] Responder receives assignment notification on crew app
[ ] Responder can navigate to GPS location
[ ] Responder can update status at each stage
[ ] Operations Center sees all status changes in real time
[ ] Citizen sees live status on their phone throughout
[ ] Emergency contacts receive automatic notification
[ ] ETA is calculated and shown when routing is available
[ ] SLA timer escalates stalled incidents automatically
[ ] Incident can be resolved and formally closed
[ ] Full response timeline is recorded at closure
[ ] Audit events are recorded for all consequential actions
[ ] Notification failure does not delete or cancel the incident
[ ] Medical profile and photo are optional and never block submission
[ ] MDRRMO administrator can manage resources and users
[ ] Announcements publisher can broadcast to registered and unregistered citizens
[ ] Full emergency flow has automated end-to-end tests
[ ] All 53 modules are documented with AL-MOD format docx files
```

---

## Final System Definition

AGAP is a **complete incident lifecycle platform** for Bocaue MDRRMO — from the first moment of an emergency through dispatch, field response, facility coordination, resolution, closure, and organizational learning.

```
REPORT       — citizen or bystander triggers alert
  ↓
LOCATE       — GPS captures exact position automatically
  ↓
DESCRIBE     — structured incident details in under 10 seconds
  ↓
TRANSMIT     — dual-path (data + SMS) to Operations Center
  ↓
RECEIVE      — dashboard alarm, map pin, structured data
  ↓
ASSESS       — dispatcher validates and prioritizes
  ↓
DISPATCH     — nearest capable resource, one-click authorization
  ↓
RESPOND      — crew navigates with patient info in hand
  ↓
MONITOR      — live status, ETA, escalation if stalled
  ↓
COORDINATE   — hospital or evacuation center pre-notified
  ↓
RESOLVE      — on-scene outcome recorded
  ↓
CLOSE        — full timeline compiled automatically
  ↓
BROADCAST    — municipal announcements reach all citizens (MOD-53)
  ↓
ANALYZE      — response times, heatmaps, risk patterns
  ↓
IMPROVE      — data-driven operational improvement
```

**The central principle of AGAP:**

> Make emergency information reach the right authorized people quickly, accurately, securely, and in a form that supports coordinated response — while keeping human emergency personnel in control of operational decisions.

---

*End of AGAP Complete Master Enterprise Architecture — Version 2.0*
*Total modules: 53 | Development team: 6 members | Context: Bocaue, Bulacan MDRRMO*
