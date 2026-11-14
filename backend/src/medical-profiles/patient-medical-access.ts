import type { PrismaClient } from '@prisma/client';
import { ACTIVE_INCIDENT_STATUSES } from '@agap/shared';

/** consent_records.consent_type the citizen grants before saving a medical profile (MOD-03/48). */
export const MEDICAL_CONSENT_TYPE = 'MEDICAL_PROFILE';

type Db = Pick<PrismaClient, 'incidentReporter'>;

/**
 * MOD-03 / MOD-48 — the one rule for when an incident's crew may see a medical
 * profile. Reporter and patient are separate people (rule 2), so a profile is
 * shared only when the reporter said *they themselves* need help:
 *  - a registered reporter (never a guest), who
 *  - marked "Also needs help" on the report (incident_patients.is_reporter), and
 *  - has granted medical-data consent and saved a profile,
 *  - while the incident is still active ("responders see it only during an emergency").
 * Nobody else's profile is ever matched to a patient, and a bystander's own profile is
 * never shown for the person they reported (rules 2 and 15).
 *
 * Returns the profile's owner and id, or null. Reads no medical field.
 */
export async function findSharedReporterProfile(
  prisma: Db,
  incidentId: string,
): Promise<{ userId: string; profileId: string } | null> {
  const reporter = await prisma.incidentReporter.findFirst({
    where: {
      incident_id: incidentId,
      is_guest: false,
      user_id: { not: null },
      incidents: {
        status: { in: ACTIVE_INCIDENT_STATUSES as any[] },
        incident_patients: { some: { is_reporter: true } },
      },
      users: {
        medical_profiles: { isNot: null },
        consent_records: { some: { consent_type: MEDICAL_CONSENT_TYPE, status: 'GRANTED' } },
      },
    },
    select: { user_id: true, users: { select: { medical_profiles: { select: { id: true } } } } },
  });
  const profileId = reporter?.users?.medical_profiles?.id;
  return reporter?.user_id && profileId ? { userId: reporter.user_id, profileId } : null;
}
