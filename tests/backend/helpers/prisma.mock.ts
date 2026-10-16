/**
 * Creates a deep jest mock of PrismaService covering all models used by AGAP services.
 * The $transaction mock handles both the callback pattern and the array pattern.
 */
export function createMockPrisma() {
  const mock = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user_sessions: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user_verifications: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    incident: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    incidentReporter: {
      create: jest.fn(),
    },
    incident_patients: {
      create: jest.fn(),
    },
    incidentEvent: {
      create: jest.fn(),
    },
    incident_locations: {
      create: jest.fn(),
    },
    alert_triggers: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    dispatches: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    resources: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    dispatch_crew: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    responderAvailability: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    location_history: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };

  mock.$transaction.mockImplementation((fnOrArray: unknown) => {
    if (typeof fnOrArray === 'function') {
      return (fnOrArray as (tx: typeof mock) => unknown)(mock);
    }
    return Promise.all(fnOrArray as Promise<unknown>[]);
  });

  return mock;
}

export type MockPrisma = ReturnType<typeof createMockPrisma>;
