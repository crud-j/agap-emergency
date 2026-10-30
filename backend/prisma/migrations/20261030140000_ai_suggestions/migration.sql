-- AI Assist (AI_ASSIST_PLAN Phase 1; AUTOMATION_NEEDS_PLAN Phase 3, C4): one row per
-- Gemini call, whatever the outcome. A row is a suggestion a dispatcher accepts or
-- dismisses; it never changes an incident by itself. Only BARANGAY_REPLY is used today;
-- the other kinds are for the roadmap's optional drafts (§6) and share this table.

CREATE TYPE "ai_suggestion_kind" AS ENUM (
  'BARANGAY_REPLY', 'CASE_BRIEF', 'HANDOVER_DRAFT', 'CLOSURE_DRAFT', 'ANNOUNCEMENT_DRAFT', 'ANALYTICS_NARRATIVE'
);

CREATE TYPE "ai_suggestion_status" AS ENUM (
  'PENDING_REVIEW', 'ACCEPTED', 'DISMISSED', 'INFO', 'FAILED', 'SUPERSEDED'
);

CREATE TABLE "ai_suggestions" (
    "id"              UUID NOT NULL DEFAULT uuid_generate_v4(),
    "incident_id"     UUID,
    "subject_type"    VARCHAR(40),
    "subject_id"      UUID,
    "kind"            "ai_suggestion_kind" NOT NULL,
    "status"          "ai_suggestion_status" NOT NULL,
    "input_hash"      VARCHAR(64) NOT NULL,
    "output"          JSONB,
    "model"           VARCHAR(80) NOT NULL,
    "latency_ms"      INTEGER,
    -- An error code only (TIMEOUT, RATE_LIMITED, AUTH, BLOCKED, INVALID_OUTPUT,
    -- DAILY_LIMIT, PROVIDER_ERROR), never a provider message.
    "error"           VARCHAR(40),
    "requested_by_id" UUID,
    "reviewed_by_id"  UUID,
    "reviewed_at"     TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "ai_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_ai_suggestions_incident_kind" ON "ai_suggestions"("incident_id", "kind", "created_at" DESC);
CREATE INDEX "idx_ai_suggestions_subject" ON "ai_suggestions"("subject_type", "subject_id");
-- The daily limit counts today's rows.
CREATE INDEX "idx_ai_suggestions_created" ON "ai_suggestions"("created_at");

ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
