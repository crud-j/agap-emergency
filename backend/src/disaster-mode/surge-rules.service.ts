import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { surge_rules } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateSurgeRuleDto } from './dto/surge-rules.dto';
import { BOCAUE_RIVER_CRITICAL_M } from './surge-recommendation';

/**
 * MOD-52 (AUTOMATION_NEEDS_PLAN Phase 2, C2): the MDRRMO-editable surge rules and the
 * entered Bocaue River reading the detector reads. Every change is audited.
 */
@Injectable()
export class SurgeRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  getRules() {
    return this.prisma.surge_rules.findMany({ orderBy: { rule_key: 'asc' } });
  }

  async updateRule(id: string, dto: UpdateSurgeRuleDto, actorId: string) {
    const rule = await this.prisma.surge_rules.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Surge rule not found');
    const barangays = dto.barangays !== undefined ? await this.resolveBarangays(dto.barangays) : undefined;
    const updated = await this.prisma.surge_rules.update({
      where: { id },
      data: {
        ...(dto.windowMinutes !== undefined && { window_minutes: dto.windowMinutes }),
        ...(dto.minIncidents !== undefined && { min_incidents: dto.minIncidents }),
        ...(barangays !== undefined && { barangays }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        updated_at: new Date(),
      },
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'surge_rule',
      entityId: id,
      moduleId: 'MOD-52',
      oldValues: this.auditValues(rule),
      newValues: this.auditValues(updated),
    });
    return updated;
  }

  async getRiverLevel() {
    const s = await this.prisma.surge_settings.findUnique({ where: { singleton: true } });
    return {
      meters: s?.river_level_m != null ? Number(s.river_level_m) : null,
      recordedAt: s?.river_level_at?.toISOString() ?? null,
      criticalMeters: BOCAUE_RIVER_CRITICAL_M,
    };
  }

  async setRiverLevel(meters: number, actorId: string) {
    const before = await this.prisma.surge_settings.findUnique({ where: { singleton: true } });
    const now = new Date();
    const data = { river_level_m: meters, river_level_at: now, river_level_by_id: actorId, updated_at: now };
    const saved = await this.prisma.surge_settings.upsert({
      where: { singleton: true },
      create: { singleton: true, ...data },
      update: data,
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'surge_settings',
      entityId: saved.id,
      moduleId: 'MOD-52',
      oldValues: { riverLevelM: before?.river_level_m != null ? Number(before.river_level_m) : null },
      newValues: { riverLevelM: meters },
    });
    return this.getRiverLevel();
  }

  /** Each name must be one of Bocaue's barangays (geo_regions); stored with its official spelling. */
  private async resolveBarangays(names: string[]): Promise<string[]> {
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (wanted.length === 0) return [];
    const regions = await this.prisma.geo_regions.findMany({
      where: { region_type: 'barangay', OR: wanted.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) },
      select: { name: true },
    });
    const byLower = new Map(regions.map((r) => [r.name.toLowerCase(), r.name]));
    const unknown = wanted.filter((n) => !byLower.has(n.toLowerCase()));
    if (unknown.length) throw new BadRequestException(`Not a Bocaue barangay: ${unknown.join(', ')}`);
    // De-duplicate after mapping, so "bunlo" and "Bunlo" are one entry.
    return [...new Set(wanted.map((n) => byLower.get(n.toLowerCase())!))];
  }

  private auditValues(r: surge_rules) {
    return {
      ruleKey: r.rule_key,
      windowMinutes: r.window_minutes,
      minIncidents: r.min_incidents,
      barangays: r.barangays,
      isActive: r.is_active,
    };
  }
}
