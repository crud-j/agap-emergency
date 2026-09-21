/** Matches the PostgreSQL user_role enum exactly. */
export enum UserRole {
  CITIZEN                  = 'CITIZEN',
  BYSTANDER                = 'BYSTANDER',
  DISPATCHER               = 'DISPATCHER',
  SUPERVISOR               = 'SUPERVISOR',
  RESPONDER                = 'RESPONDER',
  HOSPITAL_USER            = 'HOSPITAL_USER',
  ORG_ADMINISTRATOR        = 'ORG_ADMINISTRATOR',
  ANNOUNCEMENTS_PUBLISHER  = 'ANNOUNCEMENTS_PUBLISHER',
  SYSTEM_ADMINISTRATOR     = 'SYSTEM_ADMINISTRATOR',
}
