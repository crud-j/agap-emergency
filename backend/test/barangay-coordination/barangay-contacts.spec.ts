import {
  ADMIN_SOURCE,
  BarangayContactNotFoundError,
  BarangayContactRefusedError,
  BarangayContactsService,
} from '../../src/barangay-coordination/barangay-contacts.service';

/** Phase 6: MDRRMO edits the barangay phone directory. */

interface Row {
  id: string;
  barangay_id: string;
  phone_e164: string;
  phone_raw: string | null;
  kind: 'MOBILE' | 'LANDLINE';
  can_sms: boolean;
  role: 'PRIMARY' | 'BACKUP' | 'OTHER';
  label: string | null;
  is_active: boolean;
  is_demo: boolean;
  verified_at: Date | null;
  source: string | null;
  updated_at: Date;
  created_at: Date;
}

const row = (over: Partial<Row>): Row => ({
  id: 'c-x',
  barangay_id: 'BATIA',
  phone_e164: '+639170000000',
  phone_raw: null,
  kind: 'MOBILE',
  can_sms: true,
  role: 'OTHER',
  label: null,
  is_active: true,
  is_demo: false,
  verified_at: null,
  source: 'facebook-poster-2026-08-29',
  updated_at: new Date(),
  created_at: new Date(),
  ...over,
});

/**
 * In-memory barangay_contacts that enforces the same rules as Postgres: the CHECKs and
 * the partial unique indexes (one active PRIMARY and one active BACKUP per barangay).
 * A wrong update order inside a swap fails here exactly as it would in the database.
 */
function fakeDb(initial: Row[]) {
  const rows = initial.map((r) => ({ ...r }));
  let seq = 0;
  const check = () => {
    for (const role of ['PRIMARY', 'BACKUP'] as const) {
      const seen = new Set<string>();
      for (const r of rows.filter((x) => x.is_active && x.role === role)) {
        if (seen.has(r.barangay_id)) throw new Error(`unique violation: two active ${role} in ${r.barangay_id}`);
        seen.add(r.barangay_id);
      }
    }
    for (const r of rows) {
      if (r.can_sms && r.kind !== 'MOBILE') throw new Error('check violation: sms_kind');
      if (r.role !== 'OTHER' && !r.can_sms) throw new Error('check violation: alert_role');
    }
  };
  const matches = (r: Row, where: any) =>
    Object.entries(where ?? {}).every(([k, v]: [string, any]) =>
      v && typeof v === 'object' && 'not' in v ? (r as any)[k] !== v.not : (r as any)[k] === v,
    );
  const contacts = {
    findMany: jest.fn(async () => rows.map((r) => ({ ...r }))),
    findFirst: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
    findUnique: jest.fn(async ({ where }: any) => {
      const key = where.barangay_id_phone_e164;
      const r = key ? rows.find((x) => x.barangay_id === key.barangay_id && x.phone_e164 === key.phone_e164) : rows.find((x) => x.id === where.id);
      return r ? { ...r } : null;
    }),
    create: jest.fn(async ({ data }: any) => {
      const r = row({ ...data, id: `new-${++seq}`, is_active: true, is_demo: false, verified_at: null });
      rows.push(r);
      check();
      return { ...r };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      check();
      return { ...r };
    }),
  };
  const prisma: any = {
    barangay_contacts: contacts,
    geo_regions: {
      findFirst: jest.fn(async ({ where }: any) => (['BATIA', 'BUNLO'].includes(where.id) ? { id: where.id } : null)),
      findMany: jest.fn(async () => [{ id: 'BATIA', name: 'Batia' }, { id: 'BUNLO', name: 'Bunlo' }]),
    },
    // No rollback in the fake; the service's own checks run before any write.
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, rows, byId: (id: string) => rows.find((r) => r.id === id)! };
}

function build(initial: Row[]) {
  const db = fakeDb(initial);
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  return { ...db, audit, service: new BarangayContactsService(db.prisma, audit) };
}

const PRIMARY = () => row({ id: 'p', phone_e164: '+639171111111', role: 'PRIMARY' });
const BACKUP = () => row({ id: 'b', phone_e164: '+639182222222', role: 'BACKUP' });
const OTHER = () => row({ id: 'o', phone_e164: '+639193333333', role: 'OTHER' });
const LANDLINE = () => row({ id: 'l', phone_e164: '+63447692412', kind: 'LANDLINE', can_sms: false });

describe('BarangayContactsService.listAll', () => {
  it('groups every contact under its barangay, including barangays with none', async () => {
    const { service } = build([PRIMARY(), row({ id: 'z', barangay_id: 'BUNLO' })]);
    const list = await service.listAll();
    expect(list.map((b) => [b.id, b.contacts.map((c) => c.id)])).toEqual([
      ['BATIA', ['p']],
      ['BUNLO', ['z']],
    ]);
  });
});

describe('BarangayContactsService.create', () => {
  it('normalizes the number, marks it admin-added, and audits it', async () => {
    const { service, audit } = build([]);
    const c = await service.create({ barangayId: 'BATIA', phone: '0969 478 4013', role: 'PRIMARY', label: ' BDRRMC chair ' }, 'admin-1');
    expect(c).toMatchObject({
      phone_e164: '+639694784013',
      phone_raw: '0969 478 4013',
      kind: 'MOBILE',
      can_sms: true,
      role: 'PRIMARY',
      label: 'BDRRMC chair',
      source: ADMIN_SOURCE,
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', actorId: 'admin-1', entityType: 'barangay_contact' }));
  });

  it('moves the current primary to Other when a new primary is added', async () => {
    const { service, byId, audit } = build([PRIMARY(), BACKUP()]);
    await service.create({ barangayId: 'BATIA', phone: '09694784013', role: 'PRIMARY' }, 'admin-1');
    expect(byId('p').role).toBe('OTHER');
    expect(byId('b').role).toBe('BACKUP');
    expect(audit.log).toHaveBeenCalledTimes(2); // the new contact + the moved one
  });

  it('accepts a landline only as Other', async () => {
    const { service } = build([]);
    await expect(service.create({ barangayId: 'BATIA', phone: '044 769 2412', role: 'PRIMARY' }, 'a')).rejects.toThrow(
      BarangayContactRefusedError,
    );
    await expect(service.create({ barangayId: 'BATIA', phone: '044 769 2412', role: 'OTHER' }, 'a')).resolves.toMatchObject({
      kind: 'LANDLINE',
      can_sms: false,
    });
  });

  it.each(['769-2412', '(044) 07924300', 'abc', '0917'])('refuses the invalid number %p', async (phone) => {
    const { service } = build([]);
    await expect(service.create({ barangayId: 'BATIA', phone, role: 'OTHER' }, 'a')).rejects.toThrow(BarangayContactRefusedError);
  });

  it('refuses a duplicate, and says to reactivate an inactive one', async () => {
    const { service } = build([PRIMARY(), row({ id: 'gone', phone_e164: '+639694784013', is_active: false })]);
    await expect(service.create({ barangayId: 'BATIA', phone: '0917 111 1111', role: 'OTHER' }, 'a')).rejects.toThrow(/already on file/);
    await expect(service.create({ barangayId: 'BATIA', phone: '09694784013', role: 'OTHER' }, 'a')).rejects.toThrow(/Reactivate/);
  });

  it('refuses an unknown barangay', async () => {
    const { service } = build([]);
    await expect(service.create({ barangayId: 'NOWHERE', phone: '09694784013', role: 'OTHER' }, 'a')).rejects.toThrow(
      BarangayContactNotFoundError,
    );
  });
});

describe('BarangayContactsService.update', () => {
  it('swaps primary and backup in one action', async () => {
    const { service, byId } = build([PRIMARY(), BACKUP()]);
    await service.update('b', { role: 'PRIMARY' }, 'a');
    expect(byId('b').role).toBe('PRIMARY');
    expect(byId('p').role).toBe('BACKUP');
  });

  it('swaps the other way too', async () => {
    const { service, byId } = build([PRIMARY(), BACKUP()]);
    await service.update('p', { role: 'BACKUP' }, 'a');
    expect(byId('p').role).toBe('BACKUP');
    expect(byId('b').role).toBe('PRIMARY');
  });

  it('moves the primary to Other when an Other number is promoted', async () => {
    const { service, byId } = build([PRIMARY(), BACKUP(), OTHER()]);
    await service.update('o', { role: 'PRIMARY' }, 'a');
    expect(byId('o').role).toBe('PRIMARY');
    expect(byId('p').role).toBe('OTHER');
    expect(byId('b').role).toBe('BACKUP');
  });

  it('frees the slot when a number is deactivated, and reactivates it as Other', async () => {
    const { service, byId } = build([PRIMARY(), OTHER()]);
    await service.update('p', { isActive: false }, 'a');
    expect(byId('p')).toMatchObject({ is_active: false, role: 'OTHER' });
    await service.update('o', { role: 'PRIMARY' }, 'a');
    await service.update('p', { isActive: true }, 'a');
    expect(byId('p')).toMatchObject({ is_active: true, role: 'OTHER' });
    expect(byId('o').role).toBe('PRIMARY');
  });

  it('reactivates straight into a slot, moving the holder to Other', async () => {
    const { service, byId } = build([row({ id: 'old', phone_e164: '+639694784013', is_active: false }), PRIMARY()]);
    await service.update('old', { isActive: true, role: 'PRIMARY' }, 'a');
    expect(byId('old')).toMatchObject({ is_active: true, role: 'PRIMARY' });
    expect(byId('p').role).toBe('OTHER');
  });

  it('refuses to make a landline primary or backup', async () => {
    const { service } = build([LANDLINE()]);
    await expect(service.update('l', { role: 'BACKUP' }, 'a')).rejects.toThrow(BarangayContactRefusedError);
  });

  it('sets and clears the MDRRMO confirmation, the label and the demo flag', async () => {
    const { service, byId } = build([row({ id: 'd', is_demo: true })]);
    await service.update('d', { verified: true, label: 'Kagawad', isDemo: false }, 'a');
    expect(byId('d').verified_at).toBeInstanceOf(Date);
    expect(byId('d')).toMatchObject({ label: 'Kagawad', is_demo: false });
    await service.update('d', { verified: false, label: '   ' }, 'a');
    expect(byId('d')).toMatchObject({ verified_at: null, label: null });
  });

  it('audits the before and after values', async () => {
    const { service, audit } = build([PRIMARY(), BACKUP()]);
    await service.update('b', { role: 'PRIMARY' }, 'admin-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        actorId: 'admin-1',
        entityId: 'b',
        oldValues: expect.objectContaining({ role: 'BACKUP' }),
        newValues: expect.objectContaining({ role: 'PRIMARY' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'p', oldValues: { role: 'PRIMARY' }, newValues: expect.objectContaining({ role: 'BACKUP' }) }),
    );
  });

  it('404s an unknown contact', async () => {
    const { service } = build([]);
    await expect(service.update('nope', { label: 'x' }, 'a')).rejects.toThrow(BarangayContactNotFoundError);
  });
});
