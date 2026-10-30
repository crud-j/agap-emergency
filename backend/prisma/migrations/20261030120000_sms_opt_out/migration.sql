-- MOD-53 (AUTOMATION_NEEDS_PLAN Phase 1, C3): an announcement subscriber's "STOP" reply to
-- the Textbee phone is processed as an opt-out and stored with this outcome. Only the
-- ADD VALUE here: PostgreSQL refuses to use a new enum value in the transaction that adds it.

ALTER TYPE "barangay_inbound_outcome" ADD VALUE IF NOT EXISTS 'OPT_OUT';
