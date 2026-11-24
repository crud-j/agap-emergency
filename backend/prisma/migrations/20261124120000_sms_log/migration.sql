-- MOD-17 / MOD-49 (2026-11-24): one row per outbound SMS attempt, so the System
-- Administrator can see what the gateway actually did. Before this, only barangay
-- alerts and announcements left a record; OTP codes, ops alerts and contact notices
-- were visible only in the server log.
--
-- Privacy: the message text is never stored (OTP codes), and the recipient is kept as
-- its last 4 digits only. Rows are deleted after SMS_LOG_RETENTION_DAYS (default 90).

CREATE TABLE "sms_log" (
  "id"               UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "kind"             VARCHAR(30)  NOT NULL,
  "job_name"         VARCHAR(60)  NOT NULL,
  "recipient_last4"  VARCHAR(4),
  "status"           VARCHAR(20)  NOT NULL,
  "gateway_status"   SMALLINT,
  "error"            VARCHAR(200),
  "attempt"          SMALLINT     NOT NULL DEFAULT 1,
  "chars"            SMALLINT     NOT NULL,
  "duration_ms"      INTEGER,
  "incident_id"      UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "sms_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_log_status_check" CHECK ("status" IN ('ACCEPTED', 'FAILED', 'NOT_CONFIGURED'))
);

CREATE INDEX "idx_sms_log_created" ON "sms_log" ("created_at" DESC);
CREATE INDEX "idx_sms_log_status_created" ON "sms_log" ("status", "created_at" DESC);
CREATE INDEX "idx_sms_log_kind_created" ON "sms_log" ("kind", "created_at" DESC);
