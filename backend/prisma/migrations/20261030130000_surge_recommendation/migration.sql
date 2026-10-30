-- MOD-52 (AUTOMATION_NEEDS_PLAN Phase 2, C2): surge recommendation. A detector job counts
-- recent incidents against these rules and tells Supervisors when one trips. It never
-- activates surge mode; a Supervisor does. Seed values are MDRRMO-editable defaults.

CREATE TABLE "surge_rules" (
    "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
    "rule_key"       VARCHAR(40) NOT NULL,
    "window_minutes" INTEGER NOT NULL,
    "min_incidents"  INTEGER NOT NULL,
    "category"       "incident_category",
    "barangays"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "is_active"      BOOLEAN NOT NULL DEFAULT true,
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "surge_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "surge_rules_window_check" CHECK ("window_minutes" BETWEEN 5 AND 1440),
    CONSTRAINT "surge_rules_min_check" CHECK ("min_incidents" >= 1)
);

CREATE UNIQUE INDEX "surge_rules_rule_key_key" ON "surge_rules"("rule_key");

-- Barangay names exactly as geo_regions stores them (the names barangay notices use).
INSERT INTO "surge_rules" ("rule_key", "window_minutes", "min_incidents", "category", "barangays") VALUES
  ('VOLUME',        30, 8, NULL,         ARRAY[]::TEXT[]),
  ('FLOOD_CLUSTER', 30, 5, 'FLOOD',      ARRAY['Lolomboy', 'Bunlo', 'Igulot', 'Bambang']),
  ('INDUSTRIAL',    15, 2, 'INDUSTRIAL', ARRAY['Bundukan', 'Biñang 1st'])
ON CONFLICT ("rule_key") DO NOTHING;

-- One row: the latest Bocaue River reading a Supervisor entered. A UUID id so the
-- audit trail (audit_logs.entity_id is UUID) can point at it; `singleton` keeps it one row.
CREATE TABLE "surge_settings" (
    "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
    "singleton"         BOOLEAN NOT NULL DEFAULT true,
    "river_level_m"     DECIMAL(5,2),
    "river_level_at"    TIMESTAMPTZ(6),
    "river_level_by_id" UUID,
    "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "surge_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "surge_settings_singleton_check" CHECK ("singleton")
);

CREATE UNIQUE INDEX "surge_settings_singleton_key" ON "surge_settings"("singleton");

ALTER TABLE "surge_settings" ADD CONSTRAINT "surge_settings_river_level_by_id_fkey"
  FOREIGN KEY ("river_level_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

INSERT INTO "surge_settings" ("singleton") VALUES (true) ON CONFLICT ("singleton") DO NOTHING;
