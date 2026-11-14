-- MOD-36: keep Incident Command history.
--
-- Ending command now stamps incident_command_structures.deactivated_at, and relieving
-- someone stamps ics_assignments.relieved_at, instead of deleting the rows. So the
-- same person may hold the same job again later, and uniqueness must apply only to
-- the people who hold a job now.

-- Older data could hold more than one current Incident Commander per incident. Keep
-- the most recent one and relieve the others, so the one-commander rule can apply.
UPDATE "ics_assignments" AS a
SET "relieved_at" = now()
WHERE a."position" = 'INCIDENT_COMMANDER'
  AND a."relieved_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ics_assignments" AS b
    WHERE b."ics_id" = a."ics_id"
      AND b."position" = 'INCIDENT_COMMANDER'
      AND b."relieved_at" IS NULL
      AND (b."assigned_at" > a."assigned_at" OR (b."assigned_at" = a."assigned_at" AND b."id" > a."id"))
  );

DROP INDEX IF EXISTS "ics_assignments_ics_id_position_user_id_key";

-- A person holds a given job at most once at a time.
CREATE UNIQUE INDEX "uq_ics_assignments_current_holder"
  ON "ics_assignments" ("ics_id", "position", "user_id")
  WHERE "relieved_at" IS NULL;

-- One Incident Commander at a time.
CREATE UNIQUE INDEX "uq_ics_assignments_one_commander"
  ON "ics_assignments" ("ics_id")
  WHERE "relieved_at" IS NULL AND "position" = 'INCIDENT_COMMANDER';

-- "Which command jobs does this person hold now?" (responder read access, notifications).
CREATE INDEX "idx_ics_assignments_current_user"
  ON "ics_assignments" ("user_id")
  WHERE "relieved_at" IS NULL;

-- Replaces the dropped unique index for lookups by command (schema: @@index([ics_id])).
CREATE INDEX "ics_assignments_ics_id_idx" ON "ics_assignments" ("ics_id");
