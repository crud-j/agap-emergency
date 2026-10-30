/**
 * Douglas–Peucker simplification of a [lng, lat] polyline down to at most
 * `maxPoints` points (plan §13.2: route geometry is broadcast at ≤ 300 points).
 * The first and last points are always kept and the order never changes.
 *
 * Each interior point is ranked by the deviation at which Douglas–Peucker would
 * keep it (capped by its parent's, so a point never outranks its parent); the
 * top-ranked points are returned, ties going to the earlier point. Distances use degrees with longitude scaled
 * by cos(latitude), which is accurate enough at a municipality's scale.
 */
export function simplifyLine(points: [number, number][], maxPoints = 300): [number, number][] {
  const n = points.length;
  if (n <= maxPoints || n <= 2) return points;
  const keep = Math.max(2, maxPoints);

  const rank = new Float64Array(n);
  rank[0] = Infinity;
  rank[n - 1] = Infinity;
  const stack: Array<[number, number, number]> = [[0, n - 1, Infinity]];
  while (stack.length > 0) {
    const [a, b, parentRank] = stack.pop()!;
    if (b - a < 2) continue;
    let best = a + 1;
    let bestDistance = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(points[i]!, points[a]!, points[b]!);
      if (d > bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    const r = Math.min(bestDistance, parentRank);
    rank[best] = r;
    stack.push([a, best, r], [best, b, r]);
  }

  return Array.from({ length: n }, (_, i) => i)
    // Highest rank first; compare, don't subtract (the endpoints are both Infinity).
    .sort((x, y) => (rank[y]! > rank[x]! ? 1 : rank[y]! < rank[x]! ? -1 : x - y))
    .slice(0, keep)
    .sort((x, y) => x - y)
    .map((i) => points[i]!);
}

/** Distance from p to the segment a–b, in degrees (longitude scaled by cos latitude). */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const scale = Math.cos((a[1] * Math.PI) / 180);
  const px = p[0] * scale, py = p[1];
  const ax = a[0] * scale, ay = a[1];
  const bx = b[0] * scale, by = b[1];
  const dx = bx - ax, dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
