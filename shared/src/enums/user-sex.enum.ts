/**
 * Optional, self-declared sex of a registered user (MOD-01).
 * Used only to pick the REPORTER's map icon — never patient data.
 * null on the user means "never asked"; PREFER_NOT_TO_SAY means "asked and declined".
 */
export enum UserSex {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}
