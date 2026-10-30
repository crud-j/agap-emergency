import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { SurgeRulesService } from '../../src/disaster-mode/surge-rules.service';
import { DisasterModeService } from '../../src/disaster-mode/disaster-mode.service';
import { DisasterModeController } from '../../src/disaster-mode/disaster-mode.controller';
import { SetRiverLevelDto, UpdateSurgeRuleDto } from '../../src/disaster-mode/dto/surge-rules.dto';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * AUTOMATION_NEEDS_PLAN Phase 2, C2 (MOD-52): Supervisors edit the surge rules and enter the
 * river level (both audited), and triage tags reach every open board live.
 */

const RULE = {
  id: 'rule-flood',
  rule_key: 'FLOOD_CLUSTER',
  window_minutes: 30,
  min_incidents: 5,
  category: 'FLOOD',
  barangays: ['Lolomboy', 'Bunlo'],
  is_active: true,
};
const GEO = ['Lolomboy', 'Bunlo', 'Igulot', 'Biñang 1st'];

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (dto: object, metatype: new () => object) => pipe.transform(dto, { type: 'body', metatype });

function build() {
  const prisma: any = {
    surge_rules: {
      findUnique: jest.fn().mockResolvedValue(RULE),
      update: jest.fn(async ({ data }: any) => ({ ...RULE, ...data })),
      findMany: jest.fn().mockResolvedValue([RULE]),
    },
    geo_regions: {
      findMany: jest.fn(async ({ where }: any) =>
        GEO.filter((g) => where.OR.some((o: any) => o.name.equals.toLowerCase() === g.toLowerCase())).map((name) => ({ name })),
      ),
    },
    surge_settings: {
      findUnique: jest.fn().mockResolvedValue({ id: 'set-1', river_level_m: 10.2, river_level_at: new Date('2026-10-30T00:00:00Z') }),
      upsert: jest.fn().mockResolvedValue({ id: 'set-1' }),
    },
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  return { service: new SurgeRulesService(prisma, audit), prisma, audit };
}

describe('SurgeRulesService', () => {
  it('edits a rule, stores barangays with their official spelling, and audits old and new values', async () => {
    const b = build();
    await b.service.updateRule('rule-flood', { minIncidents: 4, barangays: ['bunlo', 'BIÑANG 1ST', 'Bunlo'] }, 'sup-1');
    expect(b.prisma.surge_rules.update.mock.calls[0][0].data).toMatchObject({ min_incidents: 4, barangays: ['Bunlo', 'Biñang 1st'] });
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        actorId: 'sup-1',
        entityType: 'surge_rule',
        entityId: 'rule-flood',
        moduleId: 'MOD-52',
        oldValues: expect.objectContaining({ minIncidents: 5, barangays: ['Lolomboy', 'Bunlo'] }),
        newValues: expect.objectContaining({ minIncidents: 4, barangays: ['Bunlo', 'Biñang 1st'] }),
      }),
    );
  });

  it('refuses a barangay that is not in Bocaue', async () => {
    const b = build();
    await expect(b.service.updateRule('rule-flood', { barangays: ['Bunlo', 'Atlantis'] }, 'sup-1')).rejects.toThrow(BadRequestException);
    expect(b.prisma.surge_rules.update).not.toHaveBeenCalled();
    expect(b.audit.log).not.toHaveBeenCalled();
  });

  it('an empty list means any barangay', async () => {
    const b = build();
    await b.service.updateRule('rule-flood', { barangays: [] }, 'sup-1');
    expect(b.prisma.surge_rules.update.mock.calls[0][0].data.barangays).toEqual([]);
    expect(b.prisma.geo_regions.findMany).not.toHaveBeenCalled();
  });

  it('404s an unknown rule', async () => {
    const b = build();
    b.prisma.surge_rules.findUnique.mockResolvedValue(null);
    await expect(b.service.updateRule('nope', { isActive: false }, 'sup-1')).rejects.toThrow(NotFoundException);
  });

  it('records the river level with who and when, and audits the change', async () => {
    const b = build();
    b.prisma.surge_settings.findUnique
      .mockResolvedValueOnce({ id: 'set-1', river_level_m: 10.2 })
      .mockResolvedValueOnce({ id: 'set-1', river_level_m: 11.62, river_level_at: new Date('2026-10-30T06:00:00Z') });
    const res = await b.service.setRiverLevel(11.62, 'sup-1');
    const arg = b.prisma.surge_settings.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ singleton: true });
    expect(arg.update).toMatchObject({ river_level_m: 11.62, river_level_by_id: 'sup-1', river_level_at: expect.any(Date) });
    expect(b.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'surge_settings', entityId: 'set-1', oldValues: { riverLevelM: 10.2 }, newValues: { riverLevelM: 11.62 } }),
    );
    expect(res).toEqual({ meters: 11.62, recordedAt: '2026-10-30T06:00:00.000Z', criticalMeters: 11.5 });
  });
});

describe('surge rule and river level DTOs', () => {
  it('rejects a window under 5 min, a zero minimum and an unknown field', async () => {
    await expect(validate({ windowMinutes: 2 }, UpdateSurgeRuleDto)).rejects.toBeDefined();
    await expect(validate({ minIncidents: 0 }, UpdateSurgeRuleDto)).rejects.toBeDefined();
    await expect(validate({ ruleKey: 'X' }, UpdateSurgeRuleDto)).rejects.toBeDefined();
    await expect(validate({ windowMinutes: 30, minIncidents: 5, barangays: ['Bunlo'], isActive: true }, UpdateSurgeRuleDto)).resolves.toBeDefined();
  });

  it('accepts a river level up to 2 decimals between 0 and 30 m', async () => {
    await expect(validate({ meters: 11.62 }, SetRiverLevelDto)).resolves.toBeDefined();
    await expect(validate({ meters: 11.625 }, SetRiverLevelDto)).rejects.toBeDefined();
    await expect(validate({ meters: 31 }, SetRiverLevelDto)).rejects.toBeDefined();
  });
});

describe('surge rule routes', () => {
  const roles = (name: keyof DisasterModeController) => Reflect.getMetadata(ROLES_KEY, DisasterModeController.prototype[name]);

  it('rules and the river-level write are Supervisor only; Dispatchers may read the river level', () => {
    expect(roles('rules')).toEqual([UserRole.SUPERVISOR]);
    expect(roles('updateRule')).toEqual([UserRole.SUPERVISOR]);
    expect(roles('setRiverLevel')).toEqual([UserRole.SUPERVISOR]);
    expect(roles('riverLevel')).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR]);
  });
});

describe('live triage tags', () => {
  function service() {
    const prisma: any = {
      surge_incidents: { findFirst: jest.fn().mockResolvedValue({ id: 'surge-1' }) },
      triage_tags: {
        create: jest.fn().mockResolvedValue({ id: 'tag-1', surge_id: 'surge-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'tag-1', surge_id: 'surge-1' }),
        update: jest.fn().mockResolvedValue({ id: 'tag-1', surge_id: 'surge-1', triage_color: 'RED' }),
      },
    };
    const realtime: any = { triageTagUpdated: jest.fn() };
    return { svc: new DisasterModeService(prisma, undefined, undefined, realtime), realtime };
  }

  it('emits surge.triage_tag_updated with IDs only when a tag is filed or changed', async () => {
    const { svc, realtime } = service();
    await svc.createTriageTag({ triageColor: 'YELLOW', incidentId: 'inc-1', triageNotes: 'leg wound' } as any, 'resp-1');
    await svc.updateTriageTag('tag-1', { triageColor: 'RED' }, 'resp-1');
    expect(realtime.triageTagUpdated).toHaveBeenCalledTimes(2);
    for (const [payload] of realtime.triageTagUpdated.mock.calls) {
      expect(payload).toEqual({ surgeId: 'surge-1', tagId: 'tag-1' });
    }
  });

  it('still saves and returns the tag without a realtime service', async () => {
    const prisma: any = {
      surge_incidents: { findFirst: jest.fn().mockResolvedValue({ id: 'surge-1' }) },
      triage_tags: { create: jest.fn().mockResolvedValue({ id: 'tag-2', surge_id: 'surge-1' }) },
    };
    await expect(new DisasterModeService(prisma).createTriageTag({ triageColor: 'GREEN' } as any, 'resp-1'))
      .resolves.toEqual({ id: 'tag-2', surge_id: 'surge-1' });
  });
});
