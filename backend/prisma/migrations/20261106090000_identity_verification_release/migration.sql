-- MOD-01 / MOD-46 / MOD-48: a claim on a PhilHealth ID can end
-- (docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md §5.2a, §7): the citizen withdrew consent, the
-- account never confirmed its phone, or MDRRMO staff released the card. A RELEASED row has lost
-- its name and PIN data, and uq_identity_verifications_pin_active no longer counts it.
ALTER TYPE "identity_verification_status" ADD VALUE 'RELEASED';

ALTER TYPE "audit_action" ADD VALUE 'ID_CARD_LOOKUP';
ALTER TYPE "audit_action" ADD VALUE 'IDENTITY_VERIFICATION_RELEASED';
