-- MOD-51 (AUTOMATION_NEEDS_PLAN Phase 2, C7): a nightly job proposes recurring incident
-- clusters as risk areas. A System Administrator approves (creates the risk area) or
-- dismisses each one. The job never creates a risk area itself.

CREATE TYPE "risk_area_proposal_status" AS ENUM ('PENDING', 'APPROVED', 'DISMISSED');

CREATE TABLE "risk_area_proposals" (
    "id"             UUID NOT NULL DEFAULT uuid_generate_v4(),
    "risk_type"      "incident_category" NOT NULL,
    "barangay"       VARCHAR(100),
    "incident_count" INTEGER NOT NULL,
    "area_boundary"  geography,
    "window_days"    INTEGER NOT NULL,
    "status"         "risk_area_proposal_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at"    TIMESTAMPTZ(6),
    "risk_area_id"   UUID,
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "risk_area_proposals_pkey" PRIMARY KEY ("id")
);

-- One PENDING proposal per type and barangay: the nightly run refreshes it instead of
-- adding another. COALESCE so clusters outside every barangay also share one row.
CREATE UNIQUE INDEX "uq_risk_area_proposals_pending"
  ON "risk_area_proposals" ("risk_type", (COALESCE("barangay", '')))
  WHERE "status" = 'PENDING';

CREATE INDEX "idx_risk_area_proposals_status" ON "risk_area_proposals"("status", "created_at" DESC);
CREATE INDEX "idx_risk_area_proposals_boundary" ON "risk_area_proposals" USING GIST ("area_boundary");

ALTER TABLE "risk_area_proposals" ADD CONSTRAINT "risk_area_proposals_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "risk_area_proposals" ADD CONSTRAINT "risk_area_proposals_risk_area_id_fkey"
  FOREIGN KEY ("risk_area_id") REFERENCES "risk_areas"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
