-- MOD-09 / MOD-24: structured caller intake for road, fire and natural-disaster reports.

-- Natural disasters without flooding (typhoon damage, fallen trees, collapse, live wires).
ALTER TYPE "incident_category" ADD VALUE IF NOT EXISTS 'NATURAL_DISASTER';

-- Caller answers validated against the @agap/shared intake catalog, and the
-- answers that raised the recommended priority.
ALTER TABLE "incident_details"
  ADD COLUMN "caller_answers" JSONB,
  ADD COLUMN "priority_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Caller-provided nearest landmark.
ALTER TABLE "incident_locations" ADD COLUMN "landmark" VARCHAR(120);

-- Whether the reporter is safe or also needs help.
ALTER TABLE "incident_reporters" ADD COLUMN "reporter_status" VARCHAR(20);
