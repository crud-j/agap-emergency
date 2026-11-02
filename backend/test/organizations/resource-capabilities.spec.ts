import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '@agap/shared';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { ResourcesController } from '../../src/resources/resources.controller';
import { ResourcesService } from '../../src/resources/resources.service';
import { AddCapabilityDto } from '../../src/resources/dto/add-capability.dto';
import { VerifyCapabilityDto } from '../../src/resources/dto/verify-capability.dto';

// MOD-29 [new MOD-28]: an organization claims a capability for its own unit,
// a Supervisor or System Administrator verifies it, and every change is audited.

const OWN_ORG = 'org-own';
const CAP_ID = '6f1c2a4e-1b7d-4a53-9a0f-0d2c3b4a5e6f';
const ORG_ADMIN = { id: 'user-orgadmin', role: UserRole.ORG_ADMINISTRATOR };
const SUPERVISOR = { id: 'user-supervisor', role: UserRole.SUPERVISOR };

function makePrisma(assignment: { is_verified: boolean } | null = null) {
  const stored = assignment
    ? { id: 'assign-1', resource_id: 'unit-own', capability_id: CAP_ID, ...assignment, resource_capabilities: { id: CAP_ID, name: 'ROPE_RESCUE' } }
    : null;
  return {
    organization_memberships: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(where.user_id === ORG_ADMIN.id && where.organization_id === OWN_ORG ? { id: 'm-1' } : null),
      ),
    },
    resources: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve({
          id: where.id,
          name: 'Rescue Boat',
          call_sign: where.id === 'unit-own' ? 'BRAVO-1' : 'CHARLIE-1',
          organization_id: where.id === 'unit-own' ? OWN_ORG : 'org-bfp',
        }),
      ),
    },
    resource_capabilities: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(where.id === CAP_ID ? { id: CAP_ID, name: 'ROPE_RESCUE' } : null),
      ),
      findMany: jest.fn().mockResolvedValue([{ id: CAP_ID, name: 'ROPE_RESCUE', category: 'RESCUE', description: 'Rope' }]),
    },
    resource_capability_assignments: {
      findFirst: jest.fn().mockResolvedValue(stored),
      create: jest.fn().mockResolvedValue({ id: 'assign-new', is_verified: false }),
      delete: jest.fn().mockResolvedValue(stored),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...stored, ...data })),
    },
  };
}

function rolesOf(method: string): string[] {
  return Reflect.getMetadata(ROLES_KEY, (ResourcesController.prototype as any)[method]) ?? [];
}

describe('Unit capabilities (MOD-29)', () => {
  const audit = { log: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  describe('routes', () => {
    it('declares GET /resources/capabilities before GET /resources/:id', () => {
      const methods = Object.getOwnPropertyNames(ResourcesController.prototype);
      expect(methods.indexOf('listCapabilities')).toBeGreaterThan(-1);
      expect(methods.indexOf('listCapabilities')).toBeLessThan(methods.indexOf('findById'));
    });

    it('lets every registry reader list the catalog', () => {
      expect(rolesOf('listCapabilities')).toEqual(rolesOf('findAll'));
    });

    it('lets only the Supervisor and System Administrator verify', () => {
      expect(rolesOf('verifyCapability').sort()).toEqual([UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR].sort());
      expect(rolesOf('verifyCapability')).not.toContain(UserRole.ORG_ADMINISTRATOR);
    });
  });

  describe('DTOs', () => {
    it('requires a UUID capabilityId', async () => {
      expect(await validate(plainToInstance(AddCapabilityDto, { capabilityId: CAP_ID }))).toHaveLength(0);
      expect(await validate(plainToInstance(AddCapabilityDto, { capabilityId: 'ROPE_RESCUE' }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(AddCapabilityDto, {}))).not.toHaveLength(0);
    });

    it('requires a boolean verified', async () => {
      expect(await validate(plainToInstance(VerifyCapabilityDto, { verified: true }))).toHaveLength(0);
      expect(await validate(plainToInstance(VerifyCapabilityDto, { verified: 'yes' }))).not.toHaveLength(0);
      expect(await validate(plainToInstance(VerifyCapabilityDto, {}))).not.toHaveLength(0);
    });
  });

  it('lists the catalog by category, then name', async () => {
    const prisma = makePrisma();
    const service = new ResourcesService(prisma as any, audit as any);

    await expect(service.listCapabilities()).resolves.toEqual([
      { id: CAP_ID, name: 'ROPE_RESCUE', category: 'RESCUE', description: 'Rope' },
    ]);
    expect(prisma.resource_capabilities.findMany).toHaveBeenCalledWith({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: true, description: true },
    });
  });

  describe('add', () => {
    it('adds an unverified capability to its own unit and audits it with the call sign and name', async () => {
      const prisma = makePrisma();
      const service = new ResourcesService(prisma as any, audit as any);

      await service.addCapability('unit-own', CAP_ID, ORG_ADMIN);

      expect(prisma.resource_capability_assignments.create).toHaveBeenCalledWith({
        data: { resource_id: 'unit-own', capability_id: CAP_ID },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'CREATE',
        actorId: ORG_ADMIN.id,
        entityType: 'resource_capability',
        entityId: 'assign-new',
        moduleId: 'MOD-29',
        newValues: { resource_id: 'unit-own', call_sign: 'BRAVO-1', capability: 'ROPE_RESCUE', is_verified: false },
      }));
    });

    it('refuses a capability the unit already has', async () => {
      const prisma = makePrisma({ is_verified: false });
      const service = new ResourcesService(prisma as any, audit as any);

      await expect(service.addCapability('unit-own', CAP_ID, ORG_ADMIN)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.resource_capability_assignments.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses a capability that is not in the catalog', async () => {
      const prisma = makePrisma();
      const service = new ResourcesService(prisma as any, audit as any);

      await expect(service.addCapability('unit-own', 'b3a1c9d0-0000-4000-8000-000000000000', ORG_ADMIN))
        .rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.resource_capability_assignments.create).not.toHaveBeenCalled();
    });

    it("refuses another organization's unit and writes no audit row", async () => {
      const prisma = makePrisma();
      const service = new ResourcesService(prisma as any, audit as any);

      await expect(service.addCapability('unit-bfp', CAP_ID, ORG_ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.resource_capability_assignments.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes the assignment and audits what was removed', async () => {
      const prisma = makePrisma({ is_verified: true });
      const service = new ResourcesService(prisma as any, audit as any);

      await service.removeCapability('unit-own', CAP_ID, ORG_ADMIN);

      expect(prisma.resource_capability_assignments.delete).toHaveBeenCalledWith({ where: { id: 'assign-1' } });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DELETE',
        entityType: 'resource_capability',
        entityId: 'assign-1',
        moduleId: 'MOD-29',
        oldValues: { resource_id: 'unit-own', call_sign: 'BRAVO-1', capability: 'ROPE_RESCUE', is_verified: true },
      }));
    });

    it('returns 404 for a capability the unit does not have', async () => {
      const prisma = makePrisma(null);
      const service = new ResourcesService(prisma as any, audit as any);

      await expect(service.removeCapability('unit-own', CAP_ID, ORG_ADMIN)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.resource_capability_assignments.delete).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it("flips is_verified on any organization's unit and audits the change", async () => {
      const prisma = makePrisma({ is_verified: false });
      const service = new ResourcesService(prisma as any, audit as any);

      const result = await service.verifyCapability('unit-own', CAP_ID, true, SUPERVISOR);

      expect(prisma.resource_capability_assignments.update).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
        data: { is_verified: true },
      });
      expect(result).toMatchObject({ is_verified: true });
      // Not org-scoped: the Supervisor is no member of the unit's organization.
      expect(prisma.organization_memberships.findFirst).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'UPDATE',
        actorId: SUPERVISOR.id,
        actorRole: UserRole.SUPERVISOR,
        entityType: 'resource_capability',
        entityId: 'assign-1',
        moduleId: 'MOD-29',
        oldValues: { is_verified: false },
        newValues: { resource_id: 'unit-own', call_sign: 'BRAVO-1', capability: 'ROPE_RESCUE', is_verified: true },
      }));
    });

    it('unverifies too', async () => {
      const prisma = makePrisma({ is_verified: true });
      const service = new ResourcesService(prisma as any, audit as any);

      await service.verifyCapability('unit-own', CAP_ID, false, SUPERVISOR);

      expect(prisma.resource_capability_assignments.update).toHaveBeenCalledWith({
        where: { id: 'assign-1' },
        data: { is_verified: false },
      });
    });

    it('returns 404 for a capability that is not assigned, instead of doing nothing', async () => {
      const prisma = makePrisma(null);
      const service = new ResourcesService(prisma as any, audit as any);

      await expect(service.verifyCapability('unit-own', CAP_ID, true, SUPERVISOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.resource_capability_assignments.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
