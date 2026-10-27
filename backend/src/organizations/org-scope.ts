import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/** The signed-in user as JwtStrategy.validate() returns it (only what the check needs). */
export interface OrgActor {
  id: string;
  role: string;
}

/**
 * Server-side own-organization check for registry writes (MOD-27/34, role dashboards
 * plan Phase 6). The System Administrator manages every organization; anyone else
 * must hold an active membership in `orgId`. Before this, the Org Administrator's
 * "own org only" rule existed only in the web UI.
 */
export async function assertCanManageOrg(prisma: PrismaService, actor: OrgActor, orgId: string): Promise<void> {
  if (actor.role === UserRole.SYSTEM_ADMINISTRATOR) return;
  const membership = await prisma.organization_memberships.findFirst({
    where: { user_id: actor.id, organization_id: orgId, is_active: true },
    select: { id: true },
  });
  if (!membership) throw new ForbiddenException('You can only manage your own organization');
}

/** Organizations the user is an active member of; scopes hospital users to their own facilities. */
export async function activeMemberOrgIds(prisma: PrismaService, userId: string): Promise<string[]> {
  const rows = await prisma.organization_memberships.findMany({
    where: { user_id: userId, is_active: true },
    select: { organization_id: true },
  });
  return rows.map((row) => row.organization_id);
}
