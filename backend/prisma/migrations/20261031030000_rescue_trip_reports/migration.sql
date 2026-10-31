-- Unit field flow plan, Phase 4: a rescue crew's trip log (MOD-32/52).
-- One row per trip, append-only. Counts only, never names. Codes are text, checked by
-- the API against @agap/shared WATER_LEVELS / RESCUE_ACCESS / RESCUE_TAKEN_TO
-- (decision D2; terms still to confirm with MDRRMO Bocaue), so a change needs no enum migration.
CREATE TABLE "rescue_trip_reports" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "incident_id" UUID NOT NULL,
  "dispatch_id" UUID,
  "reported_by_id" UUID NOT NULL,
  "rescued_count" SMALLINT,
  "families" SMALLINT,
  "children" SMALLINT,
  "elderly" SMALLINT,
  "pwd" SMALLINT,
  "pregnant" SMALLINT,
  "still_waiting" SMALLINT,
  "water_level" VARCHAR(20),
  "access" VARCHAR(20),
  "taken_to" VARCHAR(30),
  "taken_to_facility_id" UUID,
  "taken_to_other" VARCHAR(200),
  "notes" TEXT,
  "client_request_id" UUID,
  "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rescue_trip_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rescue_trip_reports_counts_check" CHECK (
    ("rescued_count" IS NULL OR "rescued_count" >= 0)
    AND ("families" IS NULL OR "families" >= 0)
    AND ("children" IS NULL OR "children" >= 0)
    AND ("elderly" IS NULL OR "elderly" >= 0)
    AND ("pwd" IS NULL OR "pwd" >= 0)
    AND ("pregnant" IS NULL OR "pregnant" >= 0)
    AND ("still_waiting" IS NULL OR "still_waiting" >= 0)
  )
);

-- An offline resend carries the same client request ID and gets the first row back.
CREATE UNIQUE INDEX "rescue_trip_reports_client_request_id_key" ON "rescue_trip_reports"("client_request_id");

CREATE INDEX "idx_rescue_trips_incident" ON "rescue_trip_reports"("incident_id", "reported_at" DESC);

-- Surge totals read trips since the surge was declared.
CREATE INDEX "idx_rescue_trips_reported_at" ON "rescue_trip_reports"("reported_at");

ALTER TABLE "rescue_trip_reports" ADD CONSTRAINT "rescue_trip_reports_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- NO ACTION, not SET NULL: SET NULL would be an UPDATE, which the trigger below refuses.
ALTER TABLE "rescue_trip_reports" ADD CONSTRAINT "rescue_trip_reports_dispatch_id_fkey"
  FOREIGN KEY ("dispatch_id") REFERENCES "dispatches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "rescue_trip_reports" ADD CONSTRAINT "rescue_trip_reports_reported_by_id_fkey"
  FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "rescue_trip_reports" ADD CONSTRAINT "rescue_trip_reports_taken_to_facility_id_fkey"
  FOREIGN KEY ("taken_to_facility_id") REFERENCES "facilities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A trip is never edited: a correction is a new trip. DELETE stays possible so an
-- incident's rows still go with it (ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION "rescue_trip_reports_reject_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rescue_trip_reports is append-only (UPDATE refused)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "rescue_trip_reports_no_update"
  BEFORE UPDATE ON "rescue_trip_reports"
  FOR EACH ROW EXECUTE FUNCTION "rescue_trip_reports_reject_update"();
