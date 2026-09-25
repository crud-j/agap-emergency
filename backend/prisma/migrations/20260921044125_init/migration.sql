-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis" WITH VERSION "3.6.1";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "announcement_category" AS ENUM ('CLASS_SUSPENSION', 'FLOOD_ALERT', 'EVACUATION_ORDER', 'ROAD_CLOSURE', 'FIRE_ADVISORY', 'INDUSTRIAL_HAZARD', 'POST_DISASTER_UPDATE', 'RESCUE_UPDATE', 'GENERAL_INFORMATION');

-- CreateEnum
CREATE TYPE "announcement_scope" AS ENUM ('MUNICIPALITY_WIDE', 'BARANGAY_SPECIFIC', 'CATEGORY_SPECIFIC');

-- CreateEnum
CREATE TYPE "announcement_severity" AS ENUM ('INFORMATIONAL', 'ADVISORY', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'PERMISSION_DENIED', 'STATUS_CHANGE', 'DISPATCH', 'ESCALATE', 'PUBLISH', 'SUBSCRIBE', 'UNSUBSCRIBE', 'CONSENT_GRANT', 'CONSENT_WITHDRAW', 'DATA_EXPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "breathing_status" AS ENUM ('NORMAL', 'DIFFICULTY', 'NOT_BREATHING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "cancellation_reason" AS ENUM ('ACCIDENTAL_TRIGGER', 'SITUATION_RESOLVED', 'DUPLICATE_REPORT', 'WRONG_APP', 'TEST', 'OTHER');

-- CreateEnum
CREATE TYPE "consciousness_state" AS ENUM ('CONSCIOUS', 'UNCONSCIOUS', 'ALTERED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "consent_status" AS ENUM ('GRANTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "dispatch_status" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "escalation_level" AS ENUM ('LEVEL_1_SUPERVISOR', 'LEVEL_2_INCIDENT_COMMANDER', 'LEVEL_3_ADMINISTRATOR', 'LEVEL_4_DRRMO');

-- CreateEnum
CREATE TYPE "escalation_status" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "facility_receiving_status" AS ENUM ('OPEN', 'AT_CAPACITY', 'CLOSED', 'EMERGENCY_ONLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "facility_type" AS ENUM ('HOSPITAL', 'EVACUATION_CENTER', 'BARANGAY_HALL', 'RELIEF_CENTER', 'CLINIC', 'OTHER');

-- CreateEnum
CREATE TYPE "false_alert_type" AS ENUM ('ACCIDENTAL', 'DUPLICATE', 'TEST', 'PRANK', 'MISIDENTIFIED', 'OTHER');

-- CreateEnum
CREATE TYPE "ics_position" AS ENUM ('INCIDENT_COMMANDER', 'OPERATIONS_SECTION_CHIEF', 'LOGISTICS_SECTION_CHIEF', 'PLANNING_SECTION_CHIEF', 'SAFETY_OFFICER', 'PUBLIC_INFORMATION_OFFICER', 'LIAISON_OFFICER');

-- CreateEnum
CREATE TYPE "incident_category" AS ENUM ('MEDICAL', 'ROAD_ACCIDENT', 'FLOOD', 'RESCUE', 'FIRE', 'INDUSTRIAL', 'DEBRIS', 'OTHER');

-- CreateEnum
CREATE TYPE "incident_priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('PUSH', 'SMS', 'IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "organization_type" AS ENUM ('MDRRMO', 'BFP', 'PNP', 'HOSPITAL', 'EMS_PROVIDER', 'NGO', 'LGU', 'OTHER');

-- CreateEnum
CREATE TYPE "patient_disposition" AS ENUM ('TREATED_ON_SCENE', 'TRANSPORTED_TO_HOSPITAL', 'TRANSPORTED_TO_EVACUATION_CENTER', 'REFUSED_TRANSPORT', 'DECEASED_ON_SCENE', 'TRANSFERRED_TO_OTHER_AGENCY', 'UNABLE_TO_LOCATE', 'NO_PATIENT_FOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "resource_request_status" AS ENUM ('PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "resource_status" AS ENUM ('AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'RETURNING', 'OUT_OF_SERVICE', 'OFFLINE', 'RESERVED');

-- CreateEnum
CREATE TYPE "resource_type" AS ENUM ('AMBULANCE', 'RESCUE_BOAT', 'FIRE_TRUCK', 'RESCUE_TRUCK', 'CLEARING_EQUIPMENT', 'MOTORCYCLE_RESPONDER', 'COMMAND_VEHICLE', 'OTHER');

-- CreateEnum
CREATE TYPE "surge_status" AS ENUM ('INACTIVE', 'MONITORING', 'ACTIVE', 'DEACTIVATING');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'DUPLICATE_REJECTED');

-- CreateEnum
CREATE TYPE "trigger_method" AS ENUM ('SOS_BUTTON', 'SHAKE_GESTURE', 'MANUAL_REPORT', 'DISPATCHER_CREATED', 'SYSTEM_GENERATED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('CITIZEN', 'BYSTANDER', 'DISPATCHER', 'SUPERVISOR', 'RESPONDER', 'HOSPITAL_USER', 'ORG_ADMINISTRATOR', 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "verification_type" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "webauthn_ceremony_status" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "webauthn_ceremony_type" AS ENUM ('REGISTRATION', 'AUTHENTICATION');

-- CreateEnum
CREATE TYPE "webauthn_transport" AS ENUM ('USB', 'NFC', 'BLE', 'INTERNAL', 'HYBRID', 'SMART_CARD');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "full_name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone_number" VARCHAR(20),
    "password_hash" VARCHAR(255),
    "role" "user_role" NOT NULL DEFAULT 'CITIZEN',
    "status" "user_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "profile_completeness" SMALLINT NOT NULL DEFAULT 0,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_phone_verified" BOOLEAN NOT NULL DEFAULT false,
    "barangay" VARCHAR(100),
    "municipality" VARCHAR(100) DEFAULT 'Bocaue',
    "province" VARCHAR(100) DEFAULT 'Bulacan',
    "full_address" TEXT,
    "preferred_language" VARCHAR(10) NOT NULL DEFAULT 'fil',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "contact_name" VARCHAR(255) NOT NULL,
    "relationship" VARCHAR(100),
    "phone_number" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "priority_order" SMALLINT NOT NULL DEFAULT 1,
    "notify_on_alert" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_profiles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "consent_record_id" UUID NOT NULL,
    "blood_type" VARCHAR(5),
    "allergies" TEXT[],
    "current_medications" TEXT[],
    "medical_conditions" TEXT[],
    "disabilities" TEXT[],
    "responder_notes" TEXT,
    "last_reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "short_name" VARCHAR(50),
    "organization_type" "organization_type" NOT NULL,
    "barangay" VARCHAR(100),
    "municipality" VARCHAR(100) DEFAULT 'Bocaue',
    "province" VARCHAR(100) DEFAULT 'Bulacan',
    "address" TEXT,
    "location" geography,
    "contact_number" VARCHAR(20),
    "email" VARCHAR(255),
    "operational_area" geography,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "public_reference" VARCHAR(30) NOT NULL,
    "trigger_method" "trigger_method" NOT NULL DEFAULT 'SOS_BUTTON',
    "client_event_id" VARCHAR(100),
    "category" "incident_category" NOT NULL,
    "priority" "incident_priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "incident_status" NOT NULL DEFAULT 'SUBMITTED',
    "consciousness_state" "consciousness_state" DEFAULT 'UNKNOWN',
    "breathing_status" "breathing_status" DEFAULT 'UNKNOWN',
    "description" TEXT,
    "number_of_patients" SMALLINT DEFAULT 1,
    "hazard_flags" TEXT[],
    "river_level_meters" DECIMAL(5,2),
    "surge_incident_id" UUID,
    "is_surge_incident" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),
    "assessed_at" TIMESTAMPTZ(6),
    "dispatch_pending_at" TIMESTAMPTZ(6),
    "dispatched_at" TIMESTAMPTZ(6),
    "en_route_at" TIMESTAMPTZ(6),
    "on_scene_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_reporters" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "user_id" UUID,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "reporter_name" VARCHAR(255),
    "reporter_phone" VARCHAR(20),
    "contact_callback" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_reporters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_attachments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_type" VARCHAR(50) NOT NULL,
    "file_size_bytes" INTEGER,
    "storage_bucket" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "storage_url" TEXT,
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "from_status" "incident_status",
    "to_status" "incident_status" NOT NULL,
    "triggered_by_id" UUID,
    "triggered_by_role" "user_role",
    "notes" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "plate_number" VARCHAR(20),
    "unit_code" VARCHAR(50),
    "resource_type" "resource_type" NOT NULL,
    "make" VARCHAR(100),
    "model" VARCHAR(100),
    "year" SMALLINT,
    "capacity_persons" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "facility_type" "facility_type" NOT NULL,
    "barangay" VARCHAR(100),
    "municipality" VARCHAR(100),
    "province" VARCHAR(100),
    "address" TEXT,
    "location" geography,
    "contact_number" VARCHAR(20),
    "emergency_contact" VARCHAR(20),
    "receiving_status" "facility_receiving_status" NOT NULL DEFAULT 'UNKNOWN',
    "capacity_total" SMALLINT,
    "capacity_available" SMALLINT,
    "has_emergency_room" BOOLEAN DEFAULT false,
    "has_icu" BOOLEAN DEFAULT false,
    "blood_bank" BOOLEAN DEFAULT false,
    "is_evacuation_center" BOOLEAN DEFAULT false,
    "elevation_masl" DECIMAL(6,1),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "dispatch_id" UUID NOT NULL,
    "patient_id" UUID,
    "destination_id" UUID,
    "transport_started_at" TIMESTAMPTZ(6),
    "estimated_arrival_at" TIMESTAMPTZ(6),
    "arrived_at" TIMESTAMPTZ(6),
    "handover_completed_at" TIMESTAMPTZ(6),
    "destination_changed" BOOLEAN NOT NULL DEFAULT false,
    "change_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID,
    "recipient_user_id" UUID,
    "recipient_phone" VARCHAR(20),
    "channel" "notification_channel" NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255),
    "body" TEXT NOT NULL,
    "data_payload" JSONB,
    "sms_payload" VARCHAR(160),
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "max_retries" SMALLINT NOT NULL DEFAULT 3,
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "sla_policy_id" UUID,
    "escalation_level" "escalation_level" NOT NULL,
    "status" "escalation_status" NOT NULL DEFAULT 'ACTIVE',
    "triggered_reason" TEXT NOT NULL,
    "sla_breach_at" TIMESTAMPTZ(6) NOT NULL,
    "notified_user_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "requesting_org_id" UUID NOT NULL,
    "providing_org_id" UUID,
    "resource_type" "resource_type" NOT NULL,
    "quantity" SMALLINT NOT NULL DEFAULT 1,
    "capability_needed" TEXT[],
    "priority" "incident_priority" NOT NULL DEFAULT 'HIGH',
    "status" "resource_request_status" NOT NULL DEFAULT 'PENDING',
    "request_notes" TEXT,
    "response_notes" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "actor_id" UUID,
    "actor_role" "user_role",
    "action" "audit_action" NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" UUID,
    "module_id" VARCHAR(10),
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "incident_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "publisher_id" UUID NOT NULL,
    "organization_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "category" "announcement_category" NOT NULL,
    "severity" "announcement_severity" NOT NULL DEFAULT 'INFORMATIONAL',
    "scope" "announcement_scope" NOT NULL DEFAULT 'MUNICIPALITY_WIDE',
    "target_barangays" TEXT[],
    "status" "announcement_status" NOT NULL DEFAULT 'DRAFT',
    "publish_now" BOOLEAN NOT NULL DEFAULT true,
    "scheduled_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "superseded_by_id" UUID,
    "push_sent_count" INTEGER DEFAULT 0,
    "sms_sent_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_lifecycle_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "performed_by_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_triggers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID,
    "user_id" UUID,
    "trigger_method" "trigger_method" NOT NULL,
    "client_event_id" VARCHAR(100) NOT NULL,
    "device_info" JSONB,
    "shake_magnitude" DECIMAL(6,3),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "accuracy_meters" DECIMAL(8,2),
    "triggered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancel_deadline_at" TIMESTAMPTZ(6),
    "was_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_reason" "cancellation_reason",
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_deliveries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "announcement_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "recipient_user_id" UUID,
    "recipient_phone" VARCHAR(20),
    "sms_subscriber_id" UUID,
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" SMALLINT NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "consent_type" VARCHAR(100) NOT NULL,
    "status" "consent_status" NOT NULL DEFAULT 'GRANTED',
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "ip_address" INET,
    "device_info" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_crew" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "dispatch_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_on_scene" VARCHAR(100),
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_crew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "dispatcher_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "dispatch_status" NOT NULL DEFAULT 'PENDING',
    "dispatch_notes" TEXT,
    "authorized_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "rejected_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_capabilities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "facility_id" UUID NOT NULL,
    "capability_name" VARCHAR(100) NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "facility_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_referrals" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "dispatch_id" UUID,
    "facility_id" UUID NOT NULL,
    "patient_id" UUID,
    "coordinated_by_id" UUID,
    "pre_arrival_notes" TEXT,
    "eta_minutes" SMALLINT,
    "acknowledgment_status" VARCHAR(50) DEFAULT 'PENDING',
    "acknowledged_at" TIMESTAMPTZ(6),
    "patient_arrived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "false_alerts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "user_id" UUID,
    "classified_by_id" UUID,
    "false_alert_type" "false_alert_type" NOT NULL,
    "notes" TEXT,
    "classified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "false_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_ratings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "submitted_by_id" UUID,
    "overall_rating" SMALLINT,
    "response_time_rating" SMALLINT,
    "responder_rating" SMALLINT,
    "app_usability_rating" SMALLINT,
    "comments" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "first_aid_guides" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "category" "incident_category" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content_fil" TEXT NOT NULL,
    "content_en" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" SMALLINT DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "first_aid_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ics_assignments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "ics_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "position" "ics_position" NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relieved_at" TIMESTAMPTZ(6),

    CONSTRAINT "ics_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_agency_participants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invited_by_id" UUID,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),
    "role_in_incident" VARCHAR(100),

    CONSTRAINT "incident_agency_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_command_structures" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),
    "objectives" TEXT[],
    "situation_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_command_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_details" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "subcategory" VARCHAR(100),
    "people_affected" SMALLINT DEFAULT 1,
    "property_damage" BOOLEAN DEFAULT false,
    "fire_spreading" BOOLEAN DEFAULT false,
    "road_blocked" BOOLEAN DEFAULT false,
    "water_level_note" VARCHAR(255),
    "additional_notes" TEXT,
    "first_aid_guide_id" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_handovers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "situation_summary" TEXT NOT NULL,
    "pending_actions" TEXT[],
    "resources_in_field" JSONB,
    "handed_over_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "incident_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_locations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "altitude_meters" DECIMAL(8,2),
    "point" geography,
    "formatted_address" TEXT,
    "street" VARCHAR(255),
    "barangay" VARCHAR(100),
    "municipality" VARCHAR(100),
    "province" VARCHAR(100),
    "geocoding_confidence" DECIMAL(3,2),
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(50) DEFAULT 'GPS',

    CONSTRAINT "incident_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "organization_id" UUID,
    "message_text" TEXT NOT NULL,
    "attachment_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "organization_id" UUID,
    "category" "incident_category",
    "priority" "incident_priority",
    "barangay" VARCHAR(100),
    "trigger_method" "trigger_method",
    "submitted_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),
    "dispatched_at" TIMESTAMPTZ(6),
    "on_scene_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "acknowledge_duration_secs" INTEGER,
    "dispatch_duration_secs" INTEGER,
    "response_duration_secs" INTEGER,
    "total_duration_secs" INTEGER,
    "acknowledge_sla_met" BOOLEAN,
    "dispatch_sla_met" BOOLEAN,
    "final_status" "incident_status",
    "patient_disposition" "patient_disposition",
    "aggregated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_patients" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "is_reporter" BOOLEAN NOT NULL DEFAULT false,
    "is_unknown" BOOLEAN NOT NULL DEFAULT false,
    "patient_name" VARCHAR(255),
    "approximate_age" SMALLINT,
    "sex" VARCHAR(20),
    "user_id" UUID,
    "medical_profile_id" UUID,
    "scene_assessment_notes" TEXT,
    "vitals_at_scene" JSONB,
    "interventions_done" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patient_sequence" SMALLINT NOT NULL DEFAULT 1,

    CONSTRAINT "incident_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_resolutions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "closed_by_id" UUID NOT NULL,
    "outcome" VARCHAR(100) NOT NULL,
    "patient_disposition" "patient_disposition",
    "time_to_acknowledge_secs" INTEGER,
    "time_to_dispatch_secs" INTEGER,
    "time_to_on_scene_secs" INTEGER,
    "time_to_resolved_secs" INTEGER,
    "total_response_secs" INTEGER,
    "resolution_notes" TEXT,
    "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_notes" TEXT,
    "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "user_id" UUID,
    "resource_id" UUID,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "speed_kmh" DECIMAL(6,2),
    "heading_degrees" DECIMAL(5,2),
    "point" geography,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reads" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "notification_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_message_id" VARCHAR(255),
    "provider_status" VARCHAR(100),
    "provider_response" JSONB,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_event_queue" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "client_event_id" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "device_info" JSONB,
    "queued_at_device" TIMESTAMPTZ(6) NOT NULL,
    "received_at_server" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_status" "sync_status" NOT NULL DEFAULT 'PENDING',
    "incident_id" UUID,
    "processed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_event_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_scene_assessments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "patient_id" UUID,
    "dispatch_id" UUID,
    "assessed_by_id" UUID NOT NULL,
    "blood_pressure_sys" SMALLINT,
    "blood_pressure_dia" SMALLINT,
    "pulse_bpm" SMALLINT,
    "respiratory_rate" SMALLINT,
    "temperature_celsius" DECIMAL(4,1),
    "oxygen_saturation" SMALLINT,
    "gcs_score" SMALLINT,
    "consciousness_state" "consciousness_state",
    "breathing_status" "breathing_status",
    "visible_injuries" TEXT[],
    "interventions" TEXT[],
    "triage_tag" VARCHAR(20),
    "assessment_notes" TEXT,
    "assessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "on_scene_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(6),

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "module_id" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_capabilities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_capability_assignments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "resource_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_capability_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_recommendations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "rank" SMALLINT NOT NULL,
    "score" DECIMAL(5,2),
    "distance_meters" INTEGER,
    "eta_seconds" INTEGER,
    "reasoning" JSONB,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_status_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "resource_id" UUID NOT NULL,
    "from_status" "resource_status",
    "to_status" "resource_status" NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "point" geography,
    "speed_kmh" DECIMAL(6,2),
    "incident_id" UUID,
    "changed_by_id" UUID,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_status_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "call_sign" VARCHAR(50),
    "resource_type" "resource_type" NOT NULL,
    "status" "resource_status" NOT NULL DEFAULT 'AVAILABLE',
    "current_incident_id" UUID,
    "base_location" geography,
    "base_barangay" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_areas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "risk_type" "incident_category" NOT NULL,
    "risk_level" VARCHAR(20) NOT NULL DEFAULT 'MODERATE',
    "area_boundary" geography,
    "barangay" VARCHAR(100),
    "flood_threshold_meters" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "role" "user_role" NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensitive_data_access_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "accessor_id" UUID NOT NULL,
    "data_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "purpose" TEXT,
    "incident_id" UUID,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensitive_data_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "organization_id" UUID NOT NULL,
    "incident_category" "incident_category",
    "priority" "incident_priority",
    "acknowledge_threshold_secs" INTEGER NOT NULL DEFAULT 120,
    "dispatch_threshold_secs" INTEGER NOT NULL DEFAULT 300,
    "on_scene_threshold_secs" INTEGER NOT NULL DEFAULT 900,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_subscribers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "phone_number" VARCHAR(20) NOT NULL,
    "user_id" UUID,
    "barangay_preference" VARCHAR(100),
    "scope_preference" "announcement_scope" DEFAULT 'MUNICIPALITY_WIDE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "subscribed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opted_out_at" TIMESTAMPTZ(6),
    "opt_out_source" VARCHAR(50),

    CONSTRAINT "sms_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surge_incidents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "declared_by_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" "incident_category" NOT NULL,
    "affected_area" geography,
    "affected_barangays" TEXT[],
    "status" "surge_status" NOT NULL DEFAULT 'ACTIVE',
    "bocaue_river_level" DECIMAL(5,2),
    "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surge_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configurations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "config_key" VARCHAR(255) NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_tags" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "surge_id" UUID NOT NULL,
    "patient_id" UUID,
    "incident_id" UUID,
    "triage_color" VARCHAR(20) NOT NULL,
    "triage_notes" TEXT,
    "tagged_by_id" UUID,
    "tagged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "triage_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "refresh_token_hash" VARCHAR(255),
    "device_info" JSONB,
    "ip_address" INET,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_verifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "verification_type" "verification_type" NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "status" "verification_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_authentication_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "credential_id" UUID,
    "was_successful" BOOLEAN NOT NULL,
    "failure_reason" VARCHAR(255),
    "ip_address" INET,
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_authentication_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_challenges" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "ceremony_type" "webauthn_ceremony_type" NOT NULL,
    "status" "webauthn_ceremony_status" NOT NULL DEFAULT 'PENDING',
    "challenge" TEXT NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "sign_count" BIGINT NOT NULL DEFAULT 0,
    "aaguid" UUID,
    "attestation_format" VARCHAR(50),
    "transports" "webauthn_transport"[],
    "is_backup_eligible" BOOLEAN NOT NULL DEFAULT false,
    "is_backed_up" BOOLEAN NOT NULL DEFAULT false,
    "device_label" VARCHAR(150),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(6),
    "last_used_ip" INET,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "idx_users_barangay" ON "users"("barangay");

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_users_name_trgm" ON "users" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_users_status" ON "users"("status");

-- CreateIndex
CREATE INDEX "idx_emergency_contacts_user" ON "emergency_contacts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "medical_profiles_user_id_key" ON "medical_profiles"("user_id");

-- CreateIndex
CREATE INDEX "idx_organizations_type" ON "organizations"("organization_type");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_public_reference_key" ON "incidents"("public_reference");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_client_event_id_key" ON "incidents"("client_event_id");

-- CreateIndex
CREATE INDEX "idx_incidents_category" ON "incidents"("category");

-- CreateIndex
CREATE INDEX "idx_incidents_composite" ON "incidents"("status", "priority", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "idx_incidents_priority" ON "incidents"("priority");

-- CreateIndex
CREATE INDEX "idx_incidents_reference" ON "incidents"("public_reference");

-- CreateIndex
CREATE INDEX "idx_incidents_status" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "idx_incidents_submitted_at" ON "incidents"("submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "incident_reporters_incident_id_key" ON "incident_reporters"("incident_id");

-- CreateIndex
CREATE INDEX "idx_reporters_incident" ON "incident_reporters"("incident_id");

-- CreateIndex
CREATE INDEX "idx_reporters_user" ON "incident_reporters"("user_id");

-- CreateIndex
CREATE INDEX "idx_incident_events" ON "incident_events"("incident_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "idx_notifications_channel" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "idx_notifications_incident" ON "notifications"("incident_id");

-- CreateIndex
CREATE INDEX "idx_notifications_recipient" ON "notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "idx_notifications_status" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "idx_escalations_incident" ON "escalations"("incident_id");

-- CreateIndex
CREATE INDEX "idx_escalations_status" ON "escalations"("status");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_incident" ON "audit_logs"("incident_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_occurred" ON "audit_logs"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_announcements_category" ON "announcements"("category");

-- CreateIndex
CREATE INDEX "idx_announcements_severity" ON "announcements"("severity");

-- CreateIndex
CREATE INDEX "idx_announcements_status" ON "announcements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "alert_triggers_client_event_id_key" ON "alert_triggers"("client_event_id");

-- CreateIndex
CREATE INDEX "idx_triggers_incident" ON "alert_triggers"("incident_id");

-- CreateIndex
CREATE INDEX "idx_triggers_method" ON "alert_triggers"("trigger_method");

-- CreateIndex
CREATE INDEX "idx_triggers_user" ON "alert_triggers"("user_id");

-- CreateIndex
CREATE INDEX "idx_ann_deliveries_ann" ON "announcement_deliveries"("announcement_id");

-- CreateIndex
CREATE INDEX "idx_ann_deliveries_status" ON "announcement_deliveries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_crew_dispatch_id_user_id_key" ON "dispatch_crew"("dispatch_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_dispatches_dispatcher" ON "dispatches"("dispatcher_id");

-- CreateIndex
CREATE INDEX "idx_dispatches_incident" ON "dispatches"("incident_id");

-- CreateIndex
CREATE INDEX "idx_dispatches_resource" ON "dispatches"("resource_id");

-- CreateIndex
CREATE INDEX "idx_dispatches_status" ON "dispatches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "facility_capabilities_facility_id_capability_name_key" ON "facility_capabilities"("facility_id", "capability_name");

-- CreateIndex
CREATE INDEX "idx_referrals_facility" ON "facility_referrals"("facility_id");

-- CreateIndex
CREATE INDEX "idx_referrals_incident" ON "facility_referrals"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "ics_assignments_ics_id_position_user_id_key" ON "ics_assignments"("ics_id", "position", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_agency_participants_incident_id_organization_id_key" ON "incident_agency_participants"("incident_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_command_structures_incident_id_key" ON "incident_command_structures"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_details_incident_id_key" ON "incident_details"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_locations_incident_id_key" ON "incident_locations"("incident_id");

-- CreateIndex
CREATE INDEX "idx_locations_barangay" ON "incident_locations"("barangay");

-- CreateIndex
CREATE INDEX "idx_locations_incident" ON "incident_locations"("incident_id");

-- CreateIndex
CREATE INDEX "idx_locations_point" ON "incident_locations" USING GIST ("point");

-- CreateIndex
CREATE INDEX "idx_messages_incident" ON "incident_messages"("incident_id", "sent_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "incident_metrics_incident_id_key" ON "incident_metrics"("incident_id");

-- CreateIndex
CREATE INDEX "idx_metrics_barangay" ON "incident_metrics"("barangay");

-- CreateIndex
CREATE INDEX "idx_metrics_category" ON "incident_metrics"("category");

-- CreateIndex
CREATE INDEX "idx_metrics_org" ON "incident_metrics"("organization_id");

-- CreateIndex
CREATE INDEX "idx_metrics_submitted" ON "incident_metrics"("submitted_at" DESC);

-- CreateIndex
CREATE INDEX "idx_patients_incident" ON "incident_patients"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_resolutions_incident_id_key" ON "incident_resolutions"("incident_id");

-- CreateIndex
CREATE INDEX "idx_loc_history_incident" ON "location_history"("incident_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_loc_history_point" ON "location_history" USING GIST ("point");

-- CreateIndex
CREATE INDEX "idx_loc_history_resource" ON "location_history"("resource_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "message_reads_message_id_user_id_key" ON "message_reads"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "offline_event_queue_client_event_id_key" ON "offline_event_queue"("client_event_id");

-- CreateIndex
CREATE INDEX "idx_offline_queue_status" ON "offline_event_queue"("sync_status");

-- CreateIndex
CREATE INDEX "idx_offline_queue_user" ON "offline_event_queue"("user_id");

-- CreateIndex
CREATE INDEX "idx_assessments_incident" ON "on_scene_assessments"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "resource_capabilities_name_key" ON "resource_capabilities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "resource_capability_assignments_resource_id_capability_id_key" ON "resource_capability_assignments"("resource_id", "capability_id");

-- CreateIndex
CREATE INDEX "idx_resource_status_log" ON "resource_status_log"("resource_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_resource_status_point" ON "resource_status_log" USING GIST ("point");

-- CreateIndex
CREATE INDEX "idx_resources_org" ON "resources"("organization_id");

-- CreateIndex
CREATE INDEX "idx_resources_status" ON "resources"("status");

-- CreateIndex
CREATE INDEX "idx_resources_type" ON "resources"("resource_type");

-- CreateIndex
CREATE INDEX "idx_risk_areas_boundary" ON "risk_areas" USING GIST ("area_boundary");

-- CreateIndex
CREATE INDEX "idx_risk_areas_type" ON "risk_areas"("risk_type");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_subscribers_phone_number_key" ON "sms_subscribers"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "system_configurations_config_key_key" ON "system_configurations"("config_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "idx_user_sessions_expires" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_verifications_token" ON "user_verifications"("token");

-- CreateIndex
CREATE INDEX "idx_user_verifications_user" ON "user_verifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_webauthn_auth_log_credential" ON "webauthn_authentication_log"("credential_id");

-- CreateIndex
CREATE INDEX "idx_webauthn_auth_log_user" ON "webauthn_authentication_log"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_challenges_challenge_key" ON "webauthn_challenges"("challenge");

-- CreateIndex
CREATE INDEX "idx_webauthn_challenges_expires" ON "webauthn_challenges"("expires_at");

-- CreateIndex
CREATE INDEX "idx_webauthn_challenges_status" ON "webauthn_challenges"("status");

-- CreateIndex
CREATE INDEX "idx_webauthn_challenges_user" ON "webauthn_challenges"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "idx_webauthn_credentials_user" ON "webauthn_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "medical_profiles" ADD CONSTRAINT "medical_profiles_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "medical_profiles" ADD CONSTRAINT "medical_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_surge_incident" FOREIGN KEY ("surge_incident_id") REFERENCES "surge_incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_reporters" ADD CONSTRAINT "incident_reporters_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_reporters" ADD CONSTRAINT "incident_reporters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transport_records" ADD CONSTRAINT "transport_records_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transport_records" ADD CONSTRAINT "transport_records_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transport_records" ADD CONSTRAINT "transport_records_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "transport_records" ADD CONSTRAINT "transport_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "incident_patients"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_notified_user_id_fkey" FOREIGN KEY ("notified_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_sla_policy_id_fkey" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_requests" ADD CONSTRAINT "resource_requests_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_requests" ADD CONSTRAINT "resource_requests_providing_org_id_fkey" FOREIGN KEY ("providing_org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_requests" ADD CONSTRAINT "resource_requests_requesting_org_id_fkey" FOREIGN KEY ("requesting_org_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "account_lifecycle_events" ADD CONSTRAINT "account_lifecycle_events_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "account_lifecycle_events" ADD CONSTRAINT "account_lifecycle_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alert_triggers" ADD CONSTRAINT "alert_triggers_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "alert_triggers" ADD CONSTRAINT "alert_triggers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "announcement_deliveries" ADD CONSTRAINT "announcement_deliveries_sms_subscriber_id_fkey" FOREIGN KEY ("sms_subscriber_id") REFERENCES "sms_subscribers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dispatch_crew" ADD CONSTRAINT "dispatch_crew_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dispatch_crew" ADD CONSTRAINT "dispatch_crew_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatcher_id_fkey" FOREIGN KEY ("dispatcher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facility_capabilities" ADD CONSTRAINT "facility_capabilities_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facility_referrals" ADD CONSTRAINT "facility_referrals_coordinated_by_id_fkey" FOREIGN KEY ("coordinated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facility_referrals" ADD CONSTRAINT "facility_referrals_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facility_referrals" ADD CONSTRAINT "facility_referrals_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facility_referrals" ADD CONSTRAINT "facility_referrals_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "facility_referrals" ADD CONSTRAINT "facility_referrals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "incident_patients"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "false_alerts" ADD CONSTRAINT "false_alerts_classified_by_id_fkey" FOREIGN KEY ("classified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "false_alerts" ADD CONSTRAINT "false_alerts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "false_alerts" ADD CONSTRAINT "false_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback_ratings" ADD CONSTRAINT "feedback_ratings_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedback_ratings" ADD CONSTRAINT "feedback_ratings_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ics_assignments" ADD CONSTRAINT "ics_assignments_ics_id_fkey" FOREIGN KEY ("ics_id") REFERENCES "incident_command_structures"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ics_assignments" ADD CONSTRAINT "ics_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ics_assignments" ADD CONSTRAINT "ics_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_agency_participants" ADD CONSTRAINT "incident_agency_participants_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_agency_participants" ADD CONSTRAINT "incident_agency_participants_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_agency_participants" ADD CONSTRAINT "incident_agency_participants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_command_structures" ADD CONSTRAINT "incident_command_structures_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_details" ADD CONSTRAINT "fk_incident_details_first_aid" FOREIGN KEY ("first_aid_guide_id") REFERENCES "first_aid_guides"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_details" ADD CONSTRAINT "incident_details_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_handovers" ADD CONSTRAINT "incident_handovers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_handovers" ADD CONSTRAINT "incident_handovers_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_handovers" ADD CONSTRAINT "incident_handovers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_locations" ADD CONSTRAINT "incident_locations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_messages" ADD CONSTRAINT "incident_messages_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "incident_attachments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_messages" ADD CONSTRAINT "incident_messages_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_messages" ADD CONSTRAINT "incident_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_messages" ADD CONSTRAINT "incident_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_metrics" ADD CONSTRAINT "incident_metrics_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_metrics" ADD CONSTRAINT "incident_metrics_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_patients" ADD CONSTRAINT "incident_patients_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_patients" ADD CONSTRAINT "incident_patients_medical_profile_id_fkey" FOREIGN KEY ("medical_profile_id") REFERENCES "medical_profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_patients" ADD CONSTRAINT "incident_patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_resolutions" ADD CONSTRAINT "incident_resolutions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incident_resolutions" ADD CONSTRAINT "incident_resolutions_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "fk_location_history_resource" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "incident_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "offline_event_queue" ADD CONSTRAINT "offline_event_queue_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "offline_event_queue" ADD CONSTRAINT "offline_event_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "on_scene_assessments" ADD CONSTRAINT "on_scene_assessments_assessed_by_id_fkey" FOREIGN KEY ("assessed_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "on_scene_assessments" ADD CONSTRAINT "on_scene_assessments_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "on_scene_assessments" ADD CONSTRAINT "on_scene_assessments_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "on_scene_assessments" ADD CONSTRAINT "on_scene_assessments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "incident_patients"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_capability_assignments" ADD CONSTRAINT "resource_capability_assignments_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "resource_capabilities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_capability_assignments" ADD CONSTRAINT "resource_capability_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_recommendations" ADD CONSTRAINT "resource_recommendations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_recommendations" ADD CONSTRAINT "resource_recommendations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_status_log" ADD CONSTRAINT "resource_status_log_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_status_log" ADD CONSTRAINT "resource_status_log_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resource_status_log" ADD CONSTRAINT "resource_status_log_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_current_incident_id_fkey" FOREIGN KEY ("current_incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sensitive_data_access_log" ADD CONSTRAINT "sensitive_data_access_log_accessor_id_fkey" FOREIGN KEY ("accessor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sensitive_data_access_log" ADD CONSTRAINT "sensitive_data_access_log_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sms_subscribers" ADD CONSTRAINT "sms_subscribers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "surge_incidents" ADD CONSTRAINT "surge_incidents_declared_by_id_fkey" FOREIGN KEY ("declared_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "surge_incidents" ADD CONSTRAINT "surge_incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "system_configurations" ADD CONSTRAINT "system_configurations_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "triage_tags" ADD CONSTRAINT "triage_tags_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "triage_tags" ADD CONSTRAINT "triage_tags_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "incident_patients"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "triage_tags" ADD CONSTRAINT "triage_tags_surge_id_fkey" FOREIGN KEY ("surge_id") REFERENCES "surge_incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "triage_tags" ADD CONSTRAINT "triage_tags_tagged_by_id_fkey" FOREIGN KEY ("tagged_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webauthn_authentication_log" ADD CONSTRAINT "webauthn_authentication_log_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "webauthn_credentials"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webauthn_authentication_log" ADD CONSTRAINT "webauthn_authentication_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
