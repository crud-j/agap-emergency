# AGAP — PostgreSQL Database Reference

**Source of truth:** `backend/prisma/schema.prisma`  
**Database:** PostgreSQL with PostGIS  
**ORM:** Prisma (client-js)  
**Extensions:** `postgis`, `uuid-ossp`, `pg_trgm`

---

## Table of Contents

1. [Extensions](#extensions)
2. [Tables](#tables)
   - [users](#users)
   - [emergency_contacts](#emergency_contacts)
   - [medical_profiles](#medical_profiles)
   - [organizations](#organizations)
   - [organization_memberships](#organization_memberships)
   - [incidents](#incidents)
   - [incident_reporters](#incident_reporters)
   - [incident_locations](#incident_locations)
   - [incident_details](#incident_details)
   - [incident_events](#incident_events)
   - [incident_patients](#incident_patients)
   - [incident_attachments](#incident_attachments)
   - [incident_messages](#incident_messages)
   - [incident_metrics](#incident_metrics)
   - [incident_command_structures](#incident_command_structures)
   - [incident_handovers](#incident_handovers)
   - [incident_resolutions](#incident_resolutions)
   - [incident_agency_participants](#incident_agency_participants)
   - [dispatches](#dispatches)
   - [dispatch_crew](#dispatch_crew)
   - [resources](#resources)
   - [vehicles](#vehicles)
   - [resource_capabilities](#resource_capabilities)
   - [resource_capability_assignments](#resource_capability_assignments)
   - [resource_recommendations](#resource_recommendations)
   - [resource_status_log](#resource_status_log)
   - [resource_requests](#resource_requests)
   - [facilities](#facilities)
   - [facility_capabilities](#facility_capabilities)
   - [facility_referrals](#facility_referrals)
   - [transport_records](#transport_records)
   - [notifications](#notifications)
   - [notification_deliveries](#notification_deliveries)
   - [announcements](#announcements)
   - [announcement_deliveries](#announcement_deliveries)
   - [sms_subscribers](#sms_subscribers)
   - [escalations](#escalations)
   - [sla_policies](#sla_policies)
   - [audit_logs](#audit_logs)
   - [sensitive_data_access_log](#sensitive_data_access_log)
   - [permissions](#permissions)
   - [role_permissions](#role_permissions)
   - [consent_records](#consent_records)
   - [alert_triggers](#alert_triggers)
   - [false_alerts](#false_alerts)
   - [feedback_ratings](#feedback_ratings)
   - [location_history](#location_history)
   - [offline_event_queue](#offline_event_queue)
   - [on_scene_assessments](#on_scene_assessments)
   - [triage_tags](#triage_tags)
   - [surge_incidents](#surge_incidents)
   - [risk_areas](#risk_areas)
   - [ics_assignments](#ics_assignments)
   - [responder_availability](#responder_availability)
   - [first_aid_guides](#first_aid_guides)
   - [message_reads](#message_reads)
   - [user_sessions](#user_sessions)
   - [user_verifications](#user_verifications)
   - [webauthn_credentials](#webauthn_credentials)
   - [webauthn_challenges](#webauthn_challenges)
   - [webauthn_authentication_log](#webauthn_authentication_log)
   - [account_lifecycle_events](#account_lifecycle_events)
   - [system_configurations](#system_configurations)
   - [spatial_ref_sys](#spatial_ref_sys)
3. [Enums](#enums)
4. [Indexes Summary](#indexes-summary)
5. [Module–Table Mapping](#moduletable-mapping)

---

## Extensions

| Extension | Purpose |
|---|---|
| `postgis` | Geographic types (`geography`), spatial indexing (GIST), PostGIS functions for proximity/routing queries |
| `uuid-ossp` | `uuid_generate_v4()` — default PK generation across all tables |
| `pg_trgm` | Trigram full-text search on `users.full_name` (GIN index) |

---

## Tables

### users

Primary identity record for all platform participants.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `full_name` | VARCHAR(255) | NO | — | |
| `email` | VARCHAR(255) | YES | — | UNIQUE |
| `phone_number` | VARCHAR(20) | YES | — | UNIQUE |
| `password_hash` | VARCHAR(255) | YES | — | bcrypt; null for passkey-only accounts |
| `role` | `user_role` | NO | `CITIZEN` | |
| `status` | `user_status` | NO | `PENDING_VERIFICATION` | |
| `profile_completeness` | SMALLINT | NO | `0` | 0–100 percentage |
| `is_guest` | BOOLEAN | NO | `false` | |
| `is_email_verified` | BOOLEAN | NO | `false` | |
| `is_phone_verified` | BOOLEAN | NO | `false` | |
| `barangay` | VARCHAR(100) | YES | — | |
| `municipality` | VARCHAR(100) | YES | `'Bocaue'` | |
| `province` | VARCHAR(100) | YES | `'Bulacan'` | |
| `full_address` | TEXT | YES | — | |
| `preferred_language` | VARCHAR(10) | NO | `'fil'` | BCP 47 tag |
| `text_size` | VARCHAR(10) | NO | `'medium'` | Accessibility |
| `high_contrast` | BOOLEAN | NO | `false` | Accessibility |
| `reduced_motion` | BOOLEAN | NO | `false` | Accessibility |
| `last_login_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_by_id` | UUID | YES | — | FK → `users.id` (self-ref, admin-created accounts) |

**Indexes:** `idx_users_barangay`, `idx_users_created_at` (DESC), `idx_users_name_trgm` (GIN trigram), `idx_users_role`, `idx_users_status`

---

### emergency_contacts

Personal emergency contacts for a registered citizen (MOD-02).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `contact_name` | VARCHAR(255) | NO | — | |
| `relationship` | VARCHAR(100) | YES | — | |
| `phone_number` | VARCHAR(20) | NO | — | |
| `email` | VARCHAR(255) | YES | — | |
| `priority_order` | SMALLINT | NO | `1` | Lower = higher priority |
| `notify_on_alert` | BOOLEAN | NO | `true` | |
| `is_active` | BOOLEAN | NO | `true` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_emergency_contacts_user`

---

### medical_profiles

Sensitive health data for a citizen. Requires a `consent_records` entry before any access (MOD-03).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE; UNIQUE (one profile per user) |
| `consent_record_id` | UUID | NO | — | FK → `consent_records.id` |
| `blood_type` | VARCHAR(5) | YES | — | e.g. `A+` |
| `allergies` | TEXT[] | NO | — | |
| `current_medications` | TEXT[] | NO | — | |
| `medical_conditions` | TEXT[] | NO | — | |
| `disabilities` | TEXT[] | NO | — | |
| `responder_notes` | TEXT | YES | — | Free-text for field responders |
| `last_reviewed_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### organizations

Emergency response organizations: MDRRMO, BFP, hospitals, NGOs (MOD-27, MOD-34).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `name` | VARCHAR(255) | NO | — | |
| `short_name` | VARCHAR(50) | YES | — | |
| `organization_type` | `organization_type` | NO | — | |
| `barangay` | VARCHAR(100) | YES | — | |
| `municipality` | VARCHAR(100) | YES | `'Bocaue'` | |
| `province` | VARCHAR(100) | YES | `'Bulacan'` | |
| `address` | TEXT | YES | — | |
| `location` | geography | YES | — | PostGIS point |
| `contact_number` | VARCHAR(20) | YES | — | |
| `email` | VARCHAR(255) | YES | — | |
| `operational_area` | geography | YES | — | PostGIS polygon — jurisdiction boundary |
| `is_active` | BOOLEAN | NO | `true` | |
| `joined_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_organizations_type`

---

### organization_memberships

Junction: user ↔ organization with role/position.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `organization_id` | UUID | NO | — | FK → `organizations.id` CASCADE DELETE |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `position` | VARCHAR(100) | YES | — | Job title within the org |
| `is_active` | BOOLEAN | NO | `true` | |
| `joined_at` | TIMESTAMPTZ | NO | `now()` | |
| `left_at` | TIMESTAMPTZ | YES | — | |

**Unique:** `(organization_id, user_id)`

---

### incidents

Central business object. Every alert, dispatch, and lifecycle event links here (MOD-14, MOD-15).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `public_reference` | VARCHAR(30) | NO | — | UNIQUE; e.g. `INC-2026-001234` |
| `trigger_method` | `trigger_method` | NO | `SOS_BUTTON` | |
| `client_event_id` | VARCHAR(100) | YES | — | UNIQUE; idempotency key for offline dedup |
| `category` | `incident_category` | NO | — | |
| `priority` | `incident_priority` | NO | `MEDIUM` | |
| `status` | `incident_status` | NO | `SUBMITTED` | |
| `consciousness_state` | `consciousness_state` | YES | `UNKNOWN` | |
| `breathing_status` | `breathing_status` | YES | `UNKNOWN` | |
| `description` | TEXT | YES | — | |
| `number_of_patients` | SMALLINT | YES | `1` | |
| `hazard_flags` | TEXT[] | NO | — | e.g. `['GAS_LEAK', 'UNSTABLE_STRUCTURE']` |
| `river_level_meters` | DECIMAL(5,2) | YES | — | Bocaue River level at trigger time |
| `surge_incident_id` | UUID | YES | — | FK → `surge_incidents.id` |
| `duplicate_of_id` | UUID | YES | — | FK → `incidents.id` (self-ref) |
| `is_surge_incident` | BOOLEAN | NO | `false` | |
| `submitted_at` | TIMESTAMPTZ | NO | `now()` | |
| `received_at` | TIMESTAMPTZ | YES | — | |
| `acknowledged_at` | TIMESTAMPTZ | YES | — | |
| `assessed_at` | TIMESTAMPTZ | YES | — | |
| `dispatch_pending_at` | TIMESTAMPTZ | YES | — | |
| `dispatched_at` | TIMESTAMPTZ | YES | — | |
| `en_route_at` | TIMESTAMPTZ | YES | — | |
| `on_scene_at` | TIMESTAMPTZ | YES | — | |
| `resolved_at` | TIMESTAMPTZ | YES | — | |
| `closed_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_incidents_category`, `idx_incidents_composite` (`status, priority, submitted_at DESC`), `idx_incidents_duplicate_of`, `idx_incidents_priority`, `idx_incidents_reference`, `idx_incidents_status`, `idx_incidents_submitted_at`

---

### incident_reporters

Separates the reporter identity from the incident (Architectural Rule 2). Reporter may be a guest with no account.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE; UNIQUE (one reporter per incident) |
| `user_id` | UUID | YES | — | FK → `users.id`; null for guests |
| `is_guest` | BOOLEAN | NO | `false` | |
| `reporter_name` | VARCHAR(255) | YES | — | Free-text for guest reporters |
| `reporter_phone` | VARCHAR(20) | YES | — | |
| `contact_callback` | VARCHAR(20) | YES | — | Dispatcher callback number |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_reporters_incident`, `idx_reporters_user`

---

### incident_locations

GPS capture and reverse-geocoded address for an incident (MOD-11, MOD-12).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE; UNIQUE |
| `latitude` | DECIMAL(10,7) | NO | — | |
| `longitude` | DECIMAL(10,7) | NO | — | |
| `accuracy_meters` | DECIMAL(8,2) | YES | — | |
| `altitude_meters` | DECIMAL(8,2) | YES | — | |
| `point` | geography | YES | — | PostGIS point (auto-derived from lat/lng) |
| `formatted_address` | TEXT | YES | — | |
| `street` | VARCHAR(255) | YES | — | |
| `barangay` | VARCHAR(100) | YES | — | |
| `municipality` | VARCHAR(100) | YES | — | |
| `province` | VARCHAR(100) | YES | — | |
| `geocoding_confidence` | DECIMAL(3,2) | YES | — | 0.00–1.00 |
| `captured_at` | TIMESTAMPTZ | NO | `now()` | |
| `source` | VARCHAR(50) | YES | `'GPS'` | `GPS`, `MANUAL`, `DISPATCHER` |

**Indexes:** `idx_locations_barangay`, `idx_locations_incident`, `idx_locations_point` (GIST)

---

### incident_details

Supplementary structured details submitted by the reporter (MOD-09).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE; UNIQUE |
| `subcategory` | VARCHAR(100) | YES | — | Finer classification within category |
| `people_affected` | SMALLINT | YES | `1` | |
| `property_damage` | BOOLEAN | YES | `false` | |
| `fire_spreading` | BOOLEAN | YES | `false` | |
| `road_blocked` | BOOLEAN | YES | `false` | |
| `water_level_note` | VARCHAR(255) | YES | — | Reporter's flood description |
| `additional_notes` | TEXT | YES | — | |
| `first_aid_guide_id` | UUID | YES | — | FK → `first_aid_guides.id` |
| `submitted_at` | TIMESTAMPTZ | NO | `now()` | |

---

### incident_events

Immutable audit trail of every status transition on an incident (MOD-15, MOD-46).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `from_status` | `incident_status` | YES | — | Null on initial submission |
| `to_status` | `incident_status` | NO | — | |
| `triggered_by_id` | UUID | YES | — | FK → `users.id` |
| `triggered_by_role` | `user_role` | YES | — | Snapshot of role at transition time |
| `notes` | TEXT | YES | — | |
| `occurred_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_incident_events` (`incident_id, occurred_at DESC`)

---

### incident_patients

Patient records for an incident. Separate from the reporter (Architectural Rule 2). Patients need no AGAP account.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `is_reporter` | BOOLEAN | NO | `false` | True if the reporter is also the patient |
| `is_unknown` | BOOLEAN | NO | `false` | Unknown patient is always valid |
| `patient_name` | VARCHAR(255) | YES | — | |
| `approximate_age` | SMALLINT | YES | — | |
| `sex` | VARCHAR(20) | YES | — | |
| `user_id` | UUID | YES | — | FK → `users.id`; only set if patient is a known AGAP user |
| `medical_profile_id` | UUID | YES | — | FK → `medical_profiles.id` |
| `scene_assessment_notes` | TEXT | YES | — | |
| `vitals_at_scene` | JSON | YES | — | BP, pulse, SpO2, etc. |
| `interventions_done` | TEXT[] | NO | — | |
| `patient_sequence` | SMALLINT | NO | `1` | Order for multi-patient incidents |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_patients_incident`

---

### incident_attachments

Photos and file evidence uploaded to an incident (MOD-10).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `uploaded_by_id` | UUID | YES | — | FK → `users.id` |
| `file_name` | VARCHAR(255) | NO | — | |
| `file_type` | VARCHAR(50) | NO | — | MIME type |
| `file_size_bytes` | INT | YES | — | |
| `storage_bucket` | VARCHAR(255) | NO | — | Object storage bucket name |
| `storage_key` | VARCHAR(500) | NO | — | Object storage key/path |
| `storage_url` | TEXT | YES | — | Pre-signed or public URL |
| `is_processed` | BOOLEAN | NO | `false` | Virus scan / thumbnail complete |
| `uploaded_at` | TIMESTAMPTZ | NO | `now()` | |

---

### incident_messages

Scoped real-time chat for an incident (MOD-33).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `sender_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `organization_id` | UUID | YES | — | FK → `organizations.id` |
| `message_text` | TEXT | NO | — | |
| `attachment_id` | UUID | YES | — | FK → `incident_attachments.id` |
| `is_deleted` | BOOLEAN | NO | `false` | Soft-delete |
| `sent_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_messages_incident` (`incident_id, sent_at DESC`)

---

### incident_metrics

Pre-aggregated SLA and response-time metrics per incident for analytics (MOD-50).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE; UNIQUE |
| `organization_id` | UUID | YES | — | FK → `organizations.id` |
| `category` | `incident_category` | YES | — | Snapshot |
| `priority` | `incident_priority` | YES | — | Snapshot |
| `barangay` | VARCHAR(100) | YES | — | Snapshot |
| `trigger_method` | `trigger_method` | YES | — | |
| `submitted_at` | TIMESTAMPTZ | YES | — | Snapshot |
| `acknowledged_at` | TIMESTAMPTZ | YES | — | Snapshot |
| `dispatched_at` | TIMESTAMPTZ | YES | — | Snapshot |
| `on_scene_at` | TIMESTAMPTZ | YES | — | Snapshot |
| `resolved_at` | TIMESTAMPTZ | YES | — | Snapshot |
| `acknowledge_duration_secs` | INT | YES | — | Computed |
| `dispatch_duration_secs` | INT | YES | — | Computed |
| `response_duration_secs` | INT | YES | — | Computed |
| `total_duration_secs` | INT | YES | — | Computed |
| `acknowledge_sla_met` | BOOLEAN | YES | — | |
| `dispatch_sla_met` | BOOLEAN | YES | — | |
| `final_status` | `incident_status` | YES | — | |
| `patient_disposition` | `patient_disposition` | YES | — | |
| `aggregated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_metrics_barangay`, `idx_metrics_category`, `idx_metrics_org`, `idx_metrics_submitted`

---

### incident_command_structures

ICS (Incident Command System) structure for a complex multi-agency incident (MOD-36).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE; UNIQUE |
| `activated_at` | TIMESTAMPTZ | NO | `now()` | |
| `deactivated_at` | TIMESTAMPTZ | YES | — | |
| `objectives` | TEXT[] | NO | — | Incident objectives |
| `situation_notes` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### incident_handovers

Structured handover record when command shifts between dispatchers (MOD-44).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `from_user_id` | UUID | NO | — | FK → `users.id` |
| `to_user_id` | UUID | NO | — | FK → `users.id` |
| `situation_summary` | TEXT | NO | — | |
| `pending_actions` | TEXT[] | NO | — | Outstanding tasks |
| `resources_in_field` | JSON | YES | — | Snapshot of deployed resources |
| `handed_over_at` | TIMESTAMPTZ | NO | `now()` | |
| `acknowledged_at` | TIMESTAMPTZ | YES | — | |

---

### incident_resolutions

Final closure record written when an incident is closed (MOD-45).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE; UNIQUE |
| `closed_by_id` | UUID | NO | — | FK → `users.id` |
| `outcome` | VARCHAR(100) | NO | — | Free-text outcome |
| `patient_disposition` | `patient_disposition` | YES | — | |
| `time_to_acknowledge_secs` | INT | YES | — | |
| `time_to_dispatch_secs` | INT | YES | — | |
| `time_to_on_scene_secs` | INT | YES | — | |
| `time_to_resolved_secs` | INT | YES | — | |
| `total_response_secs` | INT | YES | — | |
| `resolution_notes` | TEXT | YES | — | |
| `follow_up_required` | BOOLEAN | NO | `false` | |
| `follow_up_notes` | TEXT | YES | — | |
| `closed_at` | TIMESTAMPTZ | NO | `now()` | |

---

### incident_agency_participants

Tracks which organizations are participating in a multi-agency incident (MOD-34).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `organization_id` | UUID | NO | — | FK → `organizations.id` CASCADE DELETE |
| `invited_by_id` | UUID | YES | — | FK → `users.id` |
| `joined_at` | TIMESTAMPTZ | NO | `now()` | |
| `left_at` | TIMESTAMPTZ | YES | — | |
| `role_in_incident` | VARCHAR(100) | YES | — | e.g. `LEAD`, `SUPPORT` |

**Unique:** `(incident_id, organization_id)`

---

### dispatches

Dispatch authorization record (MOD-31).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `resource_id` | UUID | NO | — | FK → `resources.id` CASCADE DELETE |
| `dispatcher_id` | UUID | NO | — | FK → `users.id` |
| `organization_id` | UUID | NO | — | FK → `organizations.id` |
| `status` | `dispatch_status` | NO | `PENDING` | |
| `dispatch_notes` | TEXT | YES | — | |
| `authorized_at` | TIMESTAMPTZ | NO | `now()` | |
| `sent_at` | TIMESTAMPTZ | YES | — | |
| `accepted_at` | TIMESTAMPTZ | YES | — | Responder accepted |
| `rejected_at` | TIMESTAMPTZ | YES | — | |
| `rejected_reason` | TEXT | YES | — | |
| `completed_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_dispatches_dispatcher`, `idx_dispatches_incident`, `idx_dispatches_resource`, `idx_dispatches_status`

---

### dispatch_crew

Additional crew members attached to a dispatch (beyond the primary resource).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `dispatch_id` | UUID | NO | — | FK → `dispatches.id` CASCADE DELETE |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `role_on_scene` | VARCHAR(100) | YES | — | e.g. `PARAMEDIC`, `DRIVER` |
| `added_at` | TIMESTAMPTZ | NO | `now()` | |

**Unique:** `(dispatch_id, user_id)`

---

### resources

Deployable emergency resource (vehicle, crew unit) owned by an organization (MOD-28).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `organization_id` | UUID | NO | — | FK → `organizations.id` CASCADE DELETE |
| `vehicle_id` | UUID | YES | — | FK → `vehicles.id` |
| `name` | VARCHAR(255) | NO | — | |
| `call_sign` | VARCHAR(50) | YES | — | Radio call sign |
| `resource_type` | `resource_type` | NO | — | |
| `status` | `resource_status` | NO | `AVAILABLE` | |
| `current_incident_id` | UUID | YES | — | FK → `incidents.id`; active assignment |
| `base_location` | geography | YES | — | PostGIS point |
| `base_barangay` | VARCHAR(100) | YES | — | |
| `is_active` | BOOLEAN | NO | `true` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_resources_org`, `idx_resources_status`, `idx_resources_type`

---

### vehicles

Physical vehicle registry (MOD-28).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `organization_id` | UUID | NO | — | FK → `organizations.id` CASCADE DELETE |
| `plate_number` | VARCHAR(20) | YES | — | UNIQUE |
| `unit_code` | VARCHAR(50) | YES | — | Internal unit code |
| `resource_type` | `resource_type` | NO | — | |
| `make` | VARCHAR(100) | YES | — | |
| `model` | VARCHAR(100) | YES | — | |
| `year` | SMALLINT | YES | — | |
| `capacity_persons` | SMALLINT | YES | — | |
| `is_active` | BOOLEAN | NO | `true` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### resource_capabilities

Catalogue of capabilities a resource can have (e.g. `ADVANCED_LIFE_SUPPORT`).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `name` | VARCHAR(100) | NO | — | UNIQUE |
| `description` | TEXT | YES | — | |
| `category` | VARCHAR(50) | YES | — | Grouping |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### resource_capability_assignments

Junction: resource ↔ capability.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `resource_id` | UUID | NO | — | FK → `resources.id` CASCADE DELETE |
| `capability_id` | UUID | NO | — | FK → `resource_capabilities.id` CASCADE DELETE |
| `is_verified` | BOOLEAN | NO | `false` | Admin-verified |
| `assigned_at` | TIMESTAMPTZ | NO | `now()` | |

**Unique:** `(resource_id, capability_id)`

---

### resource_recommendations

System-generated ranked resource suggestions for a dispatcher (MOD-30). Dispatcher makes the final call.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `resource_id` | UUID | NO | — | FK → `resources.id` CASCADE DELETE |
| `rank` | SMALLINT | NO | — | 1 = best match |
| `score` | DECIMAL(5,2) | YES | — | Composite score |
| `distance_meters` | INT | YES | — | |
| `eta_seconds` | INT | YES | — | Always labeled as estimate |
| `reasoning` | JSON | YES | — | Explanation for audit |
| `generated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### resource_status_log

Timestamped history of resource status changes with position snapshot (MOD-28).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `resource_id` | UUID | NO | — | FK → `resources.id` CASCADE DELETE |
| `from_status` | `resource_status` | YES | — | |
| `to_status` | `resource_status` | NO | — | |
| `latitude` | DECIMAL(10,7) | YES | — | |
| `longitude` | DECIMAL(10,7) | YES | — | |
| `point` | geography | YES | — | PostGIS point |
| `speed_kmh` | DECIMAL(6,2) | YES | — | |
| `incident_id` | UUID | YES | — | FK → `incidents.id` |
| `changed_by_id` | UUID | YES | — | FK → `users.id` |
| `recorded_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_resource_status_log` (`resource_id, recorded_at DESC`), `idx_resource_status_point` (GIST)

---

### resource_requests

Inter-organization mutual aid requests (MOD-35).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `requesting_org_id` | UUID | NO | — | FK → `organizations.id` |
| `providing_org_id` | UUID | YES | — | FK → `organizations.id`; set when accepted |
| `resource_type` | `resource_type` | NO | — | |
| `quantity` | SMALLINT | NO | `1` | |
| `capability_needed` | TEXT[] | NO | — | |
| `priority` | `incident_priority` | NO | `HIGH` | |
| `status` | `resource_request_status` | NO | `PENDING` | |
| `request_notes` | TEXT | YES | — | |
| `response_notes` | TEXT | YES | — | |
| `requested_at` | TIMESTAMPTZ | NO | `now()` | |
| `fulfilled_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### facilities

Hospitals, evacuation centers, and barangay halls (MOD-39).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `organization_id` | UUID | YES | — | FK → `organizations.id` |
| `name` | VARCHAR(255) | NO | — | |
| `facility_type` | `facility_type` | NO | — | |
| `barangay` | VARCHAR(100) | YES | — | |
| `municipality` | VARCHAR(100) | YES | — | |
| `province` | VARCHAR(100) | YES | — | |
| `address` | TEXT | YES | — | |
| `location` | geography | YES | — | PostGIS point |
| `contact_number` | VARCHAR(20) | YES | — | |
| `emergency_contact` | VARCHAR(20) | YES | — | Direct emergency line |
| `receiving_status` | `facility_receiving_status` | NO | `UNKNOWN` | |
| `capacity_total` | SMALLINT | YES | — | |
| `capacity_available` | SMALLINT | YES | — | |
| `has_emergency_room` | BOOLEAN | YES | `false` | |
| `has_icu` | BOOLEAN | YES | `false` | |
| `blood_bank` | BOOLEAN | YES | `false` | |
| `is_evacuation_center` | BOOLEAN | YES | `false` | |
| `elevation_masl` | DECIMAL(6,1) | YES | — | Meters above sea level (flood-safe check) |
| `is_active` | BOOLEAN | NO | `true` | |
| `last_verified_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### facility_capabilities

Specific capabilities of a facility (e.g. `TRAUMA_CENTER`, `BLOOD_BANK`).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `facility_id` | UUID | NO | — | FK → `facilities.id` CASCADE DELETE |
| `capability_name` | VARCHAR(100) | NO | — | |
| `is_available` | BOOLEAN | NO | `true` | |
| `notes` | TEXT | YES | — | |

**Unique:** `(facility_id, capability_name)`

---

### facility_referrals

Hospital pre-notification and patient referral record (MOD-38).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `dispatch_id` | UUID | YES | — | FK → `dispatches.id` |
| `facility_id` | UUID | NO | — | FK → `facilities.id` |
| `patient_id` | UUID | YES | — | FK → `incident_patients.id` |
| `coordinated_by_id` | UUID | YES | — | FK → `users.id` |
| `pre_arrival_notes` | TEXT | YES | — | Condition summary for receiving staff |
| `eta_minutes` | SMALLINT | YES | — | Always an estimate |
| `acknowledgment_status` | VARCHAR(50) | YES | `'PENDING'` | |
| `acknowledged_at` | TIMESTAMPTZ | YES | — | |
| `patient_arrived_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_referrals_facility`, `idx_referrals_incident`

---

### transport_records

Tracks patient transport from scene to facility (MOD-40).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `dispatch_id` | UUID | NO | — | FK → `dispatches.id` CASCADE DELETE |
| `patient_id` | UUID | YES | — | FK → `incident_patients.id` |
| `destination_id` | UUID | YES | — | FK → `facilities.id` |
| `transport_started_at` | TIMESTAMPTZ | YES | — | |
| `estimated_arrival_at` | TIMESTAMPTZ | YES | — | Always labeled as estimate |
| `arrived_at` | TIMESTAMPTZ | YES | — | |
| `handover_completed_at` | TIMESTAMPTZ | YES | — | |
| `destination_changed` | BOOLEAN | NO | `false` | En-route diversion |
| `change_reason` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### notifications

Push and SMS notification records (MOD-16, MOD-17, MOD-18).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | YES | — | FK → `incidents.id` |
| `recipient_user_id` | UUID | YES | — | FK → `users.id` |
| `recipient_phone` | VARCHAR(20) | YES | — | For SMS-only (non-app) recipients |
| `channel` | `notification_channel` | NO | — | |
| `event_type` | VARCHAR(100) | NO | — | e.g. `incident.status_changed` |
| `title` | VARCHAR(255) | YES | — | Push title |
| `body` | TEXT | NO | — | |
| `data_payload` | JSON | YES | — | Push data payload |
| `sms_payload` | VARCHAR(160) | YES | — | Must be ≤ 160 chars |
| `status` | `notification_status` | NO | `PENDING` | |
| `retry_count` | SMALLINT | NO | `0` | |
| `max_retries` | SMALLINT | NO | `3` | |
| `scheduled_at` | TIMESTAMPTZ | YES | — | For scheduled notifications |
| `sent_at` | TIMESTAMPTZ | YES | — | |
| `delivered_at` | TIMESTAMPTZ | YES | — | |
| `failed_at` | TIMESTAMPTZ | YES | — | |
| `failure_reason` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_notifications_channel`, `idx_notifications_incident`, `idx_notifications_recipient`, `idx_notifications_status`

---

### notification_deliveries

Provider-level delivery acknowledgment (FCM receipt, Textbee response).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `notification_id` | UUID | NO | — | FK → `notifications.id` CASCADE DELETE |
| `provider` | VARCHAR(50) | NO | — | e.g. `FCM`, `TEXTBEE` |
| `provider_message_id` | VARCHAR(255) | YES | — | |
| `provider_status` | VARCHAR(100) | YES | — | |
| `provider_response` | JSON | YES | — | Full provider response |
| `delivered_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### announcements

Municipal public broadcast records (MOD-53). One-way broadcast only — not an emergency dispatch channel.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `publisher_id` | UUID | NO | — | FK → `users.id` |
| `organization_id` | UUID | YES | — | FK → `organizations.id` |
| `title` | VARCHAR(500) | NO | — | |
| `body` | TEXT | NO | — | |
| `category` | `announcement_category` | NO | — | |
| `severity` | `announcement_severity` | NO | `INFORMATIONAL` | |
| `scope` | `announcement_scope` | NO | `MUNICIPALITY_WIDE` | |
| `target_barangays` | TEXT[] | NO | — | When scope = `BARANGAY_SPECIFIC` |
| `status` | `announcement_status` | NO | `DRAFT` | |
| `publish_now` | BOOLEAN | NO | `true` | |
| `scheduled_at` | TIMESTAMPTZ | YES | — | |
| `published_at` | TIMESTAMPTZ | YES | — | |
| `archived_at` | TIMESTAMPTZ | YES | — | |
| `superseded_by_id` | UUID | YES | — | FK → `announcements.id` (self-ref) |
| `push_sent_count` | INT | YES | `0` | |
| `sms_sent_count` | INT | YES | `0` | |
| `image_url` | VARCHAR(1000) | YES | — | |
| `image_storage_key` | VARCHAR(500) | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_announcements_category`, `idx_announcements_severity`, `idx_announcements_status`

---

### announcement_deliveries

Per-recipient delivery tracking for announcements.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `announcement_id` | UUID | NO | — | FK → `announcements.id` CASCADE DELETE |
| `channel` | `notification_channel` | NO | — | |
| `recipient_user_id` | UUID | YES | — | FK → `users.id` |
| `recipient_phone` | VARCHAR(20) | YES | — | |
| `sms_subscriber_id` | UUID | YES | — | FK → `sms_subscribers.id` |
| `status` | `notification_status` | NO | `PENDING` | |
| `retry_count` | SMALLINT | NO | `0` | |
| `sent_at` | TIMESTAMPTZ | YES | — | |
| `delivered_at` | TIMESTAMPTZ | YES | — | |
| `failed_at` | TIMESTAMPTZ | YES | — | |
| `failure_reason` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_ann_deliveries_ann`, `idx_ann_deliveries_status`

---

### sms_subscribers

Phone numbers opted in for SMS announcements (no app required).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `phone_number` | VARCHAR(20) | NO | — | UNIQUE |
| `user_id` | UUID | YES | — | FK → `users.id`; null for non-app subscribers |
| `barangay_preference` | VARCHAR(100) | YES | — | |
| `scope_preference` | `announcement_scope` | YES | `MUNICIPALITY_WIDE` | |
| `is_active` | BOOLEAN | NO | `true` | |
| `subscribed_at` | TIMESTAMPTZ | NO | `now()` | |
| `opted_out_at` | TIMESTAMPTZ | YES | — | |
| `opt_out_source` | VARCHAR(50) | YES | — | `SMS_REPLY`, `APP`, `ADMIN` |

---

### escalations

SLA breach escalation records (MOD-41).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `sla_policy_id` | UUID | YES | — | FK → `sla_policies.id` |
| `escalation_level` | `escalation_level` | NO | — | |
| `status` | `escalation_status` | NO | `ACTIVE` | |
| `triggered_reason` | TEXT | NO | — | |
| `sla_breach_at` | TIMESTAMPTZ | NO | — | When the SLA was breached |
| `notified_user_id` | UUID | YES | — | FK → `users.id` |
| `acknowledged_at` | TIMESTAMPTZ | YES | — | |
| `resolved_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_escalations_incident`, `idx_escalations_status`

---

### sla_policies

Configurable SLA thresholds per organization and incident type (MOD-41).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `organization_id` | UUID | NO | — | FK → `organizations.id` CASCADE DELETE |
| `incident_category` | `incident_category` | YES | — | Null = applies to all categories |
| `priority` | `incident_priority` | YES | — | Null = applies to all priorities |
| `acknowledge_threshold_secs` | INT | NO | `120` | 2 minutes |
| `dispatch_threshold_secs` | INT | NO | `300` | 5 minutes |
| `on_scene_threshold_secs` | INT | NO | `900` | 15 minutes |
| `is_active` | BOOLEAN | NO | `true` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### audit_logs

Immutable append-only audit trail (MOD-46). No UPDATE or DELETE is permitted on this table.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `actor_id` | UUID | YES | — | FK → `users.id`; null for system actions |
| `actor_role` | `user_role` | YES | — | Snapshot of role at action time |
| `action` | `audit_action` | NO | — | |
| `entity_type` | VARCHAR(100) | YES | — | Table name e.g. `incidents` |
| `entity_id` | UUID | YES | — | PK of the affected record |
| `module_id` | VARCHAR(10) | YES | — | e.g. `MOD-14` |
| `old_values` | JSON | YES | — | Before state |
| `new_values` | JSON | YES | — | After state |
| `ip_address` | INET | YES | — | |
| `user_agent` | TEXT | YES | — | |
| `incident_id` | UUID | YES | — | FK → `incidents.id` |
| `occurred_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_audit_logs_action`, `idx_audit_logs_actor`, `idx_audit_logs_entity` (`entity_type, entity_id`), `idx_audit_logs_incident`, `idx_audit_logs_occurred`

---

### sensitive_data_access_log

Least-privilege log — records every access to sensitive/medical data (MOD-48).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `accessor_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `data_type` | VARCHAR(100) | NO | — | e.g. `medical_profile`, `location_history` |
| `entity_id` | UUID | NO | — | PK of the accessed record |
| `purpose` | TEXT | YES | — | Stated reason for access |
| `incident_id` | UUID | YES | — | FK → `incidents.id` |
| `accessed_at` | TIMESTAMPTZ | NO | `now()` | |

---

### permissions

Permission definitions for RBAC (MOD-47).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `name` | VARCHAR(100) | NO | — | UNIQUE; e.g. `incident:acknowledge` |
| `description` | TEXT | YES | — | |
| `module_id` | VARCHAR(10) | YES | — | e.g. `MOD-15` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### role_permissions

Junction: role ↔ permission (MOD-47).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `role` | `user_role` | NO | — | |
| `permission_id` | UUID | NO | — | FK → `permissions.id` CASCADE DELETE |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Unique:** `(role, permission_id)`

---

### consent_records

Explicit consent grants required before accessing medical profiles (MOD-48).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `consent_type` | VARCHAR(100) | NO | — | e.g. `MEDICAL_DATA_ACCESS` |
| `status` | `consent_status` | NO | `GRANTED` | |
| `granted_at` | TIMESTAMPTZ | NO | `now()` | |
| `withdrawn_at` | TIMESTAMPTZ | YES | — | |
| `expires_at` | TIMESTAMPTZ | YES | — | |
| `ip_address` | INET | YES | — | |
| `device_info` | JSON | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### alert_triggers

Raw trigger event captured at SOS / shake moment (MOD-06, MOD-07).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | YES | — | FK → `incidents.id`; set after incident is created |
| `user_id` | UUID | YES | — | FK → `users.id` |
| `trigger_method` | `trigger_method` | NO | — | |
| `client_event_id` | VARCHAR(100) | NO | — | UNIQUE; idempotency key |
| `device_info` | JSON | YES | — | |
| `shake_magnitude` | DECIMAL(6,3) | YES | — | For `SHAKE_GESTURE` triggers |
| `latitude` | DECIMAL(10,7) | YES | — | |
| `longitude` | DECIMAL(10,7) | YES | — | |
| `accuracy_meters` | DECIMAL(8,2) | YES | — | |
| `triggered_at` | TIMESTAMPTZ | NO | `now()` | |
| `cancel_deadline_at` | TIMESTAMPTZ | YES | — | Window to cancel before dispatch |
| `was_cancelled` | BOOLEAN | NO | `false` | |
| `cancellation_reason` | `cancellation_reason` | YES | — | |
| `cancelled_at` | TIMESTAMPTZ | YES | — | |

**Indexes:** `idx_triggers_incident`, `idx_triggers_method`, `idx_triggers_user`

---

### false_alerts

False alert / cancellation classification record (MOD-08).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `user_id` | UUID | YES | — | FK → `users.id`; original reporter |
| `classified_by_id` | UUID | YES | — | FK → `users.id`; dispatcher who classified it |
| `false_alert_type` | `false_alert_type` | NO | — | |
| `notes` | TEXT | YES | — | |
| `classified_at` | TIMESTAMPTZ | NO | `now()` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### feedback_ratings

Post-incident citizen satisfaction rating (MOD-45).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `submitted_by_id` | UUID | YES | — | FK → `users.id` |
| `overall_rating` | SMALLINT | YES | — | 1–5 |
| `response_time_rating` | SMALLINT | YES | — | 1–5 |
| `responder_rating` | SMALLINT | YES | — | 1–5 |
| `app_usability_rating` | SMALLINT | YES | — | 1–5 |
| `comments` | TEXT | YES | — | |
| `submitted_at` | TIMESTAMPTZ | NO | `now()` | |

---

### location_history

Continuous GPS breadcrumb trail of responders and resources during an incident (MOD-13).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `user_id` | UUID | YES | — | FK → `users.id`; responder |
| `resource_id` | UUID | YES | — | FK → `resources.id` |
| `latitude` | DECIMAL(10,7) | NO | — | |
| `longitude` | DECIMAL(10,7) | NO | — | |
| `accuracy_meters` | DECIMAL(8,2) | YES | — | |
| `speed_kmh` | DECIMAL(6,2) | YES | — | |
| `heading_degrees` | DECIMAL(5,2) | YES | — | |
| `point` | geography | YES | — | PostGIS point |
| `recorded_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_loc_history_incident` (`incident_id, recorded_at DESC`), `idx_loc_history_point` (GIST), `idx_loc_history_resource` (`resource_id, recorded_at DESC`)

---

### offline_event_queue

Server-side record of events synced from offline devices (MOD-19).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `client_event_id` | VARCHAR(100) | NO | — | UNIQUE; same as client idempotency key |
| `user_id` | UUID | YES | — | FK → `users.id` |
| `event_type` | VARCHAR(100) | NO | — | e.g. `SOS_TRIGGER` |
| `payload` | JSON | NO | — | Full event payload |
| `device_info` | JSON | YES | — | |
| `queued_at_device` | TIMESTAMPTZ | NO | — | Client-side timestamp |
| `received_at_server` | TIMESTAMPTZ | NO | `now()` | |
| `sync_status` | `sync_status` | NO | `PENDING` | |
| `incident_id` | UUID | YES | — | FK → `incidents.id`; set after processing |
| `processed_at` | TIMESTAMPTZ | YES | — | |
| `error_message` | TEXT | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_offline_queue_status`, `idx_offline_queue_user`

---

### on_scene_assessments

Paramedic field assessment record (MOD-37).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `incident_id` | UUID | NO | — | FK → `incidents.id` CASCADE DELETE |
| `patient_id` | UUID | YES | — | FK → `incident_patients.id` |
| `dispatch_id` | UUID | YES | — | FK → `dispatches.id` |
| `assessed_by_id` | UUID | NO | — | FK → `users.id` |
| `blood_pressure_sys` | SMALLINT | YES | — | mmHg |
| `blood_pressure_dia` | SMALLINT | YES | — | mmHg |
| `pulse_bpm` | SMALLINT | YES | — | |
| `respiratory_rate` | SMALLINT | YES | — | breaths/min |
| `temperature_celsius` | DECIMAL(4,1) | YES | — | |
| `oxygen_saturation` | SMALLINT | YES | — | SpO2 % |
| `gcs_score` | SMALLINT | YES | — | Glasgow Coma Scale 3–15 |
| `consciousness_state` | `consciousness_state` | YES | — | |
| `breathing_status` | `breathing_status` | YES | — | |
| `visible_injuries` | TEXT[] | NO | — | |
| `interventions` | TEXT[] | NO | — | e.g. `['CPR', 'TOURNIQUET']` |
| `triage_tag` | VARCHAR(20) | YES | — | START triage color |
| `assessment_notes` | TEXT | YES | — | |
| `assessed_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_assessments_incident`

---

### triage_tags

Mass-casualty triage color assignments per patient (MOD-52).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `surge_id` | UUID | NO | — | FK → `surge_incidents.id` CASCADE DELETE |
| `patient_id` | UUID | YES | — | FK → `incident_patients.id` |
| `incident_id` | UUID | YES | — | FK → `incidents.id` |
| `triage_color` | VARCHAR(20) | NO | — | `RED`, `YELLOW`, `GREEN`, `BLACK` |
| `triage_notes` | TEXT | YES | — | |
| `tagged_by_id` | UUID | YES | — | FK → `users.id` |
| `tagged_at` | TIMESTAMPTZ | NO | `now()` | |

---

### surge_incidents

Disaster / mass-casualty event wrapper (MOD-52).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `declared_by_id` | UUID | NO | — | FK → `users.id` |
| `organization_id` | UUID | NO | — | FK → `organizations.id` |
| `name` | VARCHAR(255) | NO | — | |
| `description` | TEXT | YES | — | |
| `category` | `incident_category` | NO | — | |
| `affected_area` | geography | YES | — | PostGIS polygon |
| `affected_barangays` | TEXT[] | NO | — | |
| `status` | `surge_status` | NO | `ACTIVE` | |
| `bocaue_river_level` | DECIMAL(5,2) | YES | — | River level at declaration time |
| `activated_at` | TIMESTAMPTZ | NO | `now()` | |
| `deactivated_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

---

### risk_areas

Geofenced risk zones for the risk heatmap (MOD-51).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `name` | VARCHAR(255) | NO | — | |
| `description` | TEXT | YES | — | |
| `risk_type` | `incident_category` | NO | — | |
| `risk_level` | VARCHAR(20) | NO | `'MODERATE'` | `LOW`, `MODERATE`, `HIGH`, `CRITICAL` |
| `area_boundary` | geography | YES | — | PostGIS polygon |
| `barangay` | VARCHAR(100) | YES | — | |
| `flood_threshold_meters` | DECIMAL(5,2) | YES | — | River level that activates this zone |
| `is_active` | BOOLEAN | NO | `true` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_risk_areas_boundary` (GIST), `idx_risk_areas_type`

---

### ics_assignments

ICS position assignments within an incident command structure (MOD-36).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `ics_id` | UUID | NO | — | FK → `incident_command_structures.id` CASCADE DELETE |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `organization_id` | UUID | YES | — | FK → `organizations.id` |
| `position` | `ics_position` | NO | — | |
| `assigned_at` | TIMESTAMPTZ | NO | `now()` | |
| `relieved_at` | TIMESTAMPTZ | YES | — | |

**Unique:** `(ics_id, position, user_id)`

---

### responder_availability

Current on-duty/off-duty status for each responder (MOD-28).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `user_id` | UUID | NO | — | PK + FK → `users.id` CASCADE DELETE |
| `status` | `responder_availability_status` | NO | `OFF_DUTY` | |
| `changed_at` | TIMESTAMPTZ | NO | `now()` | |
| `changed_by_id` | UUID | NO | — | FK → `users.id` |
| `source` | VARCHAR(40) | NO | `'SELF_SERVICE'` | `SELF_SERVICE`, `DISPATCHER`, `SYSTEM` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | (auto) | |

**Indexes:** `idx_responder_availability_status`

---

### first_aid_guides

In-app first aid guide content linked to incident categories (MOD-09).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `category` | `incident_category` | NO | — | |
| `title` | VARCHAR(255) | NO | — | |
| `content_fil` | TEXT | NO | — | Filipino language |
| `content_en` | TEXT | NO | — | English |
| `steps` | JSON | NO | — | Ordered step list |
| `is_active` | BOOLEAN | NO | `true` | |
| `display_order` | SMALLINT | YES | `1` | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### message_reads

Read receipts for incident chat messages (MOD-33).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `message_id` | UUID | NO | — | FK → `incident_messages.id` CASCADE DELETE |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `read_at` | TIMESTAMPTZ | NO | `now()` | |

**Unique:** `(message_id, user_id)`

---

### user_sessions

JWT session registry for refresh token rotation (MOD-01).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `token_hash` | VARCHAR(255) | NO | — | UNIQUE; bcrypt hash of access token |
| `refresh_token_hash` | VARCHAR(255) | YES | — | UNIQUE; bcrypt hash of refresh token |
| `device_info` | JSON | YES | — | |
| `ip_address` | INET | YES | — | |
| `is_revoked` | BOOLEAN | NO | `false` | |
| `last_active_at` | TIMESTAMPTZ | NO | `now()` | |
| `expires_at` | TIMESTAMPTZ | NO | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_user_sessions_expires`, `idx_user_sessions_user_id`

---

### user_verifications

Email and phone OTP verification tokens (MOD-01).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `verification_type` | `verification_type` | NO | — | `EMAIL` or `PHONE` |
| `token` | VARCHAR(255) | NO | — | Hashed OTP |
| `status` | `verification_status` | NO | `PENDING` | |
| `expires_at` | TIMESTAMPTZ | NO | — | |
| `verified_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_user_verifications_token`, `idx_user_verifications_user`

---

### webauthn_credentials

Passkey / WebAuthn credential storage (MOD-01).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `credential_id` | TEXT | NO | — | UNIQUE; base64url credential ID |
| `public_key` | TEXT | NO | — | COSE-encoded public key |
| `sign_count` | BIGINT | NO | `0` | Replay-attack counter |
| `aaguid` | UUID | YES | — | Authenticator model ID |
| `attestation_format` | VARCHAR(50) | YES | — | |
| `transports` | `webauthn_transport[]` | NO | — | |
| `is_backup_eligible` | BOOLEAN | NO | `false` | |
| `is_backed_up` | BOOLEAN | NO | `false` | |
| `device_label` | VARCHAR(150) | YES | — | User-defined label |
| `is_active` | BOOLEAN | NO | `true` | |
| `last_used_at` | TIMESTAMPTZ | YES | — | |
| `last_used_ip` | INET | YES | — | |
| `revoked_at` | TIMESTAMPTZ | YES | — | |
| `revoked_reason` | VARCHAR(255) | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_webauthn_credentials_user`

---

### webauthn_challenges

Ephemeral challenge nonces for passkey ceremonies (MOD-01).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | YES | — | FK → `users.id` CASCADE DELETE |
| `ceremony_type` | `webauthn_ceremony_type` | NO | — | `REGISTRATION` or `AUTHENTICATION` |
| `status` | `webauthn_ceremony_status` | NO | `PENDING` | |
| `challenge` | TEXT | NO | — | UNIQUE |
| `ip_address` | INET | YES | — | |
| `user_agent` | TEXT | YES | — | |
| `expires_at` | TIMESTAMPTZ | NO | — | Short TTL (30–60 s) |
| `completed_at` | TIMESTAMPTZ | YES | — | |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_webauthn_challenges_expires`, `idx_webauthn_challenges_status`, `idx_webauthn_challenges_user`

---

### webauthn_authentication_log

Audit log for every passkey authentication attempt (MOD-01, MOD-46).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | YES | — | FK → `users.id` |
| `credential_id` | UUID | YES | — | FK → `webauthn_credentials.id` |
| `was_successful` | BOOLEAN | NO | — | |
| `failure_reason` | VARCHAR(255) | YES | — | |
| `ip_address` | INET | YES | — | |
| `user_agent` | TEXT | YES | — | |
| `occurred_at` | TIMESTAMPTZ | NO | `now()` | |

**Indexes:** `idx_webauthn_auth_log_credential`, `idx_webauthn_auth_log_user` (`user_id, occurred_at DESC`)

---

### account_lifecycle_events

Admin-managed account events (suspend, reactivate, deactivate) (MOD-49).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `user_id` | UUID | NO | — | FK → `users.id` CASCADE DELETE |
| `event_type` | VARCHAR(100) | NO | — | e.g. `SUSPENDED`, `REACTIVATED` |
| `performed_by_id` | UUID | YES | — | FK → `users.id`; admin who performed the action |
| `reason` | TEXT | YES | — | |
| `occurred_at` | TIMESTAMPTZ | NO | `now()` | |

---

### system_configurations

Key-value store for runtime-editable platform configuration (MOD-49).

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | NO | `uuid_generate_v4()` | PK |
| `config_key` | VARCHAR(255) | NO | — | UNIQUE |
| `config_value` | JSON | NO | — | |
| `description` | TEXT | YES | — | |
| `is_sensitive` | BOOLEAN | NO | `false` | Sensitive values are masked in API responses |
| `updated_by_id` | UUID | YES | — | FK → `users.id` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

---

### spatial_ref_sys

PostGIS system table — spatial reference systems catalogue. Do not modify.

| Column | Type | Notes |
|---|---|---|
| `srid` | INT | PK |
| `auth_name` | VARCHAR(256) | Authority name (e.g. `EPSG`) |
| `auth_srid` | INT | Authority SRID |
| `srtext` | VARCHAR(2048) | WKT representation |
| `proj4text` | VARCHAR(2048) | PROJ.4 string |

---

## Enums

### `user_role`
`CITIZEN` · `BYSTANDER` · `DISPATCHER` · `SUPERVISOR` · `RESPONDER` · `HOSPITAL_USER` · `ORG_ADMINISTRATOR` · `ANNOUNCEMENTS_PUBLISHER` · `SYSTEM_ADMINISTRATOR`

### `user_status`
`PENDING_VERIFICATION` · `ACTIVE` · `SUSPENDED` · `DEACTIVATED`

### `incident_status`
`DRAFT` · `SUBMITTED` · `RECEIVED` · `ACKNOWLEDGED` · `ASSESSED` · `DISPATCH_PENDING` · `DISPATCHED` · `EN_ROUTE` · `ON_SCENE` · `TRANSPORTING` · `ASSISTING` · `RESOLVED` · `CLOSED` · `CANCELLED` · `FALSE_ALERT` · `DUPLICATE` · `UNABLE_TO_RESPOND` · `REFERRED`

### `incident_category`
`MEDICAL` · `ROAD_ACCIDENT` · `FLOOD` · `RESCUE` · `FIRE` · `INDUSTRIAL` · `DEBRIS` · `OTHER`

### `incident_priority`
`CRITICAL` · `HIGH` · `MEDIUM` · `LOW`

### `trigger_method`
`SOS_BUTTON` · `SHAKE_GESTURE` · `MANUAL_REPORT` · `DISPATCHER_CREATED` · `SYSTEM_GENERATED`

### `dispatch_status`
`PENDING` · `SENT` · `ACCEPTED` · `REJECTED` · `CANCELLED` · `COMPLETED`

### `resource_type`
`AMBULANCE` · `RESCUE_BOAT` · `FIRE_TRUCK` · `RESCUE_TRUCK` · `CLEARING_EQUIPMENT` · `MOTORCYCLE_RESPONDER` · `COMMAND_VEHICLE` · `OTHER`

### `resource_status`
`AVAILABLE` · `DISPATCHED` · `EN_ROUTE` · `ON_SCENE` · `TRANSPORTING` · `RETURNING` · `OUT_OF_SERVICE` · `OFFLINE` · `RESERVED`

### `resource_request_status`
`PENDING` · `OFFERED` · `ACCEPTED` · `REJECTED` · `CANCELLED` · `FULFILLED`

### `responder_availability_status`
`AVAILABLE` · `OFF_DUTY` · `UNAVAILABLE`

### `organization_type`
`MDRRMO` · `BFP` · `PNP` · `HOSPITAL` · `EMS_PROVIDER` · `NGO` · `LGU` · `OTHER`

### `notification_channel`
`PUSH` · `SMS` · `IN_APP` · `EMAIL`

### `notification_status`
`PENDING` · `SENT` · `DELIVERED` · `FAILED` · `RETRYING` · `CANCELLED`

### `announcement_category`
`CLASS_SUSPENSION` · `FLOOD_ALERT` · `EVACUATION_ORDER` · `ROAD_CLOSURE` · `FIRE_ADVISORY` · `INDUSTRIAL_HAZARD` · `POST_DISASTER_UPDATE` · `RESCUE_UPDATE` · `GENERAL_INFORMATION`

### `announcement_severity`
`INFORMATIONAL` · `ADVISORY` · `WARNING` · `CRITICAL`

### `announcement_scope`
`MUNICIPALITY_WIDE` · `BARANGAY_SPECIFIC` · `CATEGORY_SPECIFIC`

### `announcement_status`
`DRAFT` · `SCHEDULED` · `PUBLISHED` · `ARCHIVED` · `SUPERSEDED`

### `escalation_level`
`LEVEL_1_SUPERVISOR` · `LEVEL_2_INCIDENT_COMMANDER` · `LEVEL_3_ADMINISTRATOR` · `LEVEL_4_DRRMO`

### `escalation_status`
`ACTIVE` · `ACKNOWLEDGED` · `RESOLVED` · `CANCELLED`

### `facility_type`
`HOSPITAL` · `EVACUATION_CENTER` · `BARANGAY_HALL` · `RELIEF_CENTER` · `CLINIC` · `OTHER`

### `facility_receiving_status`
`OPEN` · `AT_CAPACITY` · `CLOSED` · `EMERGENCY_ONLY` · `UNKNOWN`

### `consciousness_state`
`CONSCIOUS` · `UNCONSCIOUS` · `ALTERED` · `UNKNOWN`

### `breathing_status`
`NORMAL` · `DIFFICULTY` · `NOT_BREATHING` · `UNKNOWN`

### `patient_disposition`
`TREATED_ON_SCENE` · `TRANSPORTED_TO_HOSPITAL` · `TRANSPORTED_TO_EVACUATION_CENTER` · `REFUSED_TRANSPORT` · `DECEASED_ON_SCENE` · `TRANSFERRED_TO_OTHER_AGENCY` · `UNABLE_TO_LOCATE` · `NO_PATIENT_FOUND` · `OTHER`

### `cancellation_reason`
`ACCIDENTAL_TRIGGER` · `SITUATION_RESOLVED` · `DUPLICATE_REPORT` · `WRONG_APP` · `TEST` · `OTHER`

### `false_alert_type`
`ACCIDENTAL` · `DUPLICATE` · `TEST` · `PRANK` · `MISIDENTIFIED` · `OTHER`

### `audit_action`
`CREATE` · `READ` · `UPDATE` · `DELETE` · `LOGIN` · `LOGOUT` · `PERMISSION_DENIED` · `STATUS_CHANGE` · `DISPATCH` · `ESCALATE` · `PUBLISH` · `SUBSCRIBE` · `UNSUBSCRIBE` · `CONSENT_GRANT` · `CONSENT_WITHDRAW` · `DATA_EXPORT` · `SYSTEM`

### `consent_status`
`GRANTED` · `WITHDRAWN` · `EXPIRED`

### `ics_position`
`INCIDENT_COMMANDER` · `OPERATIONS_SECTION_CHIEF` · `LOGISTICS_SECTION_CHIEF` · `PLANNING_SECTION_CHIEF` · `SAFETY_OFFICER` · `PUBLIC_INFORMATION_OFFICER` · `LIAISON_OFFICER`

### `surge_status`
`INACTIVE` · `MONITORING` · `ACTIVE` · `DEACTIVATING`

### `sync_status`
`PENDING` · `SYNCED` · `FAILED` · `DUPLICATE_REJECTED`

### `verification_type`
`EMAIL` · `PHONE`

### `verification_status`
`PENDING` · `VERIFIED` · `EXPIRED` · `CANCELLED`

### `webauthn_ceremony_type`
`REGISTRATION` · `AUTHENTICATION`

### `webauthn_ceremony_status`
`PENDING` · `COMPLETED` · `EXPIRED` · `FAILED`

### `webauthn_transport`
`USB` · `NFC` · `BLE` · `INTERNAL` · `HYBRID` · `SMART_CARD`

---

## Indexes Summary

| Index Name | Table | Columns | Type |
|---|---|---|---|
| `idx_users_barangay` | users | barangay | BTREE |
| `idx_users_created_at` | users | created_at DESC | BTREE |
| `idx_users_name_trgm` | users | full_name (gin_trgm_ops) | GIN |
| `idx_users_role` | users | role | BTREE |
| `idx_users_status` | users | status | BTREE |
| `idx_emergency_contacts_user` | emergency_contacts | user_id | BTREE |
| `idx_organizations_type` | organizations | organization_type | BTREE |
| `idx_incidents_category` | incidents | category | BTREE |
| `idx_incidents_composite` | incidents | status, priority, submitted_at DESC | BTREE |
| `idx_incidents_duplicate_of` | incidents | duplicate_of_id | BTREE |
| `idx_incidents_priority` | incidents | priority | BTREE |
| `idx_incidents_reference` | incidents | public_reference | BTREE |
| `idx_incidents_status` | incidents | status | BTREE |
| `idx_incidents_submitted_at` | incidents | submitted_at DESC | BTREE |
| `idx_reporters_incident` | incident_reporters | incident_id | BTREE |
| `idx_reporters_user` | incident_reporters | user_id | BTREE |
| `idx_locations_barangay` | incident_locations | barangay | BTREE |
| `idx_locations_incident` | incident_locations | incident_id | BTREE |
| `idx_locations_point` | incident_locations | point | GIST |
| `idx_incident_events` | incident_events | incident_id, occurred_at DESC | BTREE |
| `idx_patients_incident` | incident_patients | incident_id | BTREE |
| `idx_messages_incident` | incident_messages | incident_id, sent_at DESC | BTREE |
| `idx_metrics_barangay` | incident_metrics | barangay | BTREE |
| `idx_metrics_category` | incident_metrics | category | BTREE |
| `idx_metrics_org` | incident_metrics | organization_id | BTREE |
| `idx_metrics_submitted` | incident_metrics | submitted_at DESC | BTREE |
| `idx_dispatches_dispatcher` | dispatches | dispatcher_id | BTREE |
| `idx_dispatches_incident` | dispatches | incident_id | BTREE |
| `idx_dispatches_resource` | dispatches | resource_id | BTREE |
| `idx_dispatches_status` | dispatches | status | BTREE |
| `idx_resources_org` | resources | organization_id | BTREE |
| `idx_resources_status` | resources | status | BTREE |
| `idx_resources_type` | resources | resource_type | BTREE |
| `idx_resource_status_log` | resource_status_log | resource_id, recorded_at DESC | BTREE |
| `idx_resource_status_point` | resource_status_log | point | GIST |
| `idx_referrals_facility` | facility_referrals | facility_id | BTREE |
| `idx_referrals_incident` | facility_referrals | incident_id | BTREE |
| `idx_notifications_channel` | notifications | channel | BTREE |
| `idx_notifications_incident` | notifications | incident_id | BTREE |
| `idx_notifications_recipient` | notifications | recipient_user_id | BTREE |
| `idx_notifications_status` | notifications | status | BTREE |
| `idx_escalations_incident` | escalations | incident_id | BTREE |
| `idx_escalations_status` | escalations | status | BTREE |
| `idx_announcements_category` | announcements | category | BTREE |
| `idx_announcements_severity` | announcements | severity | BTREE |
| `idx_announcements_status` | announcements | status | BTREE |
| `idx_ann_deliveries_ann` | announcement_deliveries | announcement_id | BTREE |
| `idx_ann_deliveries_status` | announcement_deliveries | status | BTREE |
| `idx_audit_logs_action` | audit_logs | action | BTREE |
| `idx_audit_logs_actor` | audit_logs | actor_id | BTREE |
| `idx_audit_logs_entity` | audit_logs | entity_type, entity_id | BTREE |
| `idx_audit_logs_incident` | audit_logs | incident_id | BTREE |
| `idx_audit_logs_occurred` | audit_logs | occurred_at DESC | BTREE |
| `idx_triggers_incident` | alert_triggers | incident_id | BTREE |
| `idx_triggers_method` | alert_triggers | trigger_method | BTREE |
| `idx_triggers_user` | alert_triggers | user_id | BTREE |
| `idx_loc_history_incident` | location_history | incident_id, recorded_at DESC | BTREE |
| `idx_loc_history_point` | location_history | point | GIST |
| `idx_loc_history_resource` | location_history | resource_id, recorded_at DESC | BTREE |
| `idx_offline_queue_status` | offline_event_queue | sync_status | BTREE |
| `idx_offline_queue_user` | offline_event_queue | user_id | BTREE |
| `idx_assessments_incident` | on_scene_assessments | incident_id | BTREE |
| `idx_risk_areas_boundary` | risk_areas | area_boundary | GIST |
| `idx_risk_areas_type` | risk_areas | risk_type | BTREE |
| `idx_responder_availability_status` | responder_availability | status | BTREE |
| `idx_user_sessions_expires` | user_sessions | expires_at | BTREE |
| `idx_user_sessions_user_id` | user_sessions | user_id | BTREE |
| `idx_user_verifications_token` | user_verifications | token | BTREE |
| `idx_user_verifications_user` | user_verifications | user_id | BTREE |
| `idx_webauthn_credentials_user` | webauthn_credentials | user_id | BTREE |
| `idx_webauthn_challenges_expires` | webauthn_challenges | expires_at | BTREE |
| `idx_webauthn_challenges_status` | webauthn_challenges | status | BTREE |
| `idx_webauthn_challenges_user` | webauthn_challenges | user_id | BTREE |
| `idx_webauthn_auth_log_credential` | webauthn_authentication_log | credential_id | BTREE |
| `idx_webauthn_auth_log_user` | webauthn_authentication_log | user_id, occurred_at DESC | BTREE |

---

## Module–Table Mapping

| Module | Primary Tables |
|---|---|
| MOD-01 User Registration | `users`, `user_sessions`, `user_verifications`, `webauthn_credentials`, `webauthn_challenges`, `webauthn_authentication_log`, `account_lifecycle_events` |
| MOD-02 Emergency Contacts | `emergency_contacts` |
| MOD-03 Medical Profile | `medical_profiles`, `consent_records` |
| MOD-04 Accessibility | `users` (text_size, high_contrast, reduced_motion, preferred_language) |
| MOD-05 Permissions Status | `users` (is_email_verified, is_phone_verified, profile_completeness) |
| MOD-06 SOS Trigger | `alert_triggers`, `incidents` |
| MOD-07 Shake-to-Alert | `alert_triggers` (trigger_method = SHAKE_GESTURE) |
| MOD-08 False Alert Mgmt | `false_alerts`, `alert_triggers` |
| MOD-09 Incident Detail Capture | `incident_details`, `first_aid_guides` |
| MOD-10 Photo / Evidence | `incident_attachments` |
| MOD-11 GPS Capture | `incident_locations`, `alert_triggers` |
| MOD-12 Reverse Geocoding | `incident_locations` (formatted_address, barangay, municipality) |
| MOD-13 Live Tracking | `location_history` |
| MOD-14 Incident Record | `incidents`, `incident_reporters` |
| MOD-15 Lifecycle State | `incidents` (status), `incident_events` |
| MOD-16 Emergency Contact Notification | `notifications`, `emergency_contacts` |
| MOD-17 Multi-Channel Transmission | `notifications`, `notification_deliveries` |
| MOD-18 Responder Dispatch Messaging | `notifications`, `dispatches` |
| MOD-19 Offline Queue | `offline_event_queue` |
| MOD-20 WebSocket Engine | No dedicated table (in-memory pub/sub via Redis) |
| MOD-21 Dispatch Dashboard | `incidents`, `dispatches`, `resources` (read-heavy) |
| MOD-22 Real-Time Map | `incident_locations`, `location_history` (PostGIS queries) |
| MOD-23 Incident Command Queue | `incidents`, `incident_details` |
| MOD-24 Priority Recommendation | `incidents` (priority), `resource_recommendations` |
| MOD-25 Triage & Validation | `incidents`, `incident_details` |
| MOD-26 Duplicate Detection | `incidents` (client_event_id, duplicate_of_id) |
| MOD-27 Organization Registry | `organizations` |
| MOD-28 Resource Readiness | `resources`, `vehicles`, `resource_status_log`, `responder_availability` |
| MOD-29 Resource–Incident Matrix | `resource_capability_assignments`, `resource_capabilities` |
| MOD-30 Resource Recommendation | `resource_recommendations` |
| MOD-31 Dispatcher Assignment | `dispatches`, `dispatch_crew` |
| MOD-32 Responder Mobile Interface | `dispatches`, `resources`, `location_history` |
| MOD-33 Incident Communication | `incident_messages`, `message_reads`, `incident_attachments` |
| MOD-34 Multi-Agency Coordination | `incident_agency_participants`, `organizations` |
| MOD-35 Resource Requests / Mutual Aid | `resource_requests` |
| MOD-36 ICS Support | `incident_command_structures`, `ics_assignments` |
| MOD-37 On-Scene Assessment | `on_scene_assessments`, `incident_patients` |
| MOD-38 Hospital Coordination | `facility_referrals`, `transport_records` |
| MOD-39 Facility Registry | `facilities`, `facility_capabilities` |
| MOD-40 Transport Tracking | `transport_records`, `location_history` |
| MOD-41 SLA & Escalation | `escalations`, `sla_policies` |
| MOD-42 User-Facing Status | `incidents` (status), `incident_events` |
| MOD-43 ETA & Responder Tracking | `location_history`, `resource_recommendations` (eta_seconds) |
| MOD-44 Incident Handover | `incident_handovers` |
| MOD-45 Resolution & Closure | `incident_resolutions`, `feedback_ratings` |
| MOD-46 Audit Trail | `audit_logs` |
| MOD-47 RBAC | `permissions`, `role_permissions` |
| MOD-48 Privacy & Consent | `consent_records`, `sensitive_data_access_log`, `medical_profiles` |
| MOD-49 System Administration | `system_configurations`, `account_lifecycle_events`, `organization_memberships` |
| MOD-50 Analytics | `incident_metrics` |
| MOD-51 Risk Visualization | `risk_areas` (PostGIS) |
| MOD-52 Disaster / Surge Mode | `surge_incidents`, `triage_tags` |
| MOD-53 Announcements | `announcements`, `announcement_deliveries`, `sms_subscribers` |
