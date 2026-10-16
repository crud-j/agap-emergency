-- MOD-53: structured Mayor's Office announcement format
-- (docs/automation/bocaue_mayor_announcement_format.md). Additive only.

-- CreateEnum
CREATE TYPE "announcement_language" AS ENUM ('FIL', 'EN', 'FIL_EN');

-- AlterEnum
ALTER TYPE "announcement_category" ADD VALUE 'WEATHER_ADVISORY';
ALTER TYPE "announcement_category" ADD VALUE 'PUBLIC_ADVISORY';
ALTER TYPE "announcement_category" ADD VALUE 'MUNICIPAL_SERVICE';

-- AlterEnum
ALTER TYPE "announcement_status" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "action_required" TEXT,
ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by_id" UUID,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "contact_info" VARCHAR(300),
ADD COLUMN     "correction_note" TEXT,
ADD COLUMN     "effective_end_at" TIMESTAMPTZ(6),
ADD COLUMN     "effective_start_at" TIMESTAMPTZ(6),
ADD COLUMN     "image_alt_text" VARCHAR(300),
ADD COLUMN     "issuing_office" VARCHAR(200),
ADD COLUMN     "language" "announcement_language" NOT NULL DEFAULT 'FIL',
ADD COLUMN     "source_reference" VARCHAR(500),
ADD COLUMN     "summary" VARCHAR(400),
ADD COLUMN     "template_data" JSONB,
ADD COLUMN     "template_key" VARCHAR(50);

-- CreateIndex
CREATE INDEX "idx_announcements_status_scheduled" ON "announcements"("status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
