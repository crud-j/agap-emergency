# AGAP — Complete Enterprise Folder Structure
## Repository: `AGAPSYSTEM-Backend-Frontend`
### Aligned with AGAP Complete Master Enterprise Architecture v2.0 — 53 Modules

This document defines the recommended complete repository, application, infrastructure, documentation, testing, and module-oriented folder structure for AGAP. It is based on the supplied AGAP Master Enterprise Architecture v2.0, which establishes a monorepo with `backend`, `frontend`, `mobile`, `shared`, `docs`, `infrastructure`, `scripts`, and GitHub workflows; NestJS backend, Next.js web, Expo/React Native mobile, PostgreSQL/Prisma, Redis/BullMQ, WebSocket, notifications, maps, object storage, analytics, risk intelligence, disaster mode, and MOD-53 announcements.

---

# 1. MASTER REPOSITORY TREE

```text
AGAPSYSTEM-Backend-Frontend/
│
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CHANGELOG.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .gitignore
├── .editorconfig
├── .prettierrc
├── .prettierignore
├── eslint.config.mjs
├── tsconfig.base.json
│
├── .env.example
├── .env.local.example
├── docker-compose.yml
├── docker-compose.prod.yml
│
├── docs/
├── backend/
├── frontend/
├── mobile/
├── shared/
├── infrastructure/
├── scripts/
├── tests/
│
└── .github/
    └── workflows/
```

The source architecture establishes `AGAPSYSTEM-Backend-Frontend` as the repository and the core workspace packages as `backend`, `frontend`, `mobile`, and `shared`. It also identifies `docs`, `infrastructure`, `scripts`, and GitHub workflows as repository-level areas. 

---

# 2. DOCUMENTATION STRUCTURE

```text
docs/
│
├── README.md
│
├── architecture/
│   ├── master-architecture.md
│   ├── system-overview.md
│   ├── system-context.md
│   ├── system-workflow.md
│   ├── emergency-workflow.md
│   ├── dispatch-workflow.md
│   ├── incident-lifecycle.md
│   ├── data-flow.md
│   ├── integration-architecture.md
│   ├── three-client-surfaces.md
│   ├── backend-architecture.md
│   ├── database-architecture.md
│   ├── realtime-architecture.md
│   ├── offline-architecture.md
│   ├── notification-architecture.md
│   ├── eta-architecture.md
│   ├── escalation-architecture.md
│   ├── fleet-architecture.md
│   ├── disaster-mode.md
│   └── announcements-architecture.md
│
├── modules/
│   ├── MOD-01-user-registration-profile.md
│   ├── MOD-02-emergency-contacts.md
│   ├── MOD-03-medical-profile.md
│   ├── MOD-04-accessibility-multilanguage.md
│   ├── MOD-05-emergency-readiness-permissions.md
│   ├── MOD-06-sos.md
│   ├── MOD-07-shake-to-alert.md
│   ├── MOD-08-cancellation-false-alert.md
│   ├── MOD-09-incident-details.md
│   ├── MOD-10-incident-photo-evidence.md
│   ├── MOD-11-gps-capture.md
│   ├── MOD-12-location-context-geocoding.md
│   ├── MOD-13-live-location-tracking.md
│   ├── MOD-14-incident-record-ticketing.md
│   ├── MOD-15-incident-lifecycle.md
│   ├── MOD-16-emergency-contact-notification.md
│   ├── MOD-17-multichannel-transmission.md
│   ├── MOD-18-responder-dispatch-messaging.md
│   ├── MOD-19-offline-queue-retry.md
│   ├── MOD-20-realtime-websocket.md
│   ├── MOD-21-operations-dashboard.md
│   ├── MOD-22-realtime-incident-map.md
│   ├── MOD-23-incident-command-queue.md
│   ├── MOD-24-severity-priority.md
│   ├── MOD-25-triage-validation.md
│   ├── MOD-26-duplicate-detection.md
│   ├── MOD-27-organization-resource-registry.md
│   ├── MOD-28-resource-availability.md
│   ├── MOD-29-capability-matrix.md
│   ├── MOD-30-resource-recommendation.md
│   ├── MOD-31-dispatch-authorization.md
│   ├── MOD-32-responder-mobile.md
│   ├── MOD-33-secure-communication.md
│   ├── MOD-34-multi-agency.md
│   ├── MOD-35-mutual-aid.md
│   ├── MOD-36-ics-support.md
│   ├── MOD-37-patient-assessment.md
│   ├── MOD-38-hospital-receiving.md
│   ├── MOD-39-hospital-registry.md
│   ├── MOD-40-transport-destination.md
│   ├── MOD-41-sla-escalation.md
│   ├── MOD-42-user-emergency-status.md
│   ├── MOD-43-live-eta-tracking.md
│   ├── MOD-44-incident-handover.md
│   ├── MOD-45-resolution-closure.md
│   ├── MOD-46-audit-trail.md
│   ├── MOD-47-rbac.md
│   ├── MOD-48-privacy-consent-medical-protection.md
│   ├── MOD-49-system-administration.md
│   ├── MOD-50-response-analytics.md
│   ├── MOD-51-risk-intelligence.md
│   ├── MOD-52-disaster-surge.md
│   └── MOD-53-municipal-announcements.md
│
├── operations/
│   ├── mdrrmo-bocaue-operations.md
│   ├── dispatcher-procedure.md
│   ├── responder-procedure.md
│   ├── hospital-receiving-procedure.md
│   ├── escalation-procedure.md
│   ├── incident-closure-procedure.md
│   ├── mutual-aid-procedure.md
│   ├── surge-mode-procedure.md
│   └── announcement-publishing-procedure.md
│
├── users/
│   ├── citizen.md
│   ├── bystander.md
│   ├── dispatcher.md
│   ├── supervisor.md
│   ├── responder.md
│   ├── hospital-user.md
│   ├── organization-admin.md
│   ├── announcements-publisher.md
│   └── system-admin.md
│
├── database/
│   ├── entity-relationship.md
│   ├── schema-overview.md
│   ├── tables.md
│   ├── indexes.md
│   ├── enums.md
│   ├── postgis.md
│   ├── data-retention.md
│   ├── seed-data.md
│   └── migration-policy.md
│
├── api/
│   ├── api-overview.md
│   ├── authentication.md
│   ├── incidents.md
│   ├── dispatch.md
│   ├── resources.md
│   ├── responders.md
│   ├── hospitals.md
│   ├── notifications.md
│   ├── locations.md
│   ├── announcements.md
│   ├── escalations.md
│   ├── analytics.md
│   ├── audit.md
│   └── administration.md
│
├── security/
│   ├── authentication.md
│   ├── authorization.md
│   ├── rbac.md
│   ├── privacy.md
│   ├── consent.md
│   ├── medical-data-protection.md
│   ├── encryption.md
│   ├── rate-limiting.md
│   ├── secrets-management.md
│   └── audit.md
│
├── automation/
│   ├── queues.md
│   ├── sms-jobs.md
│   ├── push-jobs.md
│   ├── contact-notification-jobs.md
│   ├── sla-jobs.md
│   ├── eta-jobs.md
│   ├── offline-sync-jobs.md
│   ├── analytics-jobs.md
│   ├── audit-jobs.md
│   └── announcement-broadcast-jobs.md
│
├── ui-ux/
│   ├── design-system.md
│   ├── figma/
│   ├── citizen-app/
│   ├── responder-app/
│   ├── operations-center/
│   ├── hospital-portal/
│   ├── administration/
│   ├── analytics/
│   ├── surge-mode/
│   └── announcements/
│
├── testing/
│   ├── test-strategy.md
│   ├── unit-testing.md
│   ├── integration-testing.md
│   ├── e2e-testing.md
│   ├── failure-testing.md
│   ├── offline-testing.md
│   ├── realtime-testing.md
│   └── security-testing.md
│
└── research/
    ├── requirements.md
    ├── stakeholder-interviews.md
    ├── operational-observations.md
    ├── emergency-hotline-context.md
    ├── bocaue-context.md
    └── assumptions-and-constraints.md
```

---

# 3. BACKEND — NESTJS MODULAR MONOLITH

```text
backend/
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   │
│   ├── common/
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── enums/
│   │   ├── exceptions/
│   │   ├── filters/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── middleware/
│   │   ├── pipes/
│   │   ├── serializers/
│   │   ├── types/
│   │   └── utils/
│   │
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   ├── firebase.config.ts
│   │   ├── sms.config.ts
│   │   ├── map.config.ts
│   │   ├── storage.config.ts
│   │   └── websocket.config.ts
│   │
│   ├── auth/
│   ├── users/
│   ├── emergency-contacts/
│   ├── medical-profiles/
│   ├── permissions/
│   ├── privacy/
│   ├── consent/
│   │
│   ├── incidents/
│   │   ├── incidents.module.ts
│   │   ├── incidents.controller.ts
│   │   ├── incidents.service.ts
│   │   ├── incident-validation/
│   │   ├── incident-status/
│   │   ├── incident-events/
│   │   ├── incident-patients/
│   │   ├── incident-reporters/
│   │   ├── incident-attachments/
│   │   ├── incident-handover/
│   │   ├── duplicate-detection/
│   │   ├── priority/
│   │   ├── triage/
│   │   └── dto/
│   │
│   ├── emergency-alerts/
│   │   ├── sos/
│   │   ├── transmission/
│   │   └── delivery-status/
│   │
│   ├── false-alerts/
│   ├── media/
│   ├── locations/
│   │   ├── gps/
│   │   ├── geocoding/
│   │   ├── live-tracking/
│   │   ├── routing/
│   │   └── dto/
│   │
│   ├── dispatch/
│   │   ├── priority/
│   │   ├── resource-matching/
│   │   ├── assignment/
│   │   ├── authorization/
│   │   ├── escalation/
│   │   └── dto/
│   │
│   ├── responders/
│   ├── resources/
│   ├── fleet/
│   ├── organizations/
│   ├── hospitals/
│   ├── facilities/
│   │
│   ├── notifications/
│   │   ├── push/
│   │   ├── sms/
│   │   ├── in-app/
│   │   ├── templates/
│   │   └── delivery/
│   │
│   ├── realtime/
│   │   ├── websocket.gateway.ts
│   │   ├── websocket-auth.guard.ts
│   │   ├── event-publisher.ts
│   │   ├── subscriptions/
│   │   └── events/
│   │
│   ├── offline-sync/
│   │   ├── reconciliation/
│   │   ├── idempotency/
│   │   └── dto/
│   │
│   ├── analytics/
│   ├── risk-intelligence/
│   ├── disaster-mode/
│   │
│   ├── announcements/
│   │   ├── publishing/
│   │   ├── scheduling/
│   │   ├── subscriptions/
│   │   ├── sms-broadcast/
│   │   ├── push-broadcast/
│   │   ├── delivery/
│   │   └── dto/
│   │
│   ├── audit/
│   ├── administration/
│   │   ├── users/
│   │   ├── organizations/
│   │   ├── configuration/
│   │   └── system-health/
│   │
│   ├── health/
│   └── jobs/
│       ├── sms/
│       ├── push/
│       ├── contacts/
│       ├── sla/
│       ├── eta/
│       ├── offline/
│       ├── analytics/
│       ├── audit/
│       └── announcements/
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   ├── seeds/
│   └── migrations/
│
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── fixtures/
│   └── helpers/
│
├── Dockerfile
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
└── package.json
```

The architecture specifies a Node.js LTS + NestJS TypeScript modular-monolith backend using Prisma, PostgreSQL/PostGIS, Redis, BullMQ, REST, WebSocket/Socket.io, and OpenAPI/Swagger.

---

# 4. FRONTEND — NEXT.JS WEB PLATFORM

```text
frontend/
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── login/
│   ├── dashboard/
│   ├── operations/
│   │   ├── page.tsx
│   │   ├── incidents/
│   │   ├── map/
│   │   ├── dispatch/
│   │   ├── responders/
│   │   ├── fleet/
│   │   ├── alerts/
│   │   ├── triage/
│   │   ├── command/
│   │   ├── multi-agency/
│   │   └── surge/
│   ├── hospitals/
│   │   ├── page.tsx
│   │   ├── incoming/
│   │   ├── referrals/
│   │   └── [referralId]/
│   ├── organizations/
│   ├── resources/
│   ├── responders/
│   ├── fleet/
│   ├── announcements/
│   │   ├── page.tsx
│   │   ├── create/
│   │   ├── [announcementId]/
│   │   ├── schedule/
│   │   └── delivery/
│   ├── reports/
│   ├── analytics/
│   │   ├── response/
│   │   └── risk/
│   ├── audit/
│   ├── users/
│   ├── administration/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── organizations/
│   │   ├── configuration/
│   │   └── system-health/
│   └── settings/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── navigation/
│   ├── maps/
│   ├── incidents/
│   ├── dispatch/
│   ├── triage/
│   ├── responders/
│   ├── fleet/
│   ├── hospitals/
│   ├── organizations/
│   ├── announcements/
│   ├── analytics/
│   ├── charts/
│   ├── audit/
│   ├── command/
│   ├── surge/
│   └── accessibility/
│
├── features/
│   ├── authentication/
│   ├── incident-management/
│   ├── dispatch/
│   ├── resource-management/
│   ├── hospital-coordination/
│   ├── announcements/
│   ├── analytics/
│   ├── risk-intelligence/
│   ├── disaster-mode/
│   └── administration/
│
├── hooks/
├── lib/
│   ├── api/
│   ├── auth/
│   ├── realtime/
│   ├── maps/
│   ├── permissions/
│   └── formatting/
├── providers/
├── types/
├── constants/
├── validation/
├── public/
│   ├── brand/
│   ├── icons/
│   └── images/
├── tests/
├── middleware.ts
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
└── package.json
```

The source architecture maps the Operations Center dashboard, live map, incidents, dispatch, responders, fleet, alerts, hospitals, organizations, reports, analytics, audit, users, administration, and MOD-53 announcements to the web surface.

---

# 5. MOBILE — EXPO / REACT NATIVE

The architecture uses mobile for citizens, bystanders, and responders. The recommended implementation keeps one Expo/React Native workspace with role-aware routes and shared components/services.

```text
mobile/
│
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── onboarding/
│   │   ├── index.tsx
│   │   ├── language.tsx
│   │   ├── accessibility.tsx
│   │   └── permissions.tsx
│   ├── auth/
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   ├── verify.tsx
│   │   ├── forgot-password.tsx
│   │   └── guest.tsx
│   ├── home/
│   │   ├── index.tsx
│   │   ├── announcements.tsx
│   │   └── quick-actions.tsx
│   ├── emergency/
│   │   ├── sos.tsx
│   │   ├── shake.tsx
│   │   ├── confirmation.tsx
│   │   ├── incident-type.tsx
│   │   ├── incident-details.tsx
│   │   ├── reporter-patient.tsx
│   │   ├── patient.tsx
│   │   ├── location.tsx
│   │   ├── photo.tsx
│   │   ├── transmission.tsx
│   │   ├── offline.tsx
│   │   ├── active-incident.tsx
│   │   ├── status.tsx
│   │   ├── tracking.tsx
│   │   ├── cancel.tsx
│   │   └── completed.tsx
│   ├── tracking/
│   ├── announcements/
│   │   ├── index.tsx
│   │   ├── [announcementId].tsx
│   │   └── subscribe-sms.tsx
│   ├── profile/
│   ├── medical/
│   │   ├── index.tsx
│   │   ├── edit.tsx
│   │   └── consent.tsx
│   ├── contacts/
│   ├── history/
│   ├── first-aid/
│   ├── settings/
│   │   ├── index.tsx
│   │   ├── language.tsx
│   │   ├── accessibility.tsx
│   │   ├── permissions.tsx
│   │   ├── notifications.tsx
│   │   ├── privacy.tsx
│   │   └── security.tsx
│   │
│   └── responder/
│       ├── index.tsx
│       ├── availability.tsx
│       ├── assignments.tsx
│       ├── assignment/
│       │   └── [assignmentId].tsx
│       ├── accept.tsx
│       ├── decline.tsx
│       ├── en-route.tsx
│       ├── navigation.tsx
│       ├── arrived.tsx
│       ├── assessment.tsx
│       ├── multi-patient.tsx
│       ├── transport-decision.tsx
│       ├── hospital-coordination.tsx
│       ├── transporting.tsx
│       ├── facility-arrival.tsx
│       ├── handover.tsx
│       ├── communication.tsx
│       └── completion.tsx
│
├── src/
│   ├── components/
│   │   ├── ui/
│   │   ├── emergency/
│   │   ├── maps/
│   │   ├── incidents/
│   │   ├── responder/
│   │   ├── announcements/
│   │   └── accessibility/
│   ├── services/
│   │   ├── api/
│   │   ├── gps/
│   │   ├── sms/
│   │   ├── offline/
│   │   ├── websocket/
│   │   ├── notifications/
│   │   ├── shake-detector/
│   │   ├── media/
│   │   └── secure-storage/
│   ├── stores/
│   │   ├── auth/
│   │   ├── incident/
│   │   ├── responder/
│   │   ├── location/
│   │   ├── connectivity/
│   │   └── settings/
│   ├── hooks/
│   ├── constants/
│   ├── types/
│   ├── validation/
│   ├── i18n/
│   │   ├── en/
│   │   └── fil/
│   └── utils/
│
├── assets/
│   ├── brand/
│   │   └── agap-logo.*
│   ├── icons/
│   ├── illustrations/
│   └── images/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── app.json
├── eas.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
└── package.json
```

The architecture specifies Expo Router, Expo Location, Expo Notifications, Expo Secure Store, Expo Sensors, Camera/Image Picker, TanStack Query, Zustand, and Zod for mobile.

---

# 6. SHARED PACKAGE

```text
shared/
│
├── src/
│   ├── types/
│   │   ├── user.ts
│   │   ├── incident.ts
│   │   ├── patient.ts
│   │   ├── reporter.ts
│   │   ├── location.ts
│   │   ├── dispatch.ts
│   │   ├── resource.ts
│   │   ├── responder.ts
│   │   ├── hospital.ts
│   │   ├── notification.ts
│   │   ├── announcement.ts
│   │   ├── escalation.ts
│   │   └── audit.ts
│   ├── constants/
│   │   ├── incident.ts
│   │   ├── emergency.ts
│   │   ├── dispatch.ts
│   │   ├── notification.ts
│   │   ├── roles.ts
│   │   └── announcements.ts
│   ├── enums/
│   │   ├── incident-status.ts
│   │   ├── incident-type.ts
│   │   ├── priority.ts
│   │   ├── resource-type.ts
│   │   ├── resource-status.ts
│   │   ├── user-role.ts
│   │   ├── notification-channel.ts
│   │   ├── announcement-category.ts
│   │   └── announcement-severity.ts
│   ├── validation/
│   │   ├── incident.ts
│   │   ├── location.ts
│   │   ├── dispatch.ts
│   │   ├── responder.ts
│   │   └── announcement.ts
│   └── events/
│       ├── incident-events.ts
│       ├── dispatch-events.ts
│       ├── responder-events.ts
│       ├── notification-events.ts
│       └── announcement-events.ts
│
├── package.json
└── tsconfig.json
```

The source architecture explicitly includes shared types, constants, enums, and validation.

---

# 7. DATABASE / PRISMA

```text
backend/prisma/
│
├── schema.prisma
├── migrations/
│   ├── 2026xxxx_initial/
│   ├── 2026xxxx_incidents/
│   ├── 2026xxxx_dispatch/
│   ├── 2026xxxx_notifications/
│   ├── 2026xxxx_announcements/
│   └── ...
├── seed.ts
└── seeds/
    ├── roles.seed.ts
    ├── permissions.seed.ts
    ├── organizations.seed.ts
    ├── incident-types.seed.ts
    ├── resources.seed.ts
    ├── hospitals.seed.ts
    ├── announcement-categories.seed.ts
    └── system-config.seed.ts
```

Core entities defined in the architecture:

```text
Incident
IncidentReporter
IncidentPatient
IncidentEvent
IncidentLocation
IncidentAttachment

User
Role
Permission
Organization
OrganizationMembership
EmergencyContact
MedicalProfile
ConsentRecord

Dispatch
DispatchAssignment
Resource
Vehicle
Responder
ResponderLocation
Hospital
HospitalCapability
EvacuationCenter

Notification
NotificationDelivery

Announcement
SmsSubscriber
AnnouncementDelivery

Escalation
AuditLog
FalseAlert
FeedbackRating
RiskArea
SystemConfiguration
```

The source architecture states that these entities use UUID primary keys and UTC timestamps, with sensitive data encrypted at rest.

---

# 8. INFRASTRUCTURE

```text
infrastructure/
│
├── docker/
│   ├── backend/
│   │   └── Dockerfile
│   ├── frontend/
│   │   └── Dockerfile
│   ├── postgres/
│   └── redis/
│
├── database/
│   ├── postgres/
│   │   ├── init/
│   │   ├── backups/
│   │   └── scripts/
│   └── postgis/
│
├── nginx/
│   ├── nginx.conf
│   ├── conf.d/
│   └── ssl/
│
├── monitoring/
│   ├── health/
│   ├── logs/
│   └── metrics/
│
├── deployment/
│   ├── development/
│   ├── staging/
│   └── production/
│
└── environments/
    ├── development.example.env
    ├── staging.example.env
    └── production.example.env
```

The source architecture specifies Docker/Docker Compose for PostgreSQL, Redis, backend, and frontend; Expo mobile normally runs through the mobile development environment rather than being a mandatory Docker service.

---

# 9. SCRIPTS

```text
scripts/
├── setup/
│   ├── setup-dev.sh
│   ├── setup-env.sh
│   └── install-dependencies.sh
├── database/
│   ├── migrate.sh
│   ├── seed.sh
│   ├── reset.sh
│   ├── backup.sh
│   └── restore.sh
├── development/
│   ├── start-all.sh
│   ├── start-backend.sh
│   ├── start-frontend.sh
│   └── start-mobile.sh
├── testing/
│   ├── test-all.sh
│   ├── test-e2e.sh
│   └── test-offline.sh
├── codegen/
│   ├── generate-api-types.sh
│   └── generate-openapi.sh
└── maintenance/
    ├── cleanup.sh
    └── health-check.sh
```

---

# 10. TESTING STRUCTURE

```text
tests/
├── unit/
│   ├── auth/
│   ├── users/
│   ├── incidents/
│   ├── dispatch/
│   ├── resources/
│   ├── responders/
│   ├── hospitals/
│   ├── notifications/
│   ├── announcements/
│   ├── escalation/
│   ├── privacy/
│   └── permissions/
├── integration/
│   ├── api-postgres/
│   ├── api-redis/
│   ├── api-notifications/
│   ├── api-websocket/
│   ├── api-storage/
│   └── offline-sync/
├── e2e/
│   ├── citizen/
│   ├── responder/
│   ├── operations/
│   ├── hospital/
│   └── announcements/
├── failure/
│   ├── no-internet/
│   ├── slow-internet/
│   ├── gps-unavailable/
│   ├── sms-failure/
│   ├── push-failure/
│   ├── redis-failure/
│   ├── provider-failure/
│   ├── duplicate-request/
│   ├── responder-offline/
│   ├── browser-closed/
│   └── app-killed/
└── fixtures/
    ├── incidents/
    ├── users/
    ├── responders/
    ├── resources/
    ├── hospitals/
    └── announcements/
```

The architecture calls for unit, integration, E2E, and failure testing covering incident validation, permissions, status transitions, priority, dispatch matching, notification, escalation, duplicate prevention, offline synchronization, provider failures, and the full SOS-to-closure flow.

---

# 11. GITHUB CI/CD

```text
.github/
├── workflows/
│   ├── backend.yml
│   ├── frontend.yml
│   ├── mobile.yml
│   ├── tests.yml
│   ├── lint.yml
│   ├── typecheck.yml
│   ├── security.yml
│   └── release.yml
├── dependabot.yml
└── pull_request_template.md
```

The source architecture already identifies backend, frontend, mobile, and tests workflows.

---

# 12. ENVIRONMENT AND SECRETS

```text
.env.example
.env.local.example

backend/.env
backend/.env.local
frontend/.env.local
mobile/.env
```

Expected configuration categories:

```text
DATABASE_URL
REDIS_URL

JWT_SECRET
JWT_REFRESH_SECRET

FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY

SMS_PROVIDER
SMS_API_KEY

MAP_PROVIDER
MAP_API_KEY

STORAGE_ENDPOINT
STORAGE_BUCKET
STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY

WEBSOCKET_URL
```

Never commit real credentials.

---

# 13. COMPLETE 53-MODULE TECHNICAL MAPPING

| Module | Primary implementation |
|---|---|
| MOD-01 | `backend/users` + `mobile/auth` + `mobile/profile` |
| MOD-02 | `backend/emergency-contacts` + `mobile/contacts` |
| MOD-03 | `backend/medical-profiles` + `mobile/medical` |
| MOD-04 | mobile accessibility/i18n + shared config |
| MOD-05 | mobile permissions/settings |
| MOD-06 | `mobile/app/emergency/sos.tsx` + `backend/emergency-alerts` |
| MOD-07 | `mobile/src/services/shake-detector` + `backend/emergency-alerts` |
| MOD-08 | confirmation UI + `backend/false-alerts` |
| MOD-09 | incident details UI + `backend/incidents` |
| MOD-10 | mobile media + `backend/media` |
| MOD-11 | mobile GPS + `backend/locations/gps` |
| MOD-12 | `backend/locations/geocoding` |
| MOD-13 | live tracking + realtime |
| MOD-14 | `backend/incidents` + emergency alerts |
| MOD-15 | incident status |
| MOD-16 | notifications |
| MOD-17 | notification transmission/SMS |
| MOD-18 | notifications + dispatch |
| MOD-19 | mobile offline + backend offline-sync |
| MOD-20 | backend realtime |
| MOD-21 | frontend Operations Center |
| MOD-22 | frontend Operations map |
| MOD-23 | frontend incident queue |
| MOD-24 | dispatch priority |
| MOD-25 | incident validation/triage |
| MOD-26 | duplicate detection |
| MOD-27 | organizations + resources |
| MOD-28 | fleet + realtime |
| MOD-29 | resource matching |
| MOD-30 | resource recommendation |
| MOD-31 | dispatch assignment/authorization |
| MOD-32 | responder mobile + backend responders |
| MOD-33 | realtime incident communication |
| MOD-34 | organizations + incidents |
| MOD-35 | resources / inter-org requests |
| MOD-36 | incident ICS + Operations Center |
| MOD-37 | incident assessment + responder mobile |
| MOD-38 | hospitals + incidents |
| MOD-39 | hospitals + hospital frontend |
| MOD-40 | locations + hospitals + realtime |
| MOD-41 | escalation + BullMQ |
| MOD-42 | mobile emergency status + realtime |
| MOD-43 | locations + routing + realtime |
| MOD-44 | incident handover + frontend |
| MOD-45 | incidents + Operations frontend |
| MOD-46 | audit |
| MOD-47 | permissions + common guards |
| MOD-48 | privacy + consent |
| MOD-49 | administration + admin frontend |
| MOD-50 | analytics + reports |
| MOD-51 | risk intelligence + PostGIS |
| MOD-52 | disaster mode + Operations surge view |
| MOD-53 | announcements backend + mobile + frontend |

This follows the source architecture's technical module mapping.

---

# 14. REAL-TIME EVENTS

```text
backend/src/realtime/
├── websocket.gateway.ts
├── websocket-auth.guard.ts
├── event-publisher.ts
├── subscriptions/
│   ├── citizen.subscription.ts
│   ├── responder.subscription.ts
│   ├── dispatcher.subscription.ts
│   ├── hospital.subscription.ts
│   └── admin.subscription.ts
└── events/
    ├── incident.events.ts
    ├── dispatch.events.ts
    ├── resource.events.ts
    ├── responder.events.ts
    ├── notification.events.ts
    ├── escalation.events.ts
    └── announcement.events.ts
```

Core events:

```text
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

announcement.published
```

The architecture requires authenticated WebSocket connections with subscriptions scoped by role and organization; citizens receive only their own incident events.

---

# 15. BACKGROUND JOBS

```text
backend/src/jobs/
├── sms/
│   ├── emergency-sms.processor.ts
│   └── announcement-sms.processor.ts
├── push/
│   └── push-notification.processor.ts
├── contacts/
│   └── emergency-contact.processor.ts
├── sla/
│   └── sla-timer.processor.ts
├── eta/
│   └── eta-refresh.processor.ts
├── offline/
│   └── offline-reconciliation.processor.ts
├── analytics/
│   └── analytics-event.processor.ts
├── audit/
│   └── audit-event.processor.ts
└── announcements/
    ├── announcement-publish.processor.ts
    └── announcement-delivery.processor.ts
```

The architecture specifies BullMQ/Redis background processing for SMS, push, emergency contacts, SLA timers, ETA refresh, offline reconciliation, analytics, audit, and MOD-53 announcement broadcast, while the critical incident is persisted first.

---

# 16. INCIDENT DOMAIN

```text
backend/src/incidents/
├── incidents.module.ts
├── incidents.controller.ts
├── incidents.service.ts
├── incident.entity.ts
├── incident-validation/
├── incident-status/
├── incident-events/
├── incident-reporters/
├── incident-patients/
├── incident-location/
├── incident-attachments/
├── incident-handover/
├── duplicate-detection/
├── triage/
├── priority/
└── closure/
```

Incident is the central business object. Reporter and patient remain separate concepts, and unknown patient identity is supported.

---

# 17. DISPATCH DOMAIN

```text
backend/src/dispatch/
├── dispatch.module.ts
├── dispatch.controller.ts
├── dispatch.service.ts
├── priority/
├── triage/
├── resource-matching/
├── assignment/
├── authorization/
├── escalation/
├── reassignment/
├── dispatch-events/
└── dto/
```

```text
Incident
  ↓
Triage / Assessment
  ↓
Required Capability
  ↓
Available Resources
  ↓
Suitable Resource Recommendation
  ↓
Dispatcher Review
  ↓
Dispatch Authorization
  ↓
Responder Notification
  ↓
Responder Acknowledgement
```

The architecture explicitly requires dispatcher review and authorization after resource recommendation.

---

# 18. RESOURCE / FLEET / RESPONDER DOMAIN

```text
backend/src/resources/
├── resource.module.ts
├── resource.controller.ts
├── resource.service.ts
├── capabilities/
├── availability/
└── matching/

backend/src/fleet/
├── fleet.module.ts
├── fleet.controller.ts
├── fleet.service.ts
├── vehicles/
├── status/
├── locations/
└── readiness/

backend/src/responders/
├── responders.module.ts
├── responders.controller.ts
├── responders.service.ts
├── assignments/
├── availability/
├── locations/
├── status/
└── assessments/
```

Resource data includes organization, vehicle, resource type, status, capability, crew, current location, current incident, and operational availability.

---

# 19. HOSPITAL / FACILITY DOMAIN

```text
backend/src/hospitals/
├── hospitals.module.ts
├── hospitals.controller.ts
├── hospitals.service.ts
├── capabilities/
├── receiving/
├── referrals/
├── availability/
└── handover/

backend/src/facilities/
├── facilities.module.ts
├── facilities.controller.ts
├── facilities.service.ts
├── evacuation-centers/
└── capabilities/

frontend/app/hospitals/
├── page.tsx
├── incoming/
├── referrals/
└── [referralId]/

mobile/app/responder/
├── hospital-coordination.tsx
├── transporting.tsx
└── facility-arrival.tsx
```

---

# 20. MOD-53 ANNOUNCEMENTS DOMAIN

```text
backend/src/announcements/
├── announcements.module.ts
├── announcements.controller.ts
├── announcements.service.ts
├── publishing/
├── scheduling/
├── subscriptions/
├── sms-broadcast/
├── push-broadcast/
├── delivery/
└── dto/

frontend/app/announcements/
├── page.tsx
├── create/
├── [announcementId]/
├── schedule/
└── delivery/

mobile/app/announcements/
├── index.tsx
├── [announcementId].tsx
└── subscribe-sms.tsx
```

MOD-53 is a one-way municipal broadcast capability, distinct from emergency dispatch.

---

# 21. SECURITY / PRIVACY DOMAIN

```text
backend/src/
├── auth/
├── permissions/
├── privacy/
├── consent/
└── audit/

docs/security/
├── authentication.md
├── authorization.md
├── rbac.md
├── privacy.md
├── consent.md
├── encryption.md
├── rate-limiting.md
├── secrets-management.md
└── audit.md
```

Security path:

```text
Client
  ↓
HTTPS / TLS
  ↓
NestJS API
  ↓
JWT Authentication
  ↓
Role Authorization
  ↓
Organization Scope
  ↓
Ownership Check
  ↓
Permission Check
  ↓
Input Validation
  ↓
Business Logic
  ↓
Prisma
  ↓
PostgreSQL
```

---

# 22. FINAL CONCEPTUAL TREE

```text
AGAPSYSTEM-Backend-Frontend/
│
├── backend/
│   ├── auth/
│   ├── users/
│   ├── emergency-contacts/
│   ├── medical-profiles/
│   ├── permissions/
│   ├── privacy/
│   ├── consent/
│   ├── incidents/
│   ├── emergency-alerts/
│   ├── false-alerts/
│   ├── media/
│   ├── locations/
│   ├── dispatch/
│   ├── responders/
│   ├── resources/
│   ├── fleet/
│   ├── organizations/
│   ├── hospitals/
│   ├── facilities/
│   ├── notifications/
│   ├── realtime/
│   ├── offline-sync/
│   ├── analytics/
│   ├── risk-intelligence/
│   ├── disaster-mode/
│   ├── announcements/
│   ├── audit/
│   ├── administration/
│   ├── health/
│   └── jobs/
│
├── frontend/
│   ├── operations/
│   ├── incidents/
│   ├── dispatch/
│   ├── map/
│   ├── responders/
│   ├── fleet/
│   ├── hospitals/
│   ├── organizations/
│   ├── announcements/
│   ├── reports/
│   ├── analytics/
│   ├── audit/
│   ├── users/
│   └── administration/
│
├── mobile/
│   ├── citizen/emergency/
│   ├── citizen/announcements/
│   ├── citizen/profile/
│   ├── citizen/medical/
│   ├── citizen/contacts/
│   ├── citizen/history/
│   ├── responder/assignments/
│   ├── responder/navigation/
│   ├── responder/assessment/
│   ├── responder/transport/
│   ├── responder/hospital/
│   ├── responder/communication/
│   └── services/
│       ├── gps/
│       ├── sms/
│       ├── offline/
│       ├── websocket/
│       └── notifications/
│
├── shared/
│   ├── types/
│   ├── constants/
│   ├── enums/
│   ├── validation/
│   └── events/
│
├── docs/
│   ├── architecture/
│   ├── modules/
│   ├── operations/
│   ├── users/
│   ├── database/
│   ├── api/
│   ├── security/
│   ├── automation/
│   ├── ui-ux/
│   ├── testing/
│   └── research/
│
├── infrastructure/
├── scripts/
├── tests/
└── .github/workflows/
```

---

# 23. ARCHITECTURAL RULES THAT THE FOLDER STRUCTURE MUST PRESERVE

1. Incident is the central business object.
2. Reporter and patient are separate concepts.
3. Unknown patient identity is valid.
4. A patient does not need an AGAP account.
5. Guest emergency reporting remains available.
6. Optional photos, medical data, and location details must not block emergency submission.
7. GPS is best-effort.
8. PostgreSQL is the source of truth.
9. WebSocket distributes real-time changes but does not replace persistence.
10. Queues handle background processing and retries.
11. Critical incident persistence occurs before background jobs are relied upon.
12. Offline retries are idempotent.
13. Dispatch recommendations assist authorized personnel; they do not silently make the operational decision.
14. Consequential operational actions are attributable and auditable.
15. ETA is an estimate.
16. Notification failure must not delete or cancel an incident.
17. Sensitive information follows least-privilege access.
18. Existing 911 and MDRRMO channels remain available; AGAP complements rather than replaces them.
19. MOD-53 is one-way municipal broadcast, not emergency dispatch.
20. The folder structure should reflect these domain boundaries instead of putting all functionality into generic `utils` or `services` folders.

The source architecture explicitly establishes these reliability and architectural rules.

---

# 24. DEVELOPMENT ORDER

```text
01. Root workspace
        ↓
02. Shared package
        ↓
03. PostgreSQL + Prisma
        ↓
04. Backend common/auth/security
        ↓
05. Users / organizations / roles
        ↓
06. Incident domain
        ↓
07. Location + GPS
        ↓
08. Emergency alert transmission
        ↓
09. Notifications
        ↓
10. Realtime WebSocket
        ↓
11. Dispatch + resources + fleet
        ↓
12. Responder workflows
        ↓
13. Hospital coordination
        ↓
14. Offline synchronization
        ↓
15. SLA / escalation
        ↓
16. Citizen mobile
        ↓
17. Responder mobile
        ↓
18. Operations Center web
        ↓
19. Hospital portal
        ↓
20. Administration / audit / privacy
        ↓
21. Analytics / risk intelligence
        ↓
22. Disaster / surge mode
        ↓
23. MOD-53 announcements
        ↓
24. Full testing / deployment
```

---

# 25. SOURCE ALIGNMENT

This folder structure is based on the supplied **AGAP Complete Master Enterprise Architecture v2.0**, whose repository is `AGAPSYSTEM-Backend-Frontend`, whose scope is 53 modules, and whose architecture defines NestJS/Node.js/PostgreSQL/Redis for the backend, Next.js/React for web, Expo/React Native for mobile, and shared types/enums/validation. 

The source architecture's repository tree explicitly contains `docs`, `backend`, `frontend`, `mobile`, `shared`, `infrastructure`, and `.github/workflows`; this document expands those source-defined areas into an implementation-ready structure while preserving their responsibilities.

The source technical mapping places MOD-01 through MOD-53 across backend, frontend, mobile, realtime, infrastructure, and shared responsibilities. 

---

# 26. FINAL PRINCIPLE

```text
                         AGAP
                          │
             ┌────────────┴────────────┐
             │                         │
        INCIDENT CORE             MOD-53 BROADCAST
             │                         │
     ┌───────┼────────┐                │
     │       │        │                │
   REPORT  DISPATCH  RESPONSE       PUBLIC
     │       │        │             FEED/SMS
  CITIZEN   OPS    RESPONDER
     │       │        │
     └───────┼────────┘
             │
          HOSPITAL
             │
          HANDOVER
             │
         RESOLUTION
             │
          ANALYTICS
             │
       AUDIT / GOVERNANCE
```

AGAP should be implemented as **one incident-centered enterprise platform with shared backend services and role-specific client experiences**, not as unrelated applications.

The target architecture is:

```text
AGAPSYSTEM-Backend-Frontend
        │
        ├── backend       → NestJS / Node.js / PostgreSQL / Redis
        ├── frontend      → Next.js / React / Tailwind
        ├── mobile        → Expo / React Native
        ├── shared        → types / enums / validation / events
        ├── docs          → architecture / operations / modules / API / security
        ├── infrastructure → Docker / database / deployment
        ├── scripts
        ├── tests
        └── .github       → CI/CD
```

**Recommended filename:** `AGAP_Complete_Enterprise_Folder_Structure.md`

**Architecture baseline:** AGAP Complete Master Enterprise Architecture v2.0 / 53 modules.

---

## END OF DOCUMENT
