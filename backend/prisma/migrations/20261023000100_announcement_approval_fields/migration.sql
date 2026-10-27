-- MOD-53 approval workflow (ROLE_DASHBOARDS_PLAN.md Phase 7). All nullable: existing
-- rows are untouched. `approved_by_id` / `approved_at` already exist and keep their
-- meaning (who released the notice).

ALTER TABLE "announcements"
  ADD COLUMN "approval_requested_at"    TIMESTAMPTZ(6),
  ADD COLUMN "approval_requested_by_id" UUID,
  ADD COLUMN "review_note"              TEXT;

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_approval_requested_by_id_fkey"
  FOREIGN KEY ("approval_requested_by_id") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
