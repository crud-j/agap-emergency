import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import {
  HOTSPOT_BUFFER_M,
  HOTSPOT_EPS_M,
  HOTSPOT_MIN_POINTS,
  HOTSPOT_WINDOW_DAYS,
  HotspotDiscoveryService,
} from '../../src/risk-intelligence/hotspot-discovery.service';
import { RiskIntelligenceController } from '../../src/risk-intelligence/risk-intelligence.controller';
import { ApproveRiskAreaProposalDto } from '../../src/risk-intelligence/dto/risk-area-proposal.dto';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * AUTOMATION_NEEDS_PLAN Phase 2, C7 (MOD-51): a nightly job proposes recurring clusters; only
 * a System Administrator's approval creates the risk area. Prisma is mocked here. The SQL
 * itself was run against PostGIS in a rolled-back transaction (see the plan's progress log).
 */

const PROPOSAL = {
  id: 'prop-1',
  risk_type: 'FLOOD',
  barangay: 'Bunlo',
  incident_count: 6,
  window_days: 90,
  status: 'PENDING',
  reviewed_by_id: null,
  reviewed_at: null,
  risk_area_id: null,
};

function build() {
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'prop-1' }, { id: 'prop-2' }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    risk_area_proposals: {
      findUnique: jest.fn().mockResolvedValue(PROPOSAL),
      findMany: jest.fn().mockResolvedValue([PROPOSAL]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ ...PROPOSAL, status: 'APPROVED', risk_area_id: 'area-1' }),
    },
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const risk: any = { createArea: jest.fn().mockResolvedValue({ id: 'area-1', name: 'Bunlo flood hotspot' }) };
  return { service: new HotspotDiscoveryService(prisma, audit, risk), prisma, audit, risk };
}

/** The tagged-template SQL and its bound values from a $queryRaw / $executeRaw mock call. */
const sqlOf = (call: any[]) => ({ text: (call[0] as string[]).join('?'), values: call.slice(1) });

describe('HotspotDiscoveryService.discover', () => {
  it('upserts one PENDING proposal per cluster and returns how many it wrote', async () => {
    const b = build();
    await expect(b.service.discover()).resolves.toBe(2);
    const { text, values } = sqlOf(b.prisma.$queryRaw.mock.calls[0]);
    expect(text).toContain('ST_ClusterDBSCAN');
    expect(text).toContain('ST_Transform(il.point::geometry, 32651)');
    expect(text).toContain("i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')");
    expect(text).toContain("ON CONFLICT (risk_type, (COALESCE(barangay, ''))) WHERE status = 'PENDING'");
    expect(values).toEqual(expect.arrayContaining([HOTSPOT_WINDOW_DAYS, HOTSPOT_EPS_M, HOTSPOT_MIN_POINTS, HOTSPOT_BUFFER_M]));
    expect([HOTSPOT_WINDOW_DAYS, HOTSPOT_EPS_M, HOTSPOT_MIN_POINTS, HOTSPOT_BUFFER_M]).toEqual([90, 150, 4, 30]);
  });

  it('skips clusters an active risk area already covers, and recently dismissed ones', async () => {
    const b = build();
    await b.service.discover();
    const { text } = sqlOf(b.prisma.$queryRaw.mock.calls[0]);
    expect(text).toContain('ST_Intersects(a.area_boundary');
    // Areas created without a boundary cover their barangay.
    expect(text).toContain('a.area_boundary IS NULL AND a.barangay IS NOT NULL AND a.barangay = nm.barangay');
    expect(text).toContain("d.status = 'DISMISSED'");
  });

  it('a failed run logs and returns 0, never throws', async () => {
    const b = build();
    b.prisma.$queryRaw.mockRejectedValue(new Error('function st_clusterdbscan does not exist'));
    await expect(b.service.discover()).resolves.toBe(0);
  });
});

describe('HotspotDiscoveryService review', () => {
  const dto = { name: 'Bunlo flood hotspot', riskLevel: 'HIGH' as const };

  it('approve: claims the proposal, creates the area through createArea, copies the boundary and audits', async () => {
    const b = build();
    const res = await b.service.approve('prop-1', dto, 'admin-1');

    expect(b.prisma.risk_area_proposals.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'prop-1', status: 'PENDING' },
      data: { status: 'APPROVED', reviewed_by_id: 'admin-1' },
    });
    expect(b.risk.createArea).toHaveBeenCalledWith(
      { name: 'Bunlo flood hotspot', riskType: 'FLOOD', riskLevel: 'HIGH', barangay: 'Bunlo' },
      'admin-1',
    );
    const { text, values } = sqlOf(b.prisma.$executeRaw.mock.calls[0]);
    expect(text).toContain('UPDATE risk_areas');
    expect(text).toContain('SET area_boundary = (SELECT area_boundary FROM risk_area_proposals');
    expect(values).toEqual(['prop-1', 'area-1']);
    expect(b.prisma.risk_area_proposals.update).toHaveBeenCalledWith({ where: { id: 'prop-1' }, data: { risk_area_id: 'area-1' } });
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        actorId: 'admin-1',
        entityType: 'risk_area_proposal',
        entityId: 'prop-1',
        moduleId: 'MOD-51',
        oldValues: { status: 'PENDING' },
        newValues: expect.objectContaining({ status: 'APPROVED', riskAreaId: 'area-1' }),
      }),
    );
    expect(res).toEqual({ proposalId: 'prop-1', riskArea: { id: 'area-1', name: 'Bunlo flood hotspot' } });
  });

  it('approve: a proposal outside every barangay creates an area with no barangay', async () => {
    const b = build();
    b.prisma.risk_area_proposals.findUnique.mockResolvedValue({ ...PROPOSAL, barangay: null });
    await b.service.approve('prop-1', dto, 'admin-1');
    expect(b.risk.createArea.mock.calls[0][0]).not.toHaveProperty('barangay');
  });

  it('approve: an already reviewed proposal is refused and creates nothing', async () => {
    const b = build();
    b.prisma.risk_area_proposals.updateMany.mockResolvedValue({ count: 0 });
    await expect(b.service.approve('prop-1', dto, 'admin-1')).rejects.toThrow(ConflictException);
    expect(b.risk.createArea).not.toHaveBeenCalled();
    expect(b.prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('approve: if createArea refuses, the claim is released and the error is returned', async () => {
    const b = build();
    b.risk.createArea.mockRejectedValue(new BadRequestException('"Bunlo" is not a Bocaue barangay.'));
    await expect(b.service.approve('prop-1', dto, 'admin-1')).rejects.toThrow(BadRequestException);
    expect(b.prisma.risk_area_proposals.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'prop-1', status: 'APPROVED', risk_area_id: null },
      data: { status: 'PENDING', reviewed_by_id: null, reviewed_at: null },
    });
    expect(b.audit.log).not.toHaveBeenCalled();
  });

  it('approve: 404 for an unknown proposal', async () => {
    const b = build();
    b.prisma.risk_area_proposals.findUnique.mockResolvedValue(null);
    await expect(b.service.approve('nope', dto, 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('dismiss: marks it DISMISSED with the reviewer, audits, and creates no area', async () => {
    const b = build();
    await expect(b.service.dismiss('prop-1', 'admin-1')).resolves.toEqual({ proposalId: 'prop-1', status: 'DISMISSED' });
    expect(b.prisma.risk_area_proposals.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'prop-1', status: 'PENDING' },
      data: { status: 'DISMISSED', reviewed_by_id: 'admin-1' },
    });
    expect(b.risk.createArea).not.toHaveBeenCalled();
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'risk_area_proposal', oldValues: { status: 'PENDING' }, newValues: { status: 'DISMISSED' } }),
    );
  });

  it('dismiss: refused once reviewed, 404 when missing', async () => {
    const b = build();
    b.prisma.risk_area_proposals.updateMany.mockResolvedValue({ count: 0 });
    await expect(b.service.dismiss('prop-1', 'admin-1')).rejects.toThrow(ConflictException);
    b.prisma.risk_area_proposals.findUnique.mockResolvedValue(null);
    await expect(b.service.dismiss('nope', 'admin-1')).rejects.toThrow(NotFoundException);
    expect(b.audit.log).not.toHaveBeenCalled();
  });

  it('lists PENDING proposals by default, largest first', async () => {
    const b = build();
    await b.service.listProposals();
    expect(b.prisma.risk_area_proposals.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: [{ incident_count: 'desc' }, { updated_at: 'desc' }],
      take: 100,
    });
  });
});

describe('proposal routes and DTO', () => {
  const roles = (name: keyof RiskIntelligenceController) => Reflect.getMetadata(ROLES_KEY, RiskIntelligenceController.prototype[name]);
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('are System Administrator only', () => {
    for (const name of ['proposals', 'approveProposal', 'dismissProposal'] as const) {
      expect(roles(name)).toEqual([UserRole.SYSTEM_ADMINISTRATOR]);
    }
  });

  it('approval needs a name and a known risk level, nothing else', async () => {
    const v = (body: object) => pipe.transform(body, { type: 'body', metatype: ApproveRiskAreaProposalDto });
    await expect(v({ name: 'Bunlo flood hotspot', riskLevel: 'HIGH' })).resolves.toBeDefined();
    await expect(v({ name: 'Bunlo flood hotspot', riskLevel: 'EXTREME' })).rejects.toBeDefined();
    await expect(v({ name: 'B', riskLevel: 'HIGH' })).rejects.toBeDefined();
    await expect(v({ name: 'Bunlo', riskLevel: 'HIGH', riskType: 'FIRE' })).rejects.toBeDefined();
  });
});
