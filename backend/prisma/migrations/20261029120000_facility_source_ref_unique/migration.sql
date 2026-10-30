-- MOD-39: one facility per provider reference. The index from 20261025120000 keyed on
-- (location_source, location_source_ref), so the seeded 'manual+osm-crosscheck' row and a
-- later 'nominatim' pick of the same OSM object could both be saved: two facilities for
-- one real hospital. The ref alone identifies the place, whatever the source label.
-- Hand-written because partial indexes are not expressible in Prisma (schema.prisma unchanged).

DROP INDEX IF EXISTS "uq_facilities_location_source_ref";
CREATE UNIQUE INDEX "uq_facilities_location_source_ref"
  ON "facilities" ("location_source_ref") WHERE "location_source_ref" IS NOT NULL;
