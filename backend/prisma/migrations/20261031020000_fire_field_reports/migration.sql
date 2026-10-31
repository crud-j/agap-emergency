-- Unit field flow plan, Phase 3: a fire crew's size-up reports (MOD-32/36).
-- Append-only: every report is a new row and the latest is the current picture.
-- Codes are text, checked by the API against @agap/shared FIRE_* (decision D1 is
-- provisional), so changing a code needs no enum migration.
CREATE TABLE "fire_field_reports" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "incident_id" UUID NOT NULL,
  "dispatch_id" UUID,
  "reported_by_id" UUID NOT NULL,
  "alarm_level" VARCHAR(30),
  "fire_status" VARCHAR(20),
  "structures_involved" SMALLINT,
  "occupancy_type" VARCHAR(30),
  "hazards" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "spreading" BOOLEAN,
  "evacuation_needed" BOOLEAN,
  "casualties_seen" SMALLINT,
  "trapped_persons" SMALLINT,
  "notes" TEXT,
  "client_request_id" UUID,
  "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fire_field_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fire_field_reports_counts_check" CHECK (
    ("structures_involved" IS NULL OR "structures_involved" >= 0)
    AND ("casualties_seen" IS NULL OR "casualties_seen" >= 0)
    AND ("trapped_persons" IS NULL OR "trapped_persons" >= 0)
  )
);

-- An offline resend carries the same client request ID and gets the first row back.
CREATE UNIQUE INDEX "fire_field_reports_client_request_id_key" ON "fire_field_reports"("client_request_id");

CREATE INDEX "idx_fire_reports_incident" ON "fire_field_reports"("incident_id", "reported_at" DESC);

ALTER TABLE "fire_field_reports" ADD CONSTRAINT "fire_field_reports_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "fire_field_reports" ADD CONSTRAINT "fire_field_reports_dispatch_id_fkey"
  FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "fire_field_reports" ADD CONSTRAINT "fire_field_reports_reported_by_id_fkey"
  FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A report is never edited: a correction is a new report. DELETE stays possible so an
-- incident's rows still go with it (ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION "fire_field_reports_reject_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fire_field_reports is append-only (UPDATE refused)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "fire_field_reports_no_update"
  BEFORE UPDATE ON "fire_field_reports"
  FOR EACH ROW EXECUTE FUNCTION "fire_field_reports_reject_update"();
