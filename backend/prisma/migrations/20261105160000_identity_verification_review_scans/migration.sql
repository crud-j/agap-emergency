-- MOD-01 / MOD-48: a PhilHealth ID scan the server could not read can still be sent to
-- MDRRMO staff for review, after the citizen's third failed attempt
-- (docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §3, Phase 3 progress log). Such a scan has
-- no readable PIN or name, so these columns become optional. The one-ID-per-account index
-- (uq_identity_verifications_pin_active) ignores NULL PINs; staff catch repeats on review.
ALTER TABLE "identity_verifications" ALTER COLUMN "pin_hmac" DROP NOT NULL;
ALTER TABLE "identity_verifications" ALTER COLUMN "pin_last4" DROP NOT NULL;
ALTER TABLE "identity_verifications" ALTER COLUMN "name_on_id_sealed" DROP NOT NULL;
