import { api } from '@/lib/api';
import { approveIdReview, findIdCardHolder } from '@/features/identity-verification/api';
import { useApproveIdReview, useFindIdCardHolder } from '@/features/identity-verification/hooks';

// Only the HTTP call is stubbed: these pin what the staff pages put in each request (National ID plan §7).
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { post: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({ getToken: () => 'token' }));
// No DOM or React renderer here: useMutation hands back its options, so the hooks' settings can be read.
jest.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => options,
  useQuery: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const post = api.post as jest.Mock;

describe('ID review API (National ID plan §7)', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({});
  });

  it('sends a typed card number in the body on approve, never in the URL', async () => {
    await approveIdReview('row-1', '0000-0000-0000-0001');
    expect(post).toHaveBeenCalledWith('/administration/id-verifications/row-1/approve', { cardNumber: '0000-0000-0000-0001' }, 'token');
    expect(post.mock.calls[0][0]).not.toContain('0000');
  });

  it('sends an empty body on approve without a number, as before (PhilHealth rows)', async () => {
    await approveIdReview('row-1');
    expect(post).toHaveBeenCalledWith('/administration/id-verifications/row-1/approve', {}, 'token');
  });

  it('sends the chosen ID with the number on a card lookup, both in the body', async () => {
    await findIdCardHolder('0000-0000-0000-0001', 'NATIONAL_ID');
    expect(post).toHaveBeenCalledWith(
      '/administration/id-verifications/find-by-pin',
      { pin: '0000-0000-0000-0001', documentType: 'NATIONAL_ID' },
      'token',
    );
    await findIdCardHolder('00-000000001-0', 'PHILHEALTH');
    expect(post).toHaveBeenLastCalledWith(
      '/administration/id-verifications/find-by-pin',
      { pin: '00-000000001-0', documentType: 'PHILHEALTH' },
      'token',
    );
  });

  it('keeps no typed number in the mutation cache: both hooks that carry one use gcTime 0', async () => {
    const approve = useApproveIdReview() as unknown as { gcTime: number; mutationFn: (v: { id: string; cardNumber?: string }) => Promise<unknown> };
    const find = useFindIdCardHolder() as unknown as { gcTime: number; mutationFn: (v: { pin: string; documentType: 'NATIONAL_ID' }) => Promise<unknown> };
    expect(approve.gcTime).toBe(0);
    expect(find.gcTime).toBe(0);

    await approve.mutationFn({ id: 'row-2', cardNumber: '0000-0000-0000-0002' });
    expect(post).toHaveBeenLastCalledWith('/administration/id-verifications/row-2/approve', { cardNumber: '0000-0000-0000-0002' }, 'token');
    await find.mutationFn({ pin: '0000-0000-0000-0002', documentType: 'NATIONAL_ID' });
    expect(post).toHaveBeenLastCalledWith(
      '/administration/id-verifications/find-by-pin',
      { pin: '0000-0000-0000-0002', documentType: 'NATIONAL_ID' },
      'token',
    );
  });
});
