-- Tier 1 photo validation (MOD-25): trusted capture provenance + advisory authenticity
-- on incident attachments. Advisory only — never blocks dispatch.
ALTER TABLE "incident_attachments"
  ADD COLUMN "capture_timestamp"       TIMESTAMPTZ(6),
  ADD COLUMN "capture_latitude"        DECIMAL(10, 7),
  ADD COLUMN "capture_longitude"       DECIMAL(10, 7),
  ADD COLUMN "capture_accuracy_meters" DECIMAL(8, 2),
  ADD COLUMN "capture_source"          VARCHAR(30),
  ADD COLUMN "authenticity_score"      SMALLINT,
  ADD COLUMN "authenticity_flags"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "authenticity_checked_at" TIMESTAMPTZ(6);
