-- MOD-26: link an incident to the master it duplicates (advisory merge, human-confirmed).
ALTER TABLE "incidents" ADD COLUMN "duplicate_of_id" UUID;

ALTER TABLE "incidents"
  ADD CONSTRAINT "fk_incident_duplicate_of"
  FOREIGN KEY ("duplicate_of_id") REFERENCES "incidents"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_incidents_duplicate_of" ON "incidents"("duplicate_of_id");
