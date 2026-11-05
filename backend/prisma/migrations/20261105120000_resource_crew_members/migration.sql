-- MOD-27/31: a responder's home unit. The dispatch console pre-fills a unit's crew
-- from here when it pre-selects the unit; the dispatcher can still change the crew.
-- One home unit per responder (unique user_id); a unit can have several crew members.
CREATE TABLE "resource_crew_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "resource_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_crew_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resource_crew_members_user_id_key" ON "resource_crew_members"("user_id");

CREATE INDEX "idx_resource_crew_members_resource" ON "resource_crew_members"("resource_id");

ALTER TABLE "resource_crew_members" ADD CONSTRAINT "resource_crew_members_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "resource_crew_members" ADD CONSTRAINT "resource_crew_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
