import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  FALLBACK_SLA_SECONDS,
  pickPolicy,
  thresholdsOf,
  type SlaPolicyRow,
  type SlaThresholds,
} from './sla-rules';

/** GET /sla-policies row. Seconds throughout; the console shows minutes. */
export interface SlaPolicyView {
  id: string;
  category: string | null;
  priority: string | null;
  acknowledgeSecs: number;
  dispatchSecs: number;
  onSceneSecs: number;
  isActive: boolean;
}

export interface SlaPoliciesResponse {
  policies: SlaPolicyView[];
  /** Applies when no active policy matches an incident. */
  fallback: SlaThresholds;
}

export interface ResolvedSla {
  thresholds: SlaThresholds;
  /** null when the fallback applied. */
  policyId: string | null;
  priority: string | null;
}

export interface SlaPolicyUpdate {
  acknowledgeSecs: number;
  dispatchSecs: number;
  onSceneSecs: number;
}

export interface SlaPolicyActor {
  id: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function toView(p: SlaPolicyRow): SlaPolicyView {
  return {
    id: p.id,
    category: p.incident_category,
    priority: p.priority,
    acknowledgeSecs: p.acknowledge_threshold_secs,
    dispatchSecs: p.dispatch_threshold_secs,
    onSceneSecs: p.on_scene_threshold_secs,
    isActive: p.is_active,
  };
}

/** Catch-alls last; within a level, CRITICAL → LOW, then category A–Z. */
function displayOrder(a: SlaPolicyRow, b: SlaPolicyRow): number {
  const rank = (p: string | null) => (p === null ? PRIORITY_ORDER.length : PRIORITY_ORDER.indexOf(p));
  return (
    rank(a.priority) - rank(b.priority) ||
    (a.incident_category ?? '~').localeCompare(b.incident_category ?? '~')
  );
}

/**
 * Each step's target must leave room for the one before it: a dispatch target shorter
 * than the acknowledge target would escalate a dispatch the dispatcher could not yet make.
 */
export function assertValidTargets(t: SlaPolicyUpdate): void {
  if (!(t.acknowledgeSecs <= t.dispatchSecs && t.dispatchSecs <= t.onSceneSecs)) {
    throw new BadRequestException(
      'Targets must run in order: acknowledge ≤ dispatch ≤ on scene (all measured from the report).',
    );
  }
}

@Injectable()
export class SlaPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private loadPolicies(): Promise<SlaPolicyRow[]> {
    return this.prisma.sla_policies.findMany({
      select: {
        id: true,
        incident_category: true,
        priority: true,
        acknowledge_threshold_secs: true,
        dispatch_threshold_secs: true,
        on_scene_threshold_secs: true,
        is_active: true,
        created_at: true,
      },
    }) as Promise<SlaPolicyRow[]>;
  }

  async list(): Promise<SlaPoliciesResponse> {
    const rows = await this.loadPolicies();
    return { policies: [...rows].sort(displayOrder).map(toView), fallback: { ...FALLBACK_SLA_SECONDS } };
  }

  /** The targets for one incident, from its current category and priority. */
  async resolveForIncident(incident: { category: string; priority: string }): Promise<ResolvedSla> {
    const policy = pickPolicy(await this.loadPolicies(), String(incident.category), String(incident.priority));
    return { thresholds: thresholdsOf(policy), policyId: policy?.id ?? null, priority: String(incident.priority) };
  }

  /**
   * Change one policy's targets. Audited fail-closed in the same transaction: the change
   * is not saved unless the audit row is. Open incidents pick up the new targets when
   * their scheduled checks run (each check re-reads the policy).
   */
  async update(id: string, next: SlaPolicyUpdate, actor: SlaPolicyActor): Promise<SlaPolicyView> {
    assertValidTargets(next);
    return this.prisma.$transaction(async (tx) => {
      const before = (await tx.sla_policies.findUnique({ where: { id } })) as SlaPolicyRow | null;
      if (!before) throw new NotFoundException('Response target not found.');

      const after = (await tx.sla_policies.update({
        where: { id },
        data: {
          acknowledge_threshold_secs: next.acknowledgeSecs,
          dispatch_threshold_secs: next.dispatchSecs,
          on_scene_threshold_secs: next.onSceneSecs,
        },
      })) as SlaPolicyRow;

      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'sla_policy',
        entityId: id,
        moduleId: 'MOD-41',
        oldValues: {
          priority: before.priority,
          category: before.incident_category,
          acknowledgeSecs: before.acknowledge_threshold_secs,
          dispatchSecs: before.dispatch_threshold_secs,
          onSceneSecs: before.on_scene_threshold_secs,
        },
        newValues: { ...next },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });

      return toView(after);
    });
  }
}
