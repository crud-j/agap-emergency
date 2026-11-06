import { ConflictException } from '@nestjs/common';
import { UsersService } from '../../src/users/users.service';

// MOD-01: "ID verified" must never sit beside a name nobody checked (plan §11 D8).

describe('PATCH /users/me: the name of a verified citizen', () => {
  function makeService(fields: Record<string, unknown>) {
    const stored: Record<string, unknown> = { id: 'user-1', role: 'CITIZEN', full_name: 'Juan Dela Cruz', sex: null, ...fields };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => stored),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(stored, data)),
      },
    };
    return { service: new UsersService(prisma as any, { log: jest.fn() } as any, {} as any), stored };
  }

  const VERIFIED = { identity_verified_at: new Date('2026-11-06T00:00:00.000Z') };

  it('a different name is refused, and nothing in the request is saved', async () => {
    const { service, stored } = makeService(VERIFIED);

    await expect(service.updateMe('user-1', { fullName: 'Someone Else', barangay: 'Turo' })).rejects.toBeInstanceOf(ConflictException);

    expect(stored).toMatchObject({ full_name: 'Juan Dela Cruz' });
    expect(stored).not.toHaveProperty('barangay');
  });

  it('the refusal does not repeat either name', async () => {
    const { service } = makeService(VERIFIED);
    const error: Error = await service.updateMe('user-1', { fullName: 'Someone Else' }).catch((err) => err);
    expect(error.message).not.toMatch(/Someone Else|Juan Dela Cruz/);
  });

  it('the same name passes, so a client that sends the whole profile back still works', async () => {
    const { service, stored } = makeService(VERIFIED);
    await service.updateMe('user-1', { fullName: 'Juan Dela Cruz', barangay: 'Turo' });
    expect(stored).toMatchObject({ full_name: 'Juan Dela Cruz', barangay: 'Turo' });
  });

  it('everything else on the profile can still change', async () => {
    const { service, stored } = makeService(VERIFIED);
    await service.updateMe('user-1', { barangay: 'Turo', textSize: 'large' });
    expect(stored).toMatchObject({ barangay: 'Turo', text_size: 'large' });
  });

  it.each([
    ['a citizen who is not verified', { identity_verified_at: null }],
    ['a staff account', { role: 'DISPATCHER', identity_verified_at: null }],
  ])('%s can still rename', async (_label, fields) => {
    const { service, stored } = makeService(fields);
    await service.updateMe('user-1', { fullName: 'New Name' });
    expect(stored).toMatchObject({ full_name: 'New Name' });
  });
});
