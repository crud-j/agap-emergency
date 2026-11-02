-- Empties every AGAP table so the seed can start from a clean slate, without dropping
-- the database or re-running migrations. Run it, then the seed:
--
--   cd backend
--   pnpm db:reset-data
--   pnpm db:seed
--
-- Kept as they are:
--   _prisma_migrations   migration history (the schema is not touched)
--   geo_regions          barangay boundaries, inserted by migrations; the seed reads them
--   PostGIS tables       spatial_ref_sys and anything else owned by an extension
-- Put back to their migration defaults (the seed does not create them):
--   surge_rules, surge_settings  (MOD-52)
--
-- audit_logs refuses TRUNCATE (MOD-46 trigger). The trigger is switched off only inside
-- this block, which is one statement, so it is back on whether the block succeeds or fails.
-- Dev databases only.

DO $$
DECLARE
  tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO tables
    FROM pg_tables t
   WHERE schemaname = 'public'
     AND tablename NOT IN ('_prisma_migrations', 'geo_regions', 'spatial_ref_sys')
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d
        WHERE d.objid = format('%I.%I', t.schemaname, t.tablename)::regclass
          AND d.deptype = 'e'
     );

  ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_no_truncate";
  EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_no_truncate";

  -- Same rows as migration 20261030130000_surge_recommendation.
  INSERT INTO "surge_rules" ("rule_key", "window_minutes", "min_incidents", "category", "barangays") VALUES
    ('VOLUME',        30, 8, NULL,         ARRAY[]::TEXT[]),
    ('FLOOD_CLUSTER', 30, 5, 'FLOOD',      ARRAY['Lolomboy', 'Bunlo', 'Igulot', 'Bambang']),
    ('INDUSTRIAL',    15, 2, 'INDUSTRIAL', ARRAY['Bundukan', 'Biñang 1st'])
  ON CONFLICT ("rule_key") DO NOTHING;
  INSERT INTO "surge_settings" ("singleton") VALUES (true) ON CONFLICT ("singleton") DO NOTHING;
END $$;
