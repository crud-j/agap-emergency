import { PrivacyService } from '../../src/privacy/privacy.service';

/** MOD-48 — a citizen sees who opened their sensitive data, not what they opened. */
describe('PrivacyService.getAccessLog', () => {
  it("lists access to the citizen's own medical profile, with the accessor's role only", async () => {
    const prisma = {
      medicalProfile: { findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      sensitive_data_access_log: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'log-1', accessor_id: 'resp-9', data_type: 'MEDICAL_PROFILE', entity_id: 'profile-1',
            purpose: 'Responder incident access', incident_id: null, accessed_at: new Date(), users: { role: 'RESPONDER' } },
        ]),
      },
    };
    const service = new PrivacyService(prisma as any, {} as any);

    const rows = await service.getAccessLog('citizen-1');

    expect(prisma.sensitive_data_access_log.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { entity_id: { in: ['citizen-1', 'profile-1'] } },
    }));
    expect(rows[0]).toMatchObject({ data_type: 'MEDICAL_PROFILE', accessor_role: 'RESPONDER' });
    expect(rows[0]).not.toHaveProperty('accessor_id');
    expect(rows[0]).not.toHaveProperty('users');
  });
});
