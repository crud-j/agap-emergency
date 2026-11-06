-- MOD-01 / MOD-46 / MOD-48: staff review of PhilHealth IDs (docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §7).
-- Every view of a stored ID image and every review decision is audited.
ALTER TYPE "audit_action" ADD VALUE 'ID_IMAGE_VIEWED';
ALTER TYPE "audit_action" ADD VALUE 'IDENTITY_VERIFICATION_APPROVED';
ALTER TYPE "audit_action" ADD VALUE 'IDENTITY_VERIFICATION_REJECTED';
