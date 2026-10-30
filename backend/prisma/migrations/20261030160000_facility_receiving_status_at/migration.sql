-- MOD-39 (AUTOMATION_NEEDS_PLAN Phase 4, C8): when the receiving status was last reported.
-- Set only by a status report (PATCH /v1/facilities/:id/status). The hourly freshness
-- reminder and the referral ranking (C6) read it; no job ever writes the status itself.
ALTER TABLE "facilities" ADD COLUMN "receiving_status_updated_at" TIMESTAMPTZ(6);

-- Existing rows: their last update is the best known time.
UPDATE "facilities" SET "receiving_status_updated_at" = "updated_at";
