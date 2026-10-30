-- Manual rollback. Restores the (location_source, location_source_ref) index from 20261025120000.

DROP INDEX IF EXISTS "uq_facilities_location_source_ref";
CREATE UNIQUE INDEX "uq_facilities_location_source_ref"
  ON "facilities" ("location_source", "location_source_ref") WHERE "location_source_ref" IS NOT NULL;
