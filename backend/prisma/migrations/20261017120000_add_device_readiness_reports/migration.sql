-- MOD-05: Emergency Readiness and Permission Status. Additive only.

-- CreateEnum
CREATE TYPE "readiness_permission_state" AS ENUM ('GRANTED', 'DENIED', 'UNDETERMINED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "readiness_connectivity" AS ENUM ('ONLINE', 'LIMITED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "readiness_status" AS ENUM ('READY', 'LIMITED', 'NOT_READY');

-- CreateTable
CREATE TABLE "device_readiness_reports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "device_id" VARCHAR(64) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "app_version" VARCHAR(32),
    "location_permission" "readiness_permission_state" NOT NULL,
    "location_services_enabled" BOOLEAN NOT NULL,
    "notification_permission" "readiness_permission_state" NOT NULL,
    "camera_permission" "readiness_permission_state" NOT NULL,
    "motion_sensor_available" BOOLEAN NOT NULL,
    "connectivity" "readiness_connectivity" NOT NULL,
    "connection_type" VARCHAR(20),
    "overall_status" "readiness_status" NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_readiness_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_device_readiness_user_device" ON "device_readiness_reports"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "idx_device_readiness_user_updated" ON "device_readiness_reports"("user_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "device_readiness_reports" ADD CONSTRAINT "device_readiness_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
