// Outlines that came from Illustrator's Outline Stroke or Expand: each drawn line became a thin filled band,
// the same outline twice, a stroke's width apart. Read even-odd, such a shape is only those bands, with almost
// no room inside for veins. So each pair of nested outlines that stay the same small distance apart all the way
// round is read as the one line it came from: a boundary keeps its inner edge and a hole keeps its outer edge,
// so veins stay clear of the drawn line on both sides. Gil's TestingShapes (2026-11-18) are drawn this way.
import { boxOf, eachOverlap, pointInRing, signedArea, toSegment, type Box, type Ring } from './geometry'

export type Merged = { rings: Ring[]; pairs: number; width: number }

// A band is at most this share of its outline's size wide (the diagonal of its box)…
const THIN = 0.03
// …and about as wide all the way round: nine in ten of its widths are within this many times the typical one.
// Corners stretch a few, as a mitred corner sticks out further than the band is wide.
const EVEN = 2
// Smaller outlines in the same file whose band is this close to the typical width found are lines too, even
// when they are too small for the share above: a 10 mm circle drawn with a 1 mm stroke is still a line.
const SAME = 0.35

// n points spread evenly round a ring by length, each in the middle of its stretch, so a long straight side drawn
// with two points counts as much as a curve drawn with hundreds. inward: how far to move each point off the
// outline, square to it, toward the ring's inside.
function samples(ring: Ring, n: number, inward = 0): Ring {
  const m = ring.length
  if (m < 3) return ring.slice()
  const lengths = new Float64Array(m)
  let total = 0
  for (let i = 0; i < m; i++) { const a = ring[i], b = ring[(i + 1) % m]; lengths[i] = Math.hypot(b[0] - a[0], b[1] - a[1]); total += lengths[i] }
  if (!(total > 0)) return [ring[0]]
  // The inside is to the left of the way round when the signed area is positive.
  const hair = signedArea(ring) >= 0 ? inward : -inward
  const out: Ring = []
  let i = 0, walked = 0
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) / n) * total
    while (i < m - 1 && walked + lengths[i] < target) { walked += lengths[i]; i++ }
    const a = ring[i], b = ring[(i + 1) % m], t = lengths[i] > 0 ? Math.min(1, (target - walked) / lengths[i]) : 0
    const L = lengths[i] || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L
    out.push([a[0] + (b[0] - a[0]) * t + nx * hair, a[1] + (b[1] - a[1]) * t + ny * hair])
  }
  return out
}

// Whether ring a lies inside ring b, by most of a's points. One point alone can sit exactly on b, as the two
// edges of an outlined stroke often start at the same point. The points are taken a hair inside a, so a ring
// that runs along b's edge, as art trimmed to the sheet runs along the sheet's, is judged by the side it's on.
export function ringInside(a: Ring, b: Ring): boolean {
  const [x0, y0, x1, y1] = boxOf([a])
  const pts = samples(a, 16, 1e-7 * Math.hypot(x1 - x0, y1 - y0))
  return pts.filter(([x, y]) => pointInRing(b, x, y)).length * 2 > pts.length
}

// How many other rings each ring lies inside: even for an outline, odd for a hole. Rings whose boxes don't meet
// can't be nested, and aren't compared.
export function ringDepths(rings: Ring[]): number[] {
  const depths = rings.map(() => 0)
  eachOverlap(rings.map(r => boxOf([r])), (i, j) => {
    if (ringInside(rings[i], rings[j])) depths[i]++
    if (ringInside(rings[j], rings[i])) depths[j]++
  })
  return depths
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

// Whether any two outlines cross each other (not just touch, as tiles sharing a side do). Read even-odd, the part
// two crossing outlines share is a hole, which a drawing of separate overlapping shapes doesn't mean. Gives up,
// saying no, after a few million edge tests on a very detailed drawing.
export function outlinesCross(rings: Ring[]): boolean {
  const boxes = rings.map(r => boxOf([r]))
  const side = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  let budget = 4_000_000, crossing = false
  eachOverlap(boxes, (i, j) => {
    const a = rings[i], b = rings[j]
    for (let p = 0; p < a.length; p++) {
      const [ax, ay] = a[p], [bx, by] = a[(p + 1) % a.length]
      const ex0 = Math.min(ax, bx), ex1 = Math.max(ax, bx), ey0 = Math.min(ay, by), ey1 = Math.max(ay, by)
      if (ex1 < boxes[j][0] || ex0 > boxes[j][2] || ey1 < boxes[j][1] || ey0 > boxes[j][3]) continue
      for (let q = 0; q < b.length; q++) {
        if (--budget < 0) return true
        const [cx, cy] = b[q], [dx, dy] = b[(q + 1) % b.length]
        if (Math.max(cx, dx) < ex0 || Math.min(cx, dx) > ex1 || Math.max(cy, dy) < ey0 || Math.min(cy, dy) > ey1) continue
        if (side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0 && side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0) { crossing = true; return true }
      }
    }
  })
  return crossing
}

// elements: which element of the file each ring came from. An outlined stroke is one compound path, so only rings
// of the same element pair up: a panel drawn on its own, set in a frame's opening with an even gap all round,
// stays a panel.
export function mergeStrokeBands(rings: Ring[], elements?: number[]): Merged {
  const n = rings.length
  const area = rings.map(r => Math.abs(signedArea(r)))
  const box = rings.map(r => boxOf([r]))
  const size = box.map(([x0, y0, x1, y1]) => Math.hypot(x1 - x0, y1 - y0))
  const taken = new Uint8Array(n)
  const pairs: { outer: number; inner: number; width: number }[] = []

  // Pairs of an outer ring a and a smaller ring b inside it, whose band is even, at most `widest` wide, and `fits`.
  const find = (widest: (a: number) => number, fits: (typical: number) => boolean) => {
    const found: { outer: number; inner: number; width: number }[] = []
    const limits = rings.map((_, i) => widest(i))
    const test = (a: number, b: number) => {
      if (taken[a] || taken[b] || !(area[b] < area[a]) || (elements && elements[a] !== elements[b])) return
      const limit = limits[a]
      // Cheap tests first: a band's two edges have boxes nearly alike, mitred corners allowing.
      if (!boxWithin(box[b], box[a], limit) || boxGap(box[a], box[b]) > limit * 6) return
      if (!ringInside(rings[b], rings[a])) return
      const { typical, most } = band(rings[a], rings[b])
      if (typical > 0 && most <= limit && most <= EVEN * typical && fits(typical)) found.push({ outer: a, inner: b, width: typical })
    }
    eachOverlap(box, (i, j) => { test(i, j); test(j, i) }, i => limits[i])
    // Narrowest first, each ring in one pair at most; equal widths in the order of the file.
    found.sort((p, q) => p.width - q.width || p.outer - q.outer || p.inner - q.inner)
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
  const depth = ringDepths(units.map(u => rings[u.outer]))
  const out = units.map((u, k) => (u.inner === null ? rings[u.outer] : depth[k] % 2 === 0 ? rings[u.inner] : rings[u.outer]))
  return { rings: out, pairs: pairs.length, width }
}
