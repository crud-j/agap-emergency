ALTER TABLE "dispatches"
  ADD COLUMN "en_route_at" TIMESTAMPTZ(6),
  ADD COLUMN "on_scene_at" TIMESTAMPTZ(6),
  ADD COLUMN "field_done_at" TIMESTAMPTZ(6);
