-- Rule 14 abuse watch (2026-11-25): guest reports appear in Security Events with the
-- client IP, so one person reporting the same place from several phones is visible.
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'GUEST_REPORT';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'GUEST_REPORT_REPEAT';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'GUEST_REPORT_BLOCKED';
