-- DropForeignKey
ALTER TABLE "incidents" DROP CONSTRAINT "fk_incident_duplicate_of";

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "image_storage_key" VARCHAR(500),
ADD COLUMN     "image_url" VARCHAR(1000);

-- AlterTable
ALTER TABLE "responder_availability" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incident_duplicate_of" FOREIGN KEY ("duplicate_of_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
