import { AuditService } from '../../src/audit/audit.service';
import { AuditAction } from '@agap/shared';

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
  },
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService(mockPrisma as any);
    jest.clearAllMocks();
  });

  it('writes audit log entry', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({});
    await service.log({ action: AuditAction.INCIDENT_CREATED, actorId: 'user-1' });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: AuditAction.INCIDENT_CREATED }),
      }),
    );
  });

  it('does not throw when audit log write fails', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('DB error'));
    await expect(
      service.log({ action: AuditAction.INCIDENT_CREATED }),
    ).resolves.not.toThrow();
  });
});
