import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { assertCanManageOrg } from '../../src/organizations/org-scope';
import { OrganizationsController } from '../../src/organizations/organizations.controller';
import { OrganizationsService } from '../../src/organizations/organizations.service';
import { ResourcesController } from '../../src/resources/resources.controller';
import { ResourcesService } from '../../src/resources/resources.service';

const OWN_ORG = 'org-own';
const OTHER_ORG = 'org-other';
const ORG_ADMIN = { id: 'user-orgadmin', role: UserRole.ORG_ADMINISTRATOR };
const SYS_ADMIN = { id: 'user-sysadmin', role: UserRole.SYSTEM_ADMINISTRATOR };

function makePrisma() {
  return {
    organization_memberships: {
      // The Org Administrator is an active member of OWN_ORG only.
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.user_id === ORG_ADMIN.id && where.organization_id === OWN_ORG && where.is_active ? { id: 'm-1' } : null,
        ),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'm-2' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    organization: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve({ id: where.id, organization_memberships: [] })),
      update: jest.fn().mockResolvedValue({}),
    },
    resources: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve({ id: where.id, organization_id: where.id === 'unit-own' ? OWN_ORG : OTHER_ORG }),
      ),
      create: jest.fn().mockResolvedValue({ id: 'unit-new' }),
      update: jest.fn().mockResolvedValue({}),
    },
    resource_capability_assignments: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    resourceRequest: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

const audit = { log: jest.fn() };

function rolesOf(controller: { prototype: object }, method: string): string[] {
  return Reflect.getMetadata(ROLES_KEY, (controller.prototype as any)[method]) ?? [];
}

describe('Org Administrator access (Phase 6)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let orgs: OrganizationsService;
  let resources: ResourcesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    orgs = new OrganizationsService(prisma as any);
    resources = new ResourcesService(prisma as any, audit as any);
  });

  describe('read endpoints admit the Org Administrator', () => {
    it.each<[string, { prototype: object }, string]>([
      ['GET /resources', ResourcesController, 'findAll'],
      ['GET /resources/:id', ResourcesController, 'findById'],
      ['GET /organizations', OrganizationsController, 'findAll'],
      ['GET /organizations/:id', OrganizationsController, 'findById'],
    ])('%s', (_route, controller, method) => {
      const roles = rolesOf(controller, method);
      expect(roles).toContain(UserRole.ORG_ADMINISTRATOR);
      // Additive: the existing roles stay.
      expect(roles).toEqual(expect.arrayContaining([UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR]));
    });
  });

  describe('assertCanManageOrg', () => {
    it('allows a member of the organization', async () => {
      await expect(assertCanManageOrg(prisma as any, ORG_ADMIN, OWN_ORG)).resolves.toBeUndefined();
    });

    it('refuses another organization', async () => {
      await expect(assertCanManageOrg(prisma as any, ORG_ADMIN, OTHER_ORG)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the System Administrator manage any organization without a membership', async () => {
      await expect(assertCanManageOrg(prisma as any, SYS_ADMIN, OTHER_ORG)).resolves.toBeUndefined();
      expect(prisma.organization_memberships.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('organization writes are own-org on the server', () => {
    it('updates its own organization', async () => {
      await orgs.update(OWN_ORG, { name: 'MDRRMO' }, ORG_ADMIN);
      expect(prisma.organization.update).toHaveBeenCalled();
    });

    it.each([
      ['update', () => orgs.update(OTHER_ORG, { name: 'x' }, ORG_ADMIN)],
      ['list members', () => orgs.findMembers(OTHER_ORG, ORG_ADMIN)],
      ['add a member', () => orgs.addMember(OTHER_ORG, { userId: 'u' } as any, ORG_ADMIN)],
      ['remove a member', () => orgs.removeMember(OTHER_ORG, 'u', ORG_ADMIN)],
    ])('refuses to %s in another organization', async (_label, call) => {
      await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(prisma.organization_memberships.create).not.toHaveBeenCalled();
      expect(prisma.organization_memberships.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('unit writes are own-org on the server', () => {
    it('edits its own unit', async () => {
      await resources.update('unit-own', { name: 'Rescue 1' }, ORG_ADMIN);
      expect(prisma.resources.update).toHaveBeenCalled();
    });

    it("refuses to edit another organization's unit", async () => {
      await expect(resources.update('unit-other', { name: 'x' }, ORG_ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.resources.update).not.toHaveBeenCalled();
    });

    it('refuses to register a unit under another organization', async () => {
      await expect(
        resources.create({ organizationId: OTHER_ORG, name: 'x', resourceType: 'AMBULANCE' } as any, ORG_ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.resources.create).not.toHaveBeenCalled();
    });

    it("refuses to change another organization's unit capabilities", async () => {
      await expect(resources.addCapability('unit-other', 'cap-1', ORG_ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(resources.removeCapability('unit-other', 'cap-1', ORG_ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.resource_capability_assignments.create).not.toHaveBeenCalled();
      expect(prisma.resource_capability_assignments.deleteMany).not.toHaveBeenCalled();
    });

    it('lets the System Administrator edit any unit', async () => {
      await resources.update('unit-other', { name: 'x' }, SYS_ADMIN);
      expect(prisma.resources.update).toHaveBeenCalled();
    });
  });

  describe('mutual-aid responses', () => {
    const pendingRequest = { id: 'req-1', incident_id: 'inc-1', requesting_org_id: OTHER_ORG, status: 'PENDING' };

    it('accepts a pending request once, guarded on PENDING, with this organization as provider', async () => {
      prisma.resourceRequest.findUnique.mockResolvedValue(pendingRequest);
      prisma.resourceRequest.updateMany.mockResolvedValue({ count: 1 });

      await resources.respondToRequest('req-1', true, undefined, ORG_ADMIN.id, OWN_ORG);

      expect(prisma.resourceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'ACCEPTED', providing_org_id: OWN_ORG }),
      });
    });

    it('refuses a request that was already answered', async () => {
      prisma.resourceRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'ACCEPTED' });
      prisma.resourceRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(resources.respondToRequest('req-1', true, undefined, ORG_ADMIN.id, OWN_ORG)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses to fulfil its own request', async () => {
      prisma.resourceRequest.findUnique.mockResolvedValue({ ...pendingRequest, requesting_org_id: OWN_ORG });

      await expect(resources.respondToRequest('req-1', true, undefined, ORG_ADMIN.id, OWN_ORG)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.resourceRequest.updateMany).not.toHaveBeenCalled();
    });

    describe('answering needs an organization (Phase 3)', () => {
      let controller: ResourcesController;
      const req = (user: { id: string }) => ({ user });

      beforeEach(() => {
        controller = new ResourcesController(resources);
        prisma.resourceRequest.findUnique.mockResolvedValue(pendingRequest);
        prisma.resourceRequest.updateMany.mockResolvedValue({ count: 1 });
      });

      it.each([
        ['approve', (c: ResourcesController) => c.approveRequest('req-1', {}, req(SYS_ADMIN))],
        ['deny', (c: ResourcesController) => c.denyRequest('req-1', {}, req(SYS_ADMIN))],
        ['legacy accept', (c: ResourcesController) => c.respondToRequestLegacy('req-1', { accept: true }, req(SYS_ADMIN))],
        ['legacy reject', (c: ResourcesController) => c.respondToRequestLegacy('req-1', { accept: false }, req(SYS_ADMIN))],
      ])('refuses a System Administrator without membership on %s with 403', async (_label, call) => {
        prisma.organization_memberships.findFirst.mockResolvedValueOnce(null);

        const err = await call(controller).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).message).toBe("Only an organization's administrator can provide units");
        expect(prisma.resourceRequest.updateMany).not.toHaveBeenCalled();
        expect(audit.log).not.toHaveBeenCalled();
      });

      it("approves as the Org Administrator's own organization", async () => {
        prisma.organization_memberships.findFirst.mockResolvedValueOnce({ organization_id: OWN_ORG });

        await controller.approveRequest('req-1', {}, req(ORG_ADMIN));

        expect(prisma.resourceRequest.updateMany).toHaveBeenCalledWith({
          where: { id: 'req-1', status: 'PENDING' },
          data: expect.objectContaining({ status: 'ACCEPTED', providing_org_id: OWN_ORG }),
        });
      });

      it('a denial sets no provider', async () => {
        prisma.organization_memberships.findFirst.mockResolvedValueOnce({ organization_id: OWN_ORG });

        await controller.denyRequest('req-1', {}, req(ORG_ADMIN));

        const { data } = prisma.resourceRequest.updateMany.mock.calls[0][0];
        expect(data.status).toBe('REJECTED');
        expect(data).not.toHaveProperty('providing_org_id');
      });
    });
  });
});
