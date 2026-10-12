-- CreateEnum: personal duty state for responders (distinct from operational
-- ResponderStatus emitted over realtime and the resource_status fleet enum).
CREATE TYPE "responder_availability_status" AS ENUM ('AVAILABLE', 'OFF_DUTY', 'UNAVAILABLE');

-- CreateTable: one row per responder user; primary key on user_id enforces 1:1.
CREATE TABLE "responder_availability" (
    "user_id"       UUID NOT NULL,
    "status"        "responder_availability_status" NOT NULL DEFAULT 'OFF_DUTY',
    "changed_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_id" UUID NOT NULL,
    "source"        VARCHAR(40) NOT NULL DEFAULT 'SELF_SERVICE',
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responder_availability_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "idx_responder_availability_status" ON "responder_availability"("status");

-- AddForeignKey: cascade-delete follows user deletion; user is the entity owner.
ALTER TABLE "responder_availability"
    ADD CONSTRAINT "responder_availability_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey: change actor must not be silently deleted; use NO ACTION.
ALTER TABLE "responder_availability"
    ADD CONSTRAINT "responder_availability_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES "users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Backfill: insert one OFF_DUTY row for every existing RESPONDER user.
-- Idempotent: ON CONFLICT DO NOTHING means re-running never overwrites a row
-- that was concurrently created by an already-deployed backend instance.
INSERT INTO "responder_availability"
    ("user_id", "status", "changed_at", "changed_by_id", "source", "created_at", "updated_at")
SELECT
    u.id,
    'OFF_DUTY'::"responder_availability_status",
    NOW(),
    u.id,
    'BACKFILL',
    NOW(),
    NOW()
FROM "users" u
WHERE u.role = 'RESPONDER'::"user_role"
ON CONFLICT ("user_id") DO NOTHING;
