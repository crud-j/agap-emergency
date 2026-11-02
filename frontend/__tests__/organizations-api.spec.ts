import { api } from '@/lib/api';
import { fetchOrganizations, type Organization } from '@/features/organizations/api';

// Keep the real asPaginated; only the HTTP call is stubbed.
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { get: jest.fn() },
}));

const get = api.get as jest.Mock;

function org(id: string, name: string, type: string): Organization {
  return {
    id,
    name,
    short_name: null,
    organization_type: type,
    barangay: null,
    contact_number: null,
    email: null,
    address: null,
    is_active: true,
    created_at: '2026-11-02T00:00:00.000Z',
  };
}

const ORGS = [
  org('o1', 'Bocaue MDRRMO', 'MDRRMO'),
  org('o2', 'BFP Bocaue', 'FIRE_SERVICE'),
  org('o3', 'Bocaue Hospital', 'HOSPITAL'),
];

describe('fetchOrganizations (MOD-26)', () => {
  beforeEach(() => get.mockReset());

  it('wraps the plain array GET /organizations returns', async () => {
    get.mockResolvedValue(ORGS);
    const result = await fetchOrganizations({ perPage: 200 });
    expect(result.data).toEqual(ORGS);
    expect(result.meta).toEqual({
      total: 3, page: 1, perPage: 3, totalPages: 1, hasNext: false, hasPrev: false,
    });
    expect(get.mock.calls[0][0]).toBe('/organizations?perPage=200');
  });

  it('wraps an empty array into an empty page', async () => {
    get.mockResolvedValue([]);
    const result = await fetchOrganizations();
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('returns an already-paginated body unchanged', async () => {
    const paged = {
      data: ORGS.slice(0, 2),
      meta: { total: 3, page: 1, perPage: 2, totalPages: 2, hasNext: true, hasPrev: false },
    };
    get.mockResolvedValue(paged);
    expect(await fetchOrganizations({ page: 1, perPage: 2 })).toBe(paged);
  });
});
