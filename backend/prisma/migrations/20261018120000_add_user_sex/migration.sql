-- MOD-01: optional self-declared reporter sex for the reporter's map icon. Additive only.
-- Nullable with no default: existing users stay null ("never asked") and keep the neutral pin.

-- CreateEnum
CREATE TYPE "user_sex" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "sex" "user_sex";

COMMENT ON COLUMN "users"."sex" IS 'Optional, self-declared. Personal data — used only for reporter map icon. Not patient data.';
