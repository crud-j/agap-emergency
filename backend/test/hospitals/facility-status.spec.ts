import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { AuditAction, UserRole } from '@agap/shared';
import { FacilitiesService } from '../../src/facilities/facilities.service';
import { FacilitiesController } from '../../src/facilities/facilities.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * AUTOMATION_NEEDS_PLAN Phase 4, C8 (MOD-38/39): a receiving status report. Hospital users
 * report for their own organization's facilities (CLAUDE.md: Hospital User updates
 * receiving status); the report stamps receiving_status_updated_at and is audited.
 */

const HOSPITAL_USER = { id: 'hu-1', role: UserRole.HOSPITAL_USER };
const DISPATCHER = { id: 'd-1', role: UserRole.DISPATCHER };

function build(opts: { orgId?: string | null; memberOf?: string[] } = {}) {
  const existing = {
    id: 'fac-1',
    organization_id: opts.orgId === undefined ? 'org-1' : opts.orgId,
    receiving_status: 'OPEN',
    capacity_available: 4,
    facility_capabilities: [],
  };
  const prisma: any = {
    facility: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn(async ({ data }: any) => ({ ...existing, ...data })),
    },
    organization_memberships: {
      findMany: jest.fn().mockResolvedValue((opts.memberOf ?? ['org-1']).map((organization_id) => ({ organization_id }))),
    },
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new FacilitiesService(prisma, audit), prisma, audit };
}

const data = (b: ReturnType<typeof build>) => b.prisma.facility.update.mock.calls[0][0].data;

describe('FacilitiesService.updateStatus', () => {
  it("a hospital user reports their own facility's status: stamped and audited with old and new values", async () => {
    const b = build();
    await b.service.updateStatus('fac-1', { receivingStatus: 'AT_CAPACITY', capacityAvailable: 0 }, HOSPITAL_USER);

    expect(data(b)).toMatchObject({ receiving_status: 'AT_CAPACITY', capacity_available: 0 });
    expect(data(b).receiving_status_updated_at).toBeInstanceOf(Date);
    expect(b.prisma.organization_memberships.findMany).toHaveBeenCalledWith({
      where: { user_id: 'hu-1', is_active: true },
      select: { organization_id: true },
    });
    expect(b.audit.log).toHaveBeenCalledWith({
      action: AuditAction.UPDATE,
      actorId: 'hu-1',
      actorRole: UserRole.HOSPITAL_USER,
      entityType: 'facility',
      entityId: 'fac-1',
      moduleId: 'MOD-39',
      oldValues: { receiving_status: 'OPEN', capacity_available: 4 },
      newValues: { receiving_status: 'AT_CAPACITY', capacity_available: 0 },
    });
  });

  it('confirming the same status still stamps it (that is what the freshness reminder asks for)', async () => {
    const b = build();
    await b.service.updateStatus('fac-1', { receivingStatus: 'OPEN' }, HOSPITAL_USER);
    expect(data(b).receiving_status_updated_at).toBeInstanceOf(Date);
  });

  it('a beds-only report does not stamp the receiving status', async () => {
    const b = build();
    await b.service.updateStatus('fac-1', { capacityAvailable: 3 }, HOSPITAL_USER);
    expect(data(b)).not.toHaveProperty('receiving_status');
    expect(data(b)).not.toHaveProperty('receiving_status_updated_at');
  });

  it.each([
    ["another organization's facility", { memberOf: ['org-2'] }],
    ['a facility with no organization', { orgId: null }],
  ])('a hospital user is refused for %s, and nothing is written', async (_label, opts) => {
    const b = build(opts);
    await expect(b.service.updateStatus('fac-1', { receivingStatus: 'CLOSED' }, HOSPITAL_USER))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(b.prisma.facility.update).not.toHaveBeenCalled();
    expect(b.audit.log).not.toHaveBeenCalled();
  });

  it('dispatchers report for any facility (no membership check)', async () => {
    const b = build({ orgId: null });
    await b.service.updateStatus('fac-1', { receivingStatus: 'CLOSED' }, DISPATCHER);
    expect(b.prisma.organization_memberships.findMany).not.toHaveBeenCalled();
    expect(data(b).receiving_status).toBe('CLOSED');
  });

  it('PATCH /facilities/:id/status is open to Dispatcher, Supervisor and Hospital User', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FacilitiesController.prototype.updateStatus)).toEqual([
      UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.HOSPITAL_USER,
    ]);
  });
});
