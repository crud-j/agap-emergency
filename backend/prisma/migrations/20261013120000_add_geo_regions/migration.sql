-- CreateTable: geo_regions
-- PostGIS geometry(Polygon, 4326) column requires manual SQL — Prisma Unsupported type.
-- PostGIS extension is already created in the init migration.

CREATE TABLE "geo_regions" (
    "id"              TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "region_type"     TEXT NOT NULL,
    "boundary"        geometry(Polygon, 4326) NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL,
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "geo_regions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: GIST spatial index for point-in-polygon queries
CREATE INDEX "idx_geo_regions_boundary_gist" ON "geo_regions" USING GIST ("boundary");

-- CreateIndex: lookup by name + type
CREATE INDEX "idx_geo_regions_name_type" ON "geo_regions" ("name", "region_type");

-- Seed: Bocaue, Bulacan municipal boundary (simplified polygon)
-- Replace with the verified GeoJSON ring from PhilGIS / OSM relation 2689505
-- before deploying to production.
-- Coordinates: [longitude, latitude] pairs (WGS-84 / EPSG:4326)
-- Approximate bounding polygon for Bocaue municipality:
--   SW: 120.886, 14.770   SE: 120.977, 14.770
--   NE: 120.977, 14.840   NW: 120.886, 14.840
INSERT INTO "geo_regions" ("id", "name", "region_type", "boundary", "last_updated_at")
VALUES (
    'bocaue-municipality',
    'Bocaue',
    'municipality',
    ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [120.886, 14.770],
            [120.977, 14.770],
            [120.977, 14.840],
            [120.886, 14.840],
            [120.886, 14.770]
        ]]
    }'),
    NOW()
);
