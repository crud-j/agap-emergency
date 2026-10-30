-- Manual rollback. Take `pg_dump -t transport_records` first.

ALTER TABLE "transport_records" DROP CONSTRAINT IF EXISTS "transport_records_reporter_patient_confirmed_pair_chk";
ALTER TABLE "transport_records" DROP CONSTRAINT IF EXISTS "transport_records_reporter_patient_confirmed_by_id_fkey";
ALTER TABLE "transport_records"
  DROP COLUMN IF EXISTS "reporter_patient_confirmed_by_id",
  DROP COLUMN IF EXISTS "reporter_patient_confirmed_at";
