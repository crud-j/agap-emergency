-- Phase 2 password policy and forced password change for web-console staff.
ALTER TABLE "users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "password_changed_at" TIMESTAMPTZ(6);

UPDATE "users"
SET "must_change_password" = true
WHERE "is_guest" = false
  AND "role" IN (
    'SYSTEM_ADMINISTRATOR',
    'ORG_ADMINISTRATOR',
    'SUPERVISOR',
    'DISPATCHER',
    'HOSPITAL_USER',
    'ANNOUNCEMENTS_PUBLISHER'
  );
