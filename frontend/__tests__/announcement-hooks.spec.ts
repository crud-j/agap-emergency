jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));

jest.mock('@/lib/use-auth', () => ({
  ...jest.requireActual('@/lib/use-auth'),
  useAuthUser: jest.fn(),
}));

import { useQuery } from '@tanstack/react-query';
import { useAuthUser } from '@/lib/use-auth';
import { useAnnouncements } from '@/features/announcements/hooks';

const mockedUseQuery = jest.mocked(useQuery);
const mockedUseAuthUser = jest.mocked(useAuthUser);

describe('useAnnouncements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables the publisher query for a dispatcher', () => {
    mockedUseAuthUser.mockReturnValue({ id: 'dispatcher-1', role: 'DISPATCHER' });

    useAnnouncements({ status: 'PUBLISHED' });

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['announcements', 'publisher', { status: 'PUBLISHED' }],
        enabled: false,
      }),
    );
  });

  it.each(['ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR'])(
    'enables the publisher query for %s',
    (role) => {
      mockedUseAuthUser.mockReturnValue({ id: 'publisher-1', role });

      useAnnouncements({ status: 'PUBLISHED' });

      expect(mockedUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['announcements', 'publisher', { status: 'PUBLISHED' }],
          enabled: true,
        }),
      );
    },
  );
});
