-- Manual rollback. Take `pg_dump -t facilities` first.

DROP INDEX IF EXISTS "uq_facilities_active_hospital_name";
DROP INDEX IF EXISTS "uq_facilities_location_source_ref";
DROP INDEX IF EXISTS "idx_facilities_location_status";
DROP INDEX IF EXISTS "idx_facilities_location";
DROP TRIGGER IF EXISTS "trg_facilities_sync_location" ON "facilities";
DROP FUNCTION IF EXISTS facilities_sync_location();
ALTER TABLE "facilities"
  DROP CONSTRAINT IF EXISTS "facilities_confidence_range_chk",
  DROP CONSTRAINT IF EXISTS "facilities_verified_has_point_chk",
  DROP CONSTRAINT IF EXISTS "facilities_latlng_pair_chk",
  DROP CONSTRAINT IF EXISTS "facilities_lng_range_chk",
  DROP CONSTRAINT IF EXISTS "facilities_lat_range_chk";
ALTER TABLE "facilities" DROP CONSTRAINT IF EXISTS "facilities_location_verified_by_id_fkey";
ALTER TABLE "facilities"
  DROP COLUMN IF EXISTS "location_verified_by_id",
  DROP COLUMN IF EXISTS "location_confidence",
  DROP COLUMN IF EXISTS "location_source_ref",
  DROP COLUMN IF EXISTS "location_source",
  DROP COLUMN IF EXISTS "location_status",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "latitude";
DROP TYPE IF EXISTS "facility_location_status";
