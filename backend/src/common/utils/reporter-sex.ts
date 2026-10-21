/**
 * Reporter sex as exposed to staff and assigned crew, used only to pick the
 * reporter's map icon (MOD-01 / MOD-22). Never patient data, never in SMS or logs.
 *
 * PREFER_NOT_TO_SAY and unknown values map to null so the declined answer never
 * leaves the server; guests (no account) are always null.
 */
export type ReporterSex = 'MALE' | 'FEMALE' | null;

export function toReporterSex(sex: string | null | undefined): ReporterSex {
  return sex === 'MALE' || sex === 'FEMALE' ? sex : null;
}

export function reporterSexFrom(
  reporter: { is_guest?: boolean | null; users?: { sex?: string | null } | null } | null | undefined,
): ReporterSex {
  if (!reporter || reporter.is_guest) return null;
  return toReporterSex(reporter.users?.sex);
}

/** Include fragment that loads only what {@link reporterSexFrom} needs. */
export const REPORTER_SEX_INCLUDE = {
  select: { is_guest: true, users: { select: { sex: true } } },
} as const;
