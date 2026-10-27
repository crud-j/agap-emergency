import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { RiskIntelligenceController } from '../../src/risk-intelligence/risk-intelligence.controller';
import { RiskIntelligenceService } from '../../src/risk-intelligence/risk-intelligence.service';
import { CreateRiskAreaDto, UpdateRiskAreaDto } from '../../src/risk-intelligence/dto/risk-area.dto';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

// MOD-51 risk-area management (MODULE_GAPS_COMPLETION_PLAN.md Phase 5).

const ADMIN_ID = 'user-admin';
const AREA_ID = '6f1d1c1e-2b7a-4a43-9a3c-1d2a3b4c5d6e';

// Same options as main.ts, so these are the rules a real request meets.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (dto: object, metatype: new () => object) =>
  pipe.transform(dto, { type: 'body', metatype });

const validArea = {
  name: 'Lolomboy riverside',
  riskType: 'FLOOD',
  riskLevel: 'HIGH',
  barangay: 'Lolomboy',
  floodThresholdMeters: 11.5,
};

function areaRow(over: Record<string, unknown> = {}) {
  return {
    id: AREA_ID,
    name: 'Lolomboy riverside',
    description: null,
    risk_type: 'FLOOD',
    risk_level: 'HIGH',
    barangay: 'Lolomboy',
    flood_threshold_meters: '11.50', // Prisma Decimal
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

function makeService(opts: { area?: Record<string, unknown> | null } = {}) {
  const prisma = {
    risk_areas: {
      create: jest.fn(async ({ data }: any) => areaRow({ ...data, flood_threshold_meters: data.flood_threshold_meters })),
      findUnique: jest.fn().mockResolvedValue(opts.area === undefined ? areaRow() : opts.area),
      update: jest.fn(async ({ data }: any) => areaRow(data)),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    geo_regions: {
      findFirst: jest.fn(async ({ where }: any) =>
        ['lolomboy', 'bunlo', 'tambubong'].includes(String(where.name.equals).toLowerCase())
          ? { name: String(where.name.equals).replace(/^\w/, (c) => c.toUpperCase()) }
          : null,
      ),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new RiskIntelligenceService(prisma as any, audit as any);
  return { service, prisma, audit };
}

// ─── Validation ──────────────────────────────────────────────────────────────

describe('risk area DTOs', () => {
  it('accept a FLOOD area for Lolomboy at 11.50 m', async () => {
    await expect(validate(validArea, CreateRiskAreaDto)).resolves.toMatchObject(validArea);
  });

  it('reject an unknown risk level', async () => {
    await expect(validate({ ...validArea, riskLevel: 'EXTREME' }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it('reject a negative or out-of-range threshold', async () => {
    await expect(validate({ ...validArea, floodThresholdMeters: -1 }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
    await expect(validate({ ...validArea, floodThresholdMeters: 31 }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it('reject an unknown incident category and unknown fields', async () => {
    await expect(validate({ ...validArea, riskType: 'TSUNAMI' }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
    await expect(validate({ ...validArea, area_boundary: 'POLYGON(...)' }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it('allow a partial update with isActive only', async () => {
    await expect(validate({ isActive: false }, UpdateRiskAreaDto)).resolves.toMatchObject({ isActive: false });
    await expect(validate({ riskLevel: 'LOW' }, UpdateRiskAreaDto)).resolves.toMatchObject({ riskLevel: 'LOW' });
  });
});

// ─── Access ──────────────────────────────────────────────────────────────────

describe('RiskIntelligenceController access', () => {
  const roles = (name: keyof RiskIntelligenceController) =>
    Reflect.getMetadata(ROLES_KEY, RiskIntelligenceController.prototype[name]);

  it('lets only the System Administrator create, update and delete (others get 403)', () => {
    for (const name of ['createArea', 'updateArea', 'deleteArea'] as const) {
      expect(roles(name)).toEqual([UserRole.SYSTEM_ADMINISTRATOR]);
    }
  });

  it('opens the area list to the System Administrator, but not the heatmap or map points (Phase 5b)', () => {
    expect(roles('areas')).toContain(UserRole.SYSTEM_ADMINISTRATOR);
    expect(roles('heatmap')).not.toContain(UserRole.SYSTEM_ADMINISTRATOR);
    expect(roles('mapPoints')).not.toContain(UserRole.SYSTEM_ADMINISTRATOR);
  });
});

// ─── Service ─────────────────────────────────────────────────────────────────

describe('RiskIntelligenceService risk areas', () => {
  it('creates an area and writes a MOD-51 audit row', async () => {
    const { service, prisma, audit } = makeService();
    await service.createArea(validArea as CreateRiskAreaDto, ADMIN_ID);
    expect(prisma.risk_areas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ risk_type: 'FLOOD', risk_level: 'HIGH', barangay: 'Lolomboy', flood_threshold_meters: 11.5 }),
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE', actorId: ADMIN_ID, entityType: 'risk_area', moduleId: 'MOD-51',
    }));
  });

  it('refuses a barangay outside Bocaue and stores the official spelling', async () => {
    const { service, prisma } = makeService();
    await expect(service.createArea({ ...validArea, barangay: 'Malolos' } as CreateRiskAreaDto, ADMIN_ID))
      .rejects.toThrow(/not a Bocaue barangay/);
    await service.createArea({ ...validArea, barangay: 'tambubong' } as CreateRiskAreaDto, ADMIN_ID);
    expect(prisma.risk_areas.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ barangay: 'Tambubong' }) });
  });

  it('updates the level, deactivates, stamps updated_at and audits old and new values', async () => {
    const { service, prisma, audit } = makeService();
    await service.updateArea(AREA_ID, { riskLevel: 'CRITICAL', isActive: false }, ADMIN_ID);
    expect(prisma.risk_areas.update).toHaveBeenCalledWith({
      where: { id: AREA_ID },
      data: expect.objectContaining({ risk_level: 'CRITICAL', is_active: false, updated_at: expect.any(Date) }),
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      oldValues: expect.objectContaining({ riskLevel: 'HIGH', isActive: true, floodThresholdMeters: 11.5 }),
      newValues: expect.objectContaining({ riskLevel: 'CRITICAL', isActive: false }),
    }));
  });

  it('clears the barangay when sent empty', async () => {
    const { service, prisma } = makeService();
    await service.updateArea(AREA_ID, { barangay: '' }, ADMIN_ID);
    expect(prisma.risk_areas.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ barangay: null }),
    }));
  });

  it('deletes an area and keeps what was deleted in the audit row', async () => {
    const { service, prisma, audit } = makeService();
    await service.deleteArea(AREA_ID, ADMIN_ID);
    expect(prisma.risk_areas.delete).toHaveBeenCalledWith({ where: { id: AREA_ID } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE', entityId: AREA_ID, oldValues: expect.objectContaining({ name: 'Lolomboy riverside' }),
    }));
  });

  it('404s on a missing area without writing anything', async () => {
    const { service, prisma, audit } = makeService({ area: null });
    await expect(service.updateArea(AREA_ID, { riskLevel: 'LOW' }, ADMIN_ID)).rejects.toThrow(NotFoundException);
    await expect(service.deleteArea(AREA_ID, ADMIN_ID)).rejects.toThrow(NotFoundException);
    expect(prisma.risk_areas.update).not.toHaveBeenCalled();
    expect(prisma.risk_areas.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
