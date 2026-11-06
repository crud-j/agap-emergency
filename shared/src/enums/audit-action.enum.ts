/** Matches the PostgreSQL audit_action enum exactly. */
export enum AuditAction {
  CREATE           = 'CREATE',
  READ             = 'READ',
  UPDATE           = 'UPDATE',
  DELETE           = 'DELETE',
  LOGIN            = 'LOGIN',
  LOGOUT           = 'LOGOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  STATUS_CHANGE    = 'STATUS_CHANGE',
  DISPATCH         = 'DISPATCH',
  ESCALATE         = 'ESCALATE',
  PUBLISH          = 'PUBLISH',
  SUBSCRIBE        = 'SUBSCRIBE',
  UNSUBSCRIBE      = 'UNSUBSCRIBE',
  CONSENT_GRANT    = 'CONSENT_GRANT',
  CONSENT_WITHDRAW = 'CONSENT_WITHDRAW',
  DATA_EXPORT      = 'DATA_EXPORT',
  SYSTEM           = 'SYSTEM',
  LOGIN_FAILED     = 'LOGIN_FAILED',
  ACCOUNT_LOCKED   = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  PASSWORD_CHANGE  = 'PASSWORD_CHANGE',
  MFA_CHANGE       = 'MFA_CHANGE',
  SESSION_REVOKED  = 'SESSION_REVOKED',
  /** MOD-01: a PhilHealth ID scan was claimed by a registration. Details: outcome only. */
  IDENTITY_VERIFICATION_CLAIMED = 'IDENTITY_VERIFICATION_CLAIMED',
  /** MOD-01/48: staff opened a stored PhilHealth ID image. Details: none (actor + verification id). */
  ID_IMAGE_VIEWED = 'ID_IMAGE_VIEWED',
  /** MOD-01: staff approved a PhilHealth ID under review. */
  IDENTITY_VERIFICATION_APPROVED = 'IDENTITY_VERIFICATION_APPROVED',
  /** MOD-01: staff rejected a PhilHealth ID under review. Details: the reason code only. */
  IDENTITY_VERIFICATION_REJECTED = 'IDENTITY_VERIFICATION_REJECTED',
  /** MOD-48: staff looked up which account holds a PhilHealth ID. Details: found or not, never the number. */
  ID_CARD_LOOKUP = 'ID_CARD_LOOKUP',
  /** MOD-48: a claim on a PhilHealth ID ended and its card data was erased. Details: the reason code only. */
  IDENTITY_VERIFICATION_RELEASED = 'IDENTITY_VERIFICATION_RELEASED',
}
