-- AlterTable
ALTER TABLE "users" ADD COLUMN     "high_contrast" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduced_motion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "text_size" VARCHAR(10) NOT NULL DEFAULT 'medium';
