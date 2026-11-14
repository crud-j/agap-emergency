-- MOD-17 / MOD-19: citizen SOS by SMS.
--
-- With no mobile data the app opens the messages app with an `AGAP|<eventId>|…` text
-- to the Textbee phone. The inbound poller turns it into an incident, matched by the
-- same client event id the app uses, so a later HTTPS resend is the same incident.

-- How a report reached AGAP. Every existing incident came through the app.
CREATE TYPE "report_channel" AS ENUM ('APP', 'SMS');
ALTER TABLE "incidents" ADD COLUMN "report_channel" "report_channel" NOT NULL DEFAULT 'APP';

-- What happened to an inbound citizen SOS text.
ALTER TYPE "barangay_inbound_outcome" ADD VALUE 'SOS_CREATED';
ALTER TYPE "barangay_inbound_outcome" ADD VALUE 'SOS_EXISTING';
ALTER TYPE "barangay_inbound_outcome" ADD VALUE 'SOS_STALE';
ALTER TYPE "barangay_inbound_outcome" ADD VALUE 'SOS_INVALID';
ALTER TYPE "barangay_inbound_outcome" ADD VALUE 'SOS_LIMITED';

-- The incident an inbound citizen SOS created or matched.
ALTER TABLE "barangay_sms_inbound" ADD COLUMN "incident_id" UUID;
ALTER TABLE "barangay_sms_inbound"
  ADD CONSTRAINT "barangay_sms_inbound_incident_id_fkey"
  FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
CREATE INDEX "idx_barangay_sms_inbound_incident" ON "barangay_sms_inbound" ("incident_id");
