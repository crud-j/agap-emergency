/**
 * Who submitted the emergency report.
 * Reporter and patient are separate concepts in AGAP.
 */
export enum ReporterType {
  REGISTERED_CITIZEN = 'REGISTERED_CITIZEN',
  GUEST_REPORTER = 'GUEST_REPORTER',
  BYSTANDER = 'BYSTANDER',
  SYSTEM = 'SYSTEM',
}
