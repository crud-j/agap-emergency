-- MOD-01: live-selfie profile photo, changeable once every 5 months.
ALTER TABLE "users"
  ADD COLUMN "profile_photo_location" VARCHAR(512),
  ADD COLUMN "profile_photo_updated_at" TIMESTAMPTZ(6);
