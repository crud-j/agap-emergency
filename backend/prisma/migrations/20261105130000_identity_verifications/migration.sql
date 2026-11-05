-- MOD-01 / MOD-48: PhilHealth ID scans at citizen registration
-- (docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §5.1). A scan row is created before the
-- account exists and claimed by POST /auth/register. Only the name and PIN are read from
-- the card; the name and the image are sealed with ID_DOCUMENT_ENCRYPTION_KEY, and the PIN
-- is kept only as an HMAC (duplicate check) and its last 4 digits.
CREATE TYPE "id_document_type" AS ENUM ('PHILHEALTH');

CREATE TYPE "identity_verification_status" AS ENUM (
  'AUTO_VERIFIED',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

ALTER TYPE "audit_action" ADD VALUE 'IDENTITY_VERIFICATION_CLAIMED';

-- Set when the ID name matched at registration or staff approved it. Information only:
-- it never affects dispatch or priority (rule 8).
ALTER TABLE "users" ADD COLUMN "identity_verified_at" TIMESTAMPTZ(6);

CREATE TABLE "identity_verifications" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "document_type" "id_document_type" NOT NULL DEFAULT 'PHILHEALTH',
    "status" "identity_verification_status" NOT NULL,
    "claim_token_hash" VARCHAR(64) NOT NULL,
    "claim_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "pin_hmac" VARCHAR(64) NOT NULL,
    "pin_last4" VARCHAR(4) NOT NULL,
    "name_on_id_sealed" TEXT NOT NULL,
    "image_storage_key" TEXT,
    "client_read_ok" BOOLEAN,
    "match_result" JSONB,
    "attempt_number" SMALLINT NOT NULL DEFAULT 1,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" VARCHAR(50),
    "consent_record_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_verifications_claim_token_hash_key" ON "identity_verifications"("claim_token_hash");

CREATE INDEX "idx_identity_verifications_user" ON "identity_verifications"("user_id");

CREATE INDEX "idx_identity_verifications_status_created" ON "identity_verifications"("status", "created_at");

-- One PhilHealth ID per account. Partial, so expired, rejected and unclaimed scans don't
-- count. Prisma can't express a partial index, so it lives only here.
CREATE UNIQUE INDEX "uq_identity_verifications_pin_active"
  ON "identity_verifications" ("pin_hmac")
  WHERE "user_id" IS NOT NULL AND "status" IN ('AUTO_VERIFIED', 'PENDING_REVIEW', 'APPROVED');

ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_consent_record_id_fkey"
  FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
