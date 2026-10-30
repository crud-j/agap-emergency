-- MOD-40 / C17: the crew on a transport (or a dispatcher/supervisor) confirms that the
-- person being carried is the registered reporter. This is the only thing that may show
-- that reporter the destination (Prompt 09); the reporter's own claim never does.
-- Hand-written because the CHECK constraint is not expressible in Prisma.

-- Columns
ALTER TABLE "transport_records"
  ADD COLUMN "reporter_patient_confirmed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reporter_patient_confirmed_by_id" UUID;

-- FK
ALTER TABLE "transport_records" ADD CONSTRAINT "transport_records_reporter_patient_confirmed_by_id_fkey"
  FOREIGN KEY ("reporter_patient_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- CHECK (Prisma cannot express this): set together, cleared together
ALTER TABLE "transport_records"
  ADD CONSTRAINT "transport_records_reporter_patient_confirmed_pair_chk"
  CHECK (("reporter_patient_confirmed_at" IS NULL) = ("reporter_patient_confirmed_by_id" IS NULL));
