import { simplifyLine } from '../../src/locations/maps/simplify-line';

describe('simplifyLine (plan §13.2: ≤ 300 points)', () => {
  it('returns a short line unchanged', () => {
    const line: [number, number][] = [[120.92, 14.79], [120.93, 14.8], [120.94, 14.79]];
    expect(simplifyLine(line)).toBe(line);
  });

  it('caps a long line at maxPoints, keeping both ends and the order', () => {
    const line = Array.from({ length: 2000 }, (_, i): [number, number] => [120.9 + i * 1e-5, 14.79 + Math.sin(i / 50) * 1e-3]);

    const out = simplifyLine(line, 300);

    expect(out.length).toBe(300);
    expect(out[0]).toBe(line[0]);
    expect(out.at(-1)).toBe(line.at(-1));
    const indexes = out.map((p) => line.indexOf(p));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('keeps the corner of an L-shaped route first', () => {
    // East along a street, then north: the corner is the one point that matters.
    const east = Array.from({ length: 50 }, (_, i): [number, number] => [120.9 + i * 1e-4, 14.79]);
    const north = Array.from({ length: 50 }, (_, i): [number, number] => [120.9049, 14.79 + (i + 1) * 1e-4]);
    const line = [...east, ...north];

    expect(simplifyLine(line, 3)).toEqual([line[0], east.at(-1), line.at(-1)]);
  });

  it('drops collinear points before bends', () => {
    const line: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]];
    expect(simplifyLine(line, 3)).toEqual([[0, 0], [3, 0], [3, 2]]);
  });

  it('never returns fewer than the two ends', () => {
    const line: [number, number][] = [[0, 0], [1, 1], [2, 0], [3, 1]];
    expect(simplifyLine(line, 1)).toEqual([[0, 0], [3, 1]]);
  });
});
