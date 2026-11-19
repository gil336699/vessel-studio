// Outlines that came from Illustrator's Outline Stroke or Expand: each drawn line became a thin filled band,
// the same outline twice, a stroke's width apart. Read even-odd, such a shape is only those bands, with almost
// no room inside for veins. So each pair of nested outlines that stay the same small distance apart all the way
// round is read as the one line it came from: a boundary keeps its inner edge and a hole keeps its outer edge,
// so veins stay clear of the drawn line on both sides. Gil's TestingShapes (2026-11-18) are drawn this way.
import { boxesOverlap, boxOf, signedArea, toSegment, type Box, type Ring } from './geometry'

export type Merged = { rings: Ring[]; pairs: number; width: number }

// A band is at most this share of its outline's size wide (the diagonal of its box)…
const THIN = 0.03
// …and about as wide all the way round: nine in ten of its widths are within this many times the typical one.
// Corners stretch a few, as a mitred corner sticks out further than the band is wide.
const EVEN = 2
// Smaller outlines in the same file whose band is this close to the typical width found are lines too, even
// when they are too small for the share above: a 10 mm circle drawn with a 1 mm stroke is still a line.
const SAME = 0.35

// Up to n points spread evenly round a ring.
function samples(ring: Ring, n: number): Ring {
  const step = Math.max(1, Math.floor(ring.length / n))
  const out: Ring = []
  for (let i = 0; i < ring.length && out.length < n; i += step) out.push(ring[i])
  return out
}

function inRing(ring: Ring, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside
  }
  return inside
}

// Whether ring a lies inside ring b, by most of a's points. One point alone can sit exactly on b, as the two
// edges of an outlined stroke often start at the same point.
export function ringInside(a: Ring, b: Ring): boolean {
  const pts = samples(a, 16)
  return pts.filter(([x, y]) => inRing(b, x, y)).length * 2 > pts.length
}

// Distances from points spread round ring a to ring b's outline.
function distances(a: Ring, b: Ring, out: number[]): void {
  for (const [x, y] of samples(a, 48)) {
    let best = Infinity
    for (let i = 0; i < b.length; i++) {
      const p = b[i], q = b[(i + 1) % b.length]
      const d = toSegment(x, y, p[0], p[1], q[0], q[1]).d
      if (d < best) best = d
    }
    out.push(best)
  }
}

// The typical width of the band between ring a and ring b inside it, and nine in ten of its widths.
function band(a: Ring, b: Ring): { typical: number; most: number } {
  const ds: number[] = []
  distances(b, a, ds)
  distances(a, b, ds)
  ds.sort((p, q) => p - q)
  return { typical: ds[Math.floor(ds.length / 2)], most: ds[Math.floor(ds.length * 0.9)] }
}

// How far apart two boxes' edges are, at most, and whether box b lies inside box a, give or take.
const boxGap = (a: Box, b: Box) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]))
const boxWithin = (b: Box, a: Box, slack: number) => b[0] >= a[0] - slack && b[1] >= a[1] - slack && b[2] <= a[2] + slack && b[3] <= a[3] + slack

export function mergeStrokeBands(rings: Ring[]): Merged {
  const n = rings.length
  const area = rings.map(r => Math.abs(signedArea(r)))
  const box = rings.map(r => boxOf([r]))
  const size = box.map(([x0, y0, x1, y1]) => Math.hypot(x1 - x0, y1 - y0))
  const taken = new Uint8Array(n)
  const pairs: { outer: number; inner: number; width: number }[] = []

  // Pairs of an outer ring a and a smaller ring b inside it, whose band is even, at most `widest` wide, and `fits`.
  const find = (widest: (a: number) => number, fits: (typical: number) => boolean) => {
    const found: { outer: number; inner: number; width: number }[] = []
    for (let a = 0; a < n; a++) {
      if (taken[a]) continue
      const limit = widest(a)
      for (let b = 0; b < n; b++) {
        if (b === a || taken[b] || !(area[b] < area[a])) continue
        // Cheap tests first: a band's two edges have boxes nearly alike, mitred corners allowing.
        if (!boxWithin(box[b], box[a], limit) || boxGap(box[a], box[b]) > limit * 6) continue
        if (!ringInside(rings[b], rings[a])) continue
        const { typical, most } = band(rings[a], rings[b])
        if (typical > 0 && most <= limit && most <= EVEN * typical && fits(typical)) found.push({ outer: a, inner: b, width: typical })
      }
    }
    // Narrowest first, each ring in one pair at most.
    found.sort((p, q) => p.width - q.width)
    for (const f of found) {
      if (taken[f.outer] || taken[f.inner]) continue
      taken[f.outer] = 1; taken[f.inner] = 1
      pairs.push(f)
    }
  }
  find(a => THIN * size[a], () => true)
  if (!pairs.length) return { rings, pairs: 0, width: 0 }
  const widths = pairs.map(p => p.width).sort((p, q) => p - q)
  const width = widths[Math.floor(widths.length / 2)]
  find(() => width * (1 + SAME) * EVEN, typical => Math.abs(typical - width) <= SAME * width)

  // Each pair, and each ring on its own, is one outline; how deeply it's nested decides boundary or hole.
  const units = [
    ...pairs.map(p => ({ outer: p.outer, inner: p.inner as number | null })),
    ...rings.map((_, i) => i).filter(i => !taken[i]).map(i => ({ outer: i, inner: null as number | null })),
  ]
  const out = units.map(u => {
    if (u.inner === null) return rings[u.outer]
    const depth = units.filter(o => o !== u && boxesOverlap(box[u.outer], box[o.outer]) && ringInside(rings[u.outer], rings[o.outer])).length
    return depth % 2 === 0 ? rings[u.inner] : rings[u.outer]
  })
  return { rings: out, pairs: pairs.length, width }
}
