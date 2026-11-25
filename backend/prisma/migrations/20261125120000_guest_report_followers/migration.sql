-- MOD-42 / Rule 14 (2026-11-25): a guest (no account) can follow their own report.
-- The app keeps a random token; only its SHA-256 is stored here. The optional FCM
-- device token lets the server push status changes (received, help on the way,
-- merged, closed...). Rows expire (7 days, or 24 h after the report ends) and are
-- deleted daily, which also removes the device token.

CREATE TABLE "guest_report_followers" (
  "id"          UUID           NOT NULL DEFAULT uuid_generate_v4(),
  "incident_id" UUID           NOT NULL,
  "token_hash"  CHAR(64)       NOT NULL,
  "push_token"  VARCHAR(512),
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at"  TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "guest_report_followers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guest_report_followers_incident_id_fkey" FOREIGN KEY ("incident_id")
    REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "guest_report_followers_token_hash_key" ON "guest_report_followers" ("token_hash");
CREATE INDEX "idx_guest_report_followers_incident" ON "guest_report_followers" ("incident_id");
CREATE INDEX "idx_guest_report_followers_expires" ON "guest_report_followers" ("expires_at");
