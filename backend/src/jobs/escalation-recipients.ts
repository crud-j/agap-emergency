import { PrismaService } from '../common/prisma/prisma.service';
import { BLOCKED_ACCOUNT_STATUSES } from '../auth/account-status';

export interface EscalationRecipient {
  id: string;
  full_name: string | null;
}

/** Who is told when nobody with the primary roles can be reached (decision D5). */
export const ESCALATION_FALLBACK_ROLES = ['DISPATCHER'];

/**
 * Staff to notify about an escalation: everyone with `roles` who can sign in.
 *
 * "Can sign in" matches the login rule (account-status.ts), not `status = ACTIVE`:
 * seeded and admin-created staff stay PENDING_VERIFICATION, so an ACTIVE-only
 * filter silently notified nobody. If no one with `roles` qualifies, Dispatchers
 * are notified instead, so an SLA breach always reaches someone on duty.
 */
export async function findEscalationRecipients(
  prisma: PrismaService,
  roles: string[],
): Promise<EscalationRecipient[]> {
  const eligible = (r: string[]) =>
    prisma.user.findMany({
      where: { role: { in: r as any[] }, status: { notIn: [...BLOCKED_ACCOUNT_STATUSES] as any[] } },
      select: { id: true, full_name: true },
    });

  const primary = await eligible(roles);
  if (primary.length > 0 || roles.every((r) => ESCALATION_FALLBACK_ROLES.includes(r))) return primary;
  return eligible(ESCALATION_FALLBACK_ROLES);
}
