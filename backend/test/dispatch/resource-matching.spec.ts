import {
  CAPABILITY_MATRIX,
  ResourceMatchingService,
  buildRationale,
  computeCapabilityScore,
  computeFinalScore,
  computeProximityScore,
} from '../../src/dispatch/resource-matching/resource-matching.service';

// ---------------------------------------------------------------------------
// Pure scoring function tests
// ---------------------------------------------------------------------------

describe('computeCapabilityScore', () => {
  it('returns 100 when all required capabilities are matched', () => {
    const score = computeCapabilityScore(
      ['FIREFIGHTING', 'RESCUE'],
      ['FIREFIGHTING', 'RESCUE', 'EXTRA_CAP'],
    );
    expect(score).toBe(100);
  });

  it('returns 0 when no required capabilities are matched', () => {
    expect(computeCapabilityScore(['FIREFIGHTING', 'RESCUE'], ['FIRST_AID'])).toBe(0);
  });

  it('returns partial score proportionally', () => {
    expect(
      computeCapabilityScore(['FIREFIGHTING', 'FIRE_SUPPRESSION', 'RESCUE'], ['FIREFIGHTING']),
    ).toBeCloseTo(33.33, 1);
  });

  it('returns 50 (neutral) when no capabilities are required', () => {
    expect(computeCapabilityScore([], ['ANYTHING'])).toBe(50);
  });

  it('is case-insensitive on assigned caps', () => {
    expect(computeCapabilityScore(['FIREFIGHTING'], ['firefighting'])).toBe(100);
  });
});

describe('computeProximityScore', () => {
  it('returns 100 for a resource at the incident location', () => {
    expect(computeProximityScore(0)).toBe(100);
  });

  it('returns 50 for a resource at half the max range', () => {
    expect(computeProximityScore(10_000, 20_000)).toBe(50);
  });

  it('returns 0 for a resource exactly at max range', () => {
    expect(computeProximityScore(20_000, 20_000)).toBe(0);
  });

  it('clamps to 0 — never returns negative', () => {
    expect(computeProximityScore(25_000, 20_000)).toBe(0);
  });

  it('returns 50 (neutral) when distance is unknown', () => {
    expect(computeProximityScore(null)).toBe(50);
  });
});

describe('computeFinalScore', () => {
  it('weights capability (0.5), proximity (0.35), type affinity (0.15)', () => {
    const score = computeFinalScore(100, 100, true);
    expect(score).toBeCloseTo(100);
  });

  it('gives zero type-affinity bonus when type does not match', () => {
    const withAffinity = computeFinalScore(80, 60, true);
    const without = computeFinalScore(80, 60, false);
    expect(withAffinity).toBeGreaterThan(without);
    expect(withAffinity - without).toBeCloseTo(15, 1); // 100 * 0.15
  });
});

// ---------------------------------------------------------------------------
// Ranking integration: FIRE incident scenario (acceptance criterion)
// ---------------------------------------------------------------------------

describe('FIRE incident ranking — capability matrix', () => {
  const FIRE_CAPS = CAPABILITY_MATRIX['FIRE'] ?? [];

  it('defines required capabilities for FIRE', () => {
    expect(FIRE_CAPS).toContain('FIREFIGHTING');
    expect(FIRE_CAPS).toContain('RESCUE');
  });

  it('fire/rescue-capable unit outranks a medical-only unit for FIRE', () => {
    const fireTruckCapScore = computeCapabilityScore(FIRE_CAPS, [
      'FIREFIGHTING', 'FIRE_SUPPRESSION', 'RESCUE',
    ]);
    const ambulanceCapScore = computeCapabilityScore(FIRE_CAPS, [
      'MEDICAL_RESPONSE', 'FIRST_AID', 'PATIENT_TRANSPORT',
    ]);
    expect(fireTruckCapScore).toBeGreaterThan(ambulanceCapScore);

    // Full score at equal distance, type affinity applied
    const fireTruckScore = computeFinalScore(
      fireTruckCapScore,
      computeProximityScore(1_000),
      true, // FIRE_TRUCK has affinity for FIRE
    );
    const ambulanceScore = computeFinalScore(
      ambulanceCapScore,
      computeProximityScore(1_000),
      false, // AMBULANCE has no affinity for FIRE
    );
    expect(fireTruckScore).toBeGreaterThan(ambulanceScore);
  });

  it('closer fire-capable unit outranks a more distant fire-capable unit', () => {
    const capScore = computeCapabilityScore(FIRE_CAPS, ['FIREFIGHTING', 'FIRE_SUPPRESSION', 'RESCUE']);
    const nearScore = computeFinalScore(capScore, computeProximityScore(500), true);
    const farScore = computeFinalScore(capScore, computeProximityScore(15_000), true);
    expect(nearScore).toBeGreaterThan(farScore);
  });
});

// ---------------------------------------------------------------------------
// Rationale text
// ---------------------------------------------------------------------------

describe('buildRationale', () => {
  it('includes capability match count in the rationale', () => {
    const text = buildRationale({
      category: 'FIRE',
      requiredCaps: ['FIREFIGHTING', 'RESCUE'],
      matchedCaps: ['FIREFIGHTING'],
      resourceType: 'FIRE_TRUCK',
      distanceMeters: 2_000,
      typeAffinity: true,
    });
    expect(text).toMatch('1/2 required');
    expect(text).toMatch('FIREFIGHTING');
  });

  it('includes distance formatted in km', () => {
    const text = buildRationale({
      category: 'MEDICAL',
      requiredCaps: [],
      matchedCaps: [],
      resourceType: 'AMBULANCE',
      distanceMeters: 3_500,
      typeAffinity: true,
    });
    expect(text).toMatch('3.5km');
  });

  it('flags strong type match in rationale', () => {
    const text = buildRationale({
      category: 'FIRE',
      requiredCaps: [],
      matchedCaps: [],
      resourceType: 'FIRE_TRUCK',
      distanceMeters: null,
      typeAffinity: true,
    });
    expect(text).toMatch('strong match');
  });

  it('omits distance when unknown', () => {
    const text = buildRationale({
      category: 'FLOOD',
      requiredCaps: [],
      matchedCaps: [],
      resourceType: 'RESCUE_BOAT',
      distanceMeters: null,
      typeAffinity: true,
    });
    expect(text).not.toMatch('km');
  });
});

// ---------------------------------------------------------------------------
// Service-level tests (mock PrismaService + AuditService)
// ---------------------------------------------------------------------------

// Declared with explicit type so the circular self-reference in $transaction resolves.
const mockPrisma: {
  incident: { findUnique: jest.Mock };
  resources: { findMany: jest.Mock };
  resource_recommendations: { deleteMany: jest.Mock; createMany: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
} = {
  incident: { findUnique: jest.fn() },
  resources: { findMany: jest.fn() },
  resource_recommendations: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn((ops: unknown): Promise<unknown> => {
    if (Array.isArray(ops)) return Promise.all(ops as Promise<unknown>[]);
    return (ops as (p: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
  }),
};

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

describe('ResourceMatchingService.getRecommendations', () => {
  let service: ResourceMatchingService;

  beforeEach(() => {
    service = new ResourceMatchingService(mockPrisma as any, mockAudit as any);
    jest.clearAllMocks();
    mockPrisma.resource_recommendations.deleteMany.mockResolvedValue({});
    mockPrisma.resource_recommendations.createMany.mockResolvedValue({});
  });

  it('throws NotFoundException when incident does not exist', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue(null);
    await expect(
      service.getRecommendations('non-existent-id', 'user-1', 'DISPATCHER'),
    ).rejects.toThrow('Incident not found');
  });

  it('returns empty array when no AVAILABLE resources exist', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue({
      id: 'inc-1',
      category: 'FIRE',
      incident_locations: null,
    });
    mockPrisma.resources.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('inc-1', 'user-1', 'DISPATCHER');
    expect(result).toEqual([]);
  });

  it('ranks fire/rescue-capable resource above medical-only for a FIRE incident', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue({
      id: 'inc-fire',
      category: 'FIRE',
      incident_locations: null, // no GPS — proximity neutral
    });

    mockPrisma.resources.findMany
      // First call: fetchCandidates (select id only)
      .mockResolvedValueOnce([
        { id: 'fire-truck-1' },
        { id: 'ambulance-1' },
      ])
      // Second call: full resource + capabilities
      .mockResolvedValueOnce([
        {
          id: 'fire-truck-1',
          name: 'BFP Unit 1',
          call_sign: 'BFP-1',
          resource_type: 'FIRE_TRUCK',
          organization_id: 'org-bfp',
          status: 'AVAILABLE',
          resource_capability_assignments: [
            { is_verified: true, resource_capabilities: { name: 'FIREFIGHTING' } },
            { is_verified: true, resource_capabilities: { name: 'FIRE_SUPPRESSION' } },
            { is_verified: true, resource_capabilities: { name: 'RESCUE' } },
          ],
        },
        {
          id: 'ambulance-1',
          name: 'MDRRMO Ambulance 1',
          call_sign: 'AMB-1',
          resource_type: 'AMBULANCE',
          organization_id: 'org-mdrrmo',
          status: 'AVAILABLE',
          resource_capability_assignments: [
            { is_verified: true, resource_capabilities: { name: 'MEDICAL_RESPONSE' } },
            { is_verified: true, resource_capabilities: { name: 'FIRST_AID' } },
          ],
        },
      ]);

    const result = await service.getRecommendations('inc-fire', 'user-1', 'DISPATCHER');

    expect(result).toHaveLength(2);
    const first = result[0]!;
    const second = result[1]!;
    expect(first.rank).toBe(1);
    expect(first.resourceId).toBe('fire-truck-1');
    expect(second.resourceId).toBe('ambulance-1');
    expect(first.score).toBeGreaterThan(second.score);
  });

  it('fires audit log with READ action (non-blocking)', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue({
      id: 'inc-2',
      category: 'MEDICAL',
      incident_locations: null,
    });

    // Provide one resource so the function does not short-circuit the early
    // "no candidates" return path — audit is only emitted after ranking.
    mockPrisma.resources.findMany
      .mockResolvedValueOnce([{ id: 'amb-1' }])
      .mockResolvedValueOnce([
        {
          id: 'amb-1',
          name: 'Ambulance 1',
          call_sign: null,
          resource_type: 'AMBULANCE',
          organization_id: 'org-1',
          status: 'AVAILABLE',
          resource_capability_assignments: [],
        },
      ]);

    await service.getRecommendations('inc-2', 'dispatcher-1', 'DISPATCHER');

    // Audit is fire-and-forget — flush pending microtasks before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'READ', actorId: 'dispatcher-1' }),
    );
  });

  it('includes response is assistive note (rationale present)', async () => {
    mockPrisma.incident.findUnique.mockResolvedValue({
      id: 'inc-3',
      category: 'FLOOD',
      incident_locations: null,
    });

    mockPrisma.resources.findMany
      .mockResolvedValueOnce([{ id: 'boat-1' }])
      .mockResolvedValueOnce([
        {
          id: 'boat-1',
          name: 'Rescue Boat Alpha',
          call_sign: 'RB-A',
          resource_type: 'RESCUE_BOAT',
          organization_id: 'org-1',
          status: 'AVAILABLE',
          resource_capability_assignments: [
            { is_verified: true, resource_capabilities: { name: 'WATER_RESCUE' } },
            { is_verified: true, resource_capabilities: { name: 'BOAT_OPERATION' } },
          ],
        },
      ]);

    const result = await service.getRecommendations('inc-3', 'user-1', 'DISPATCHER');
    const first = result[0]!;
    expect(first.rationale).toBeTruthy();
    expect(first.requiredCapabilities).toEqual(CAPABILITY_MATRIX['FLOOD'] ?? []);
  });
});
