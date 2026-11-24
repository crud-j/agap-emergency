import { pageSlots, paginate } from '@/components/ui/pagination';

describe('pagination', () => {
  it('lists every page when there are 7 or fewer', () => {
    expect(pageSlots(1, 1)).toEqual([1]);
    expect(pageSlots(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps first, last and the neighbours, never more than 7 slots', () => {
    expect(pageSlots(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageSlots(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageSlots(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    for (let p = 1; p <= 50; p += 1) expect(pageSlots(p, 50).length).toBeLessThanOrEqual(7);
  });

  it('pages a client-side list and clamps an out-of-range page', () => {
    const rows = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(rows, 3, 10)).toEqual({ rows: [20, 21, 22], totalPages: 3, page: 3 });
    expect(paginate(rows, 9, 10).page).toBe(3);
    expect(paginate([], 1, 10)).toEqual({ rows: [], totalPages: 1, page: 1 });
  });
});
