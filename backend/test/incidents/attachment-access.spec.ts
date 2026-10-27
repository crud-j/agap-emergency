import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IncidentsService } from '../../src/incidents/incidents.service';

/** POST /incidents/:id/attachments — only the incident's reporter adds evidence (MOD-10). */
describe('IncidentsService.assertReporter', () => {
  function build(reporter: { user_id: string | null } | null) {
    const prisma = { incidentReporter: { findUnique: jest.fn().mockResolvedValue(reporter) } };
    return new IncidentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('lets the reporter attach', async () => {
    await expect(build({ user_id: 'citizen-1' }).assertReporter('inc-1', 'citizen-1')).resolves.toBeUndefined();
  });

  it('refuses any other account', async () => {
    await expect(build({ user_id: 'citizen-1' }).assertReporter('inc-1', 'citizen-2'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a guest report (no account owns it)', async () => {
    await expect(build({ user_id: null }).assertReporter('inc-1', 'citizen-2'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 for an unknown incident', async () => {
    await expect(build(null).assertReporter('missing', 'citizen-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
