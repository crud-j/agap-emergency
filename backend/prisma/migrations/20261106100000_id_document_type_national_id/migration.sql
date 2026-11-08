-- MOD-01 / MOD-48: a citizen can scan a Philippine National ID instead of a PhilHealth ID
-- (docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md §5.1). pin_hmac and pin_last4 now hold either
-- card's number. A 12-digit PIN and a 16-digit PhilSys Card Number can't produce the same input,
-- so uq_identity_verifications_pin_active needs no change. The PhilSys Number is never stored.
ALTER TYPE "id_document_type" ADD VALUE 'NATIONAL_ID';
