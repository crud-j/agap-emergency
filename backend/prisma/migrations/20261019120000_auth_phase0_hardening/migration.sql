-- Auth Phase 0 hardening (docs/plans/WEB_AUTH_SECURITY_PLAN.md §5.1). Additive only.

-- AlterEnum: password-reset codes get their own type so registration / login
-- OTPs can never be used to reset a password.
ALTER TYPE "verification_type" ADD VALUE 'PASSWORD_RESET';
ALTER TYPE "verification_type" ADD VALUE 'MFA_SMS';

-- AlterEnum: auth events for the immutable audit trail (MOD-46).
ALTER TYPE "audit_action" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "audit_action" ADD VALUE 'ACCOUNT_LOCKED';
ALTER TYPE "audit_action" ADD VALUE 'ACCOUNT_UNLOCKED';
ALTER TYPE "audit_action" ADD VALUE 'PASSWORD_CHANGE';
ALTER TYPE "audit_action" ADD VALUE 'MFA_CHANGE';
ALTER TYPE "audit_action" ADD VALUE 'SESSION_REVOKED';

-- AlterTable: per-code guess counter (max 5, then the code is expired).
ALTER TABLE "user_verifications" ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 0;
