-- MOD-51 (2026-11-15): a risk area can be a pin with a radius (the Supervisor drops a pin
-- on the map). area_boundary stays the shape every query uses; for a pin area it is the
-- circle ST_Buffer(pin, radius). The pin and radius are kept so the area can be edited.

ALTER TABLE "risk_areas"
  ADD COLUMN "pin_latitude"  DECIMAL(10,7),
  ADD COLUMN "pin_longitude" DECIMAL(10,7),
  ADD COLUMN "radius_meters" INTEGER;

-- All three or none, and a sensible radius (50 m to 2 km).
ALTER TABLE "risk_areas" ADD CONSTRAINT "risk_areas_pin_check" CHECK (
  ("pin_latitude" IS NULL AND "pin_longitude" IS NULL AND "radius_meters" IS NULL)
  OR ("pin_latitude" IS NOT NULL AND "pin_longitude" IS NOT NULL
      AND "radius_meters" BETWEEN 50 AND 2000)
);
