-- MOD-17 / MOD-34: barangay one-tap status link (BARANGAY_ALERT_AUTOMATION_PLAN.md).
--
-- The alert SMS carries a short signed link. The barangay opens it on their phone and
-- taps what is happening: SEEN → ACTING (ON_THE_WAY) → ON_SCENE → COMPLETED (HANDLED),
-- or NEEDS_BACKUP. Two states did not exist yet, and the report now has a third source.
-- Information only: none of this changes the incident lifecycle.

ALTER TYPE "barangay_report_type" ADD VALUE IF NOT EXISTS 'SEEN';
ALTER TYPE "barangay_report_type" ADD VALUE IF NOT EXISTS 'ON_SCENE';
ALTER TYPE "barangay_report_source" ADD VALUE IF NOT EXISTS 'LINK';
