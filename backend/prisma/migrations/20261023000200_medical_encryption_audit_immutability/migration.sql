-- MOD-03 / MOD-48: medical profile fields are sealed by the application
-- (AES-256-GCM, MEDICAL_ENCRYPTION_KEY). A sealed blood type is far longer than
-- VarChar(5). The array and notes columns are already unbounded text.
ALTER TABLE "medical_profiles" ALTER COLUMN "blood_type" TYPE TEXT;

-- MOD-46: audit rows are immutable (CLAUDE.md, "no UPDATE or DELETE permitted").
-- ON DELETE SET NULL silently rewrote audit rows when a user or an incident was
-- deleted. NO ACTION refuses the delete instead; accounts are deactivated, not deleted.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_incident_id_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Enforce it in the database too, whatever the caller: INSERT only.
CREATE OR REPLACE FUNCTION "audit_logs_reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_reject_change"();

CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_logs_reject_change"();
