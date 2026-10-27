-- AlterTable
ALTER TABLE "incident_attachments" ADD COLUMN     "ai_review_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "ai_review_label" VARCHAR(20),
ADD COLUMN     "ai_review_reason" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMPTZ(6),
ADD COLUMN     "rejected_by_id" UUID,
ADD COLUMN     "rejection_notes" TEXT;

-- AddForeignKey
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
