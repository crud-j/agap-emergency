-- MOD-53: CRITICAL advisories released only after MDRRMO Supervisor approval
-- (ROLE_DASHBOARDS_PLAN.md Phase 7). Behind ANNOUNCEMENT_APPROVAL_REQUIRED.
--
-- Its own migration: PostgreSQL cannot use a new enum value in the transaction that
-- adds it, and the next migration's code paths filter on it.

ALTER TYPE "announcement_status" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL' AFTER 'DRAFT';
