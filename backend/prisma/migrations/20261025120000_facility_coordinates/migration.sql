-- MOD-39: facility coordinates and verification status for hospital destination routing.
-- Hand-written because PostGIS geography synchronization, CHECK constraints and
-- partial/expression indexes are not fully expressible in Prisma.

-- Enum
CREATE TYPE "facility_location_status" AS ENUM ('UNVERIFIED','PENDING_REVIEW','VERIFIED','REJECTED');

-- Columns
ALTER TABLE "facilities"
  ADD COLUMN "latitude" DECIMAL(10,7),
  ADD COLUMN "longitude" DECIMAL(10,7),
  ADD COLUMN "location_status" "facility_location_status" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "location_source" VARCHAR(50),
  ADD COLUMN "location_source_ref" VARCHAR(100),
  ADD COLUMN "location_confidence" DECIMAL(3,2),
  ADD COLUMN "location_verified_by_id" UUID;

-- FK
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_location_verified_by_id_fkey"
  FOREIGN KEY ("location_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- CHECKs (Prisma cannot express these)
ALTER TABLE "facilities"
  ADD CONSTRAINT "facilities_lat_range_chk" CHECK ("latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "facilities_lng_range_chk" CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "facilities_latlng_pair_chk" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "facilities_verified_has_point_chk" CHECK ("location_status" <> 'VERIFIED' OR "latitude" IS NOT NULL),
  ADD CONSTRAINT "facilities_confidence_range_chk" CHECK ("location_confidence" IS NULL OR "location_confidence" BETWEEN 0 AND 1);

-- Backfill (only matters if Prompt 00 found rows with location set; harmless otherwise)
UPDATE "facilities"
   SET "latitude"  = ST_Y("location"::geometry)::numeric(10,7),
       "longitude" = ST_X("location"::geometry)::numeric(10,7)
 WHERE "location" IS NOT NULL AND "latitude" IS NULL;

-- Keep location derived from the decimals (single source of truth; see Corrections C1)
CREATE OR REPLACE FUNCTION facilities_sync_location() RETURNS trigger AS $$
BEGIN
  IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
    NEW."location" := NULL;
  ELSE
    NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude"::float8, NEW."latitude"::float8), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_facilities_sync_location"
  BEFORE INSERT OR UPDATE OF "latitude", "longitude", "location" ON "facilities"
  FOR EACH ROW EXECUTE FUNCTION facilities_sync_location();

-- Indexes
CREATE INDEX "idx_facilities_location" ON "facilities" USING GIST ("location");
CREATE INDEX "idx_facilities_location_status" ON "facilities" ("location_status");
CREATE UNIQUE INDEX "uq_facilities_location_source_ref"
  ON "facilities" ("location_source", "location_source_ref") WHERE "location_source_ref" IS NOT NULL;
CREATE UNIQUE INDEX "uq_facilities_active_hospital_name"
  ON "facilities" (lower("name"), lower(coalesce("municipality", '')))
  WHERE "facility_type" = 'HOSPITAL' AND "is_active";
