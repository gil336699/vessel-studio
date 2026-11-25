// The grown veins as drawable pieces: vein widths by Murray's law, the veins split into paths between forks,
// and the numbers the measurements panel shows. Plain functions of the points, so the page, the exports and
// the tests all agree.
import type { Vec } from './geometry'
import { segmentDistance, type Region } from './region'

export type WidthRule = 'murray' | 'even'
export type WidthSettings = { rule: WidthRule; tip: number; max: number; exponent: number }

// How many vein ends each point feeds (the pipe model). A point is only added after its parent, so walking the
// indices downward visits every child before its parent. Points `keep` leaves out (0) feed nothing.
export function feeds(parent: ArrayLike<number>, n: number, keep?: Uint8Array | null): Float64Array {
  const q = new Float64Array(n)
  for (let v = n - 1; v >= 0; v--) {
    if (keep && !keep[v]) continue
    if (q[v] === 0) q[v] = 1
    const p = parent[v]
    if (p >= 0) q[p] += q[v]
  }
  return q
}

// Width (mm) of the vein from each point's parent to the point. Murray's law: at each fork the parent's
// width^n is the sum of its children's, starting from the tip width at every end, so a vein feeding m ends is
// tip × m^(1/n) wide. Even gives every vein the tip width, for pen plotters.
export function veinWidths(parent: ArrayLike<number>, n: number, w: WidthSettings, keep?: Uint8Array | null): Float64Array {
  const out = new Float64Array(n)
  if (w.rule === 'even') return out.fill(w.tip)
  const q = feeds(parent, n, keep)
  const inv = 1 / Math.max(1, w.exponent)
  for (let v = 0; v < n; v++) out[v] = Math.min(Math.max(w.tip, w.max), w.tip * q[v] ** inv)
  return out
}

// The widest vein drawn. Each vein from a point is drawn as wide as the point it grows to, so a root that forks at
// once is never drawn at its own width, which feeds both forks: only points with a parent count.
export function widestVein(parent: ArrayLike<number>, n: number, w: WidthSettings): number {
  if (n < 2) return 0
  const widths = veinWidths(parent, n, w)
  let widest = 0
  for (let v = 0; v < n; v++) if (parent[v] >= 0 && widths[v] > widest) widest = widths[v]
  return widest
}

// Join: the network without its dead ends. A vein end that never met the other tree carries no flow, so it is cut
// back, again and again, until every end left is a join between the trees. Roots stay. Returns 1 for each point kept.
export function trimDeadEnds(parent: ArrayLike<number>, n: number, links: ArrayLike<number>): Uint8Array {
  const keep = new Uint8Array(n).fill(1)
  const kids = new Int32Array(n)
  for (let v = 0; v < n; v++) if (parent[v] >= 0) kids[parent[v]]++
  const linked = new Uint8Array(n)
  for (let i = 0; i < links.length; i++) linked[links[i]] = 1
  const stack: number[] = []
  for (let v = n - 1; v >= 0; v--) if (kids[v] === 0 && !linked[v] && parent[v] >= 0) stack.push(v)
  while (stack.length) {
    const v = stack.pop()!
    keep[v] = 0
    const p = parent[v]
    kids[p]--
    if (kids[p] === 0 && !linked[p] && parent[p] >= 0) stack.push(p)
  }
  return keep
}

// A vein between forks: its points and its width. A chain's width never changes along it, because a point
// with one child feeds exactly the ends its child does.
// system: the system it belongs to, with two or three (0 is A); link: a join between Join's two trees.
// curves: the smooth curve through the points, one cubic a segment, when worked out for an export (safeCurves).
export type Chain = { points: Vec[]; width: number; join?: boolean; link?: boolean; system?: number; curves?: Cubic[] }

// The veins as chains. With two or three systems, `sys` gives each point's system and `links` Join's joins between
// the trees; `keep` leaves out the points it marks 0, as Trim dead ends does.
export function chains(x: ArrayLike<number>, y: ArrayLike<number>, parent: ArrayLike<number>, joins: ArrayLike<number>, n: number, widths: Float64Array,
  opts: { sys?: ArrayLike<number> | null; links?: ArrayLike<number> | null; keep?: Uint8Array | null } = {}): Chain[] {
  const { sys, links, keep } = opts
  const kept = (v: number) => parent[v] >= 0 && (!keep || keep[v] === 1)
  const childStart = new Int32Array(n + 1)
  for (let v = 0; v < n; v++) if (kept(v)) childStart[parent[v] + 1]++
  for (let v = 0; v < n; v++) childStart[v + 1] += childStart[v]
  const kids = new Int32Array(childStart[n])
  const fill = childStart.slice()
  for (let v = 0; v < n; v++) if (kept(v)) kids[fill[parent[v]]++] = v
  const childCount = (v: number) => childStart[v + 1] - childStart[v]
  // A loop join carries on the vein that arrived, when that vein ended there and has only that one join.
  const joinCount = new Int32Array(n)
  for (let i = 0; i + 1 < joins.length; i += 2) { joinCount[joins[i]]++; joinCount[joins[i + 1]]++ }
  const onward = new Map<number, number>()
  const usedJoin = new Set<number>()
  for (let i = 0; i + 1 < joins.length; i += 2) {
    const a = joins[i]
    if (childCount(a) === 0 && joinCount[a] === 1 && !onward.has(a)) { onward.set(a, joins[i + 1]); usedJoin.add(i) }
  }
  const out: Chain[] = []
  const stack: [number, number][] = []
  for (let r = 0; r < n; r++) {
    if (parent[r] >= 0) continue
    for (let k = childStart[r]; k < childStart[r + 1]; k++) stack.push([r, kids[k]])
    while (stack.length) {
      const [start, first] = stack.pop()!
      const pts: Vec[] = [[x[start], y[start]], [x[first], y[first]]]
      let v = first
      while (childCount(v) === 1) { v = kids[childStart[v]]; pts.push([x[v], y[v]]) }
      const end = onward.get(v)
      if (childCount(v) === 0 && end !== undefined) pts.push([x[end], y[end]])
      out.push(sys ? { points: pts, width: widths[first], system: sys[first] } : { points: pts, width: widths[first] })
      for (let k = childStart[v]; k < childStart[v + 1]; k++) stack.push([v, kids[k]])
    }
  }
  for (let i = 0; i + 1 < joins.length; i += 2) {
    if (usedJoin.has(i)) continue
    const a = joins[i], b = joins[i + 1]
    const chain: Chain = { points: [[x[a], y[a]], [x[b], y[b]]], width: Math.min(widths[a] || Infinity, widths[b] || Infinity), join: true }
    if (sys) chain.system = sys[a]
    out.push(chain)
  }
  // A join between the trees is as wide as the narrower end it joins.
  if (links) for (let i = 0; i + 1 < links.length; i += 2) {
    const a = links[i], b = links[i + 1]
    out.push({ points: [[x[a], y[a]], [x[b], y[b]]], width: Math.min(widths[a] || Infinity, widths[b] || Infinity), link: true })
  }
  return out
}

// Pairs of segments from different systems whose centre lines come within `reach`: [a, b, distance], where a segment
// is named by the point it grows to. Segments are found by their middles in a grid, cells as wide as the reach.
function crossPairs(x: ArrayLike<number>, y: ArrayLike<number>, parent: ArrayLike<number>, sys: ArrayLike<number>, n: number,
  reach: (longest: number) => number): [number, number, number][] {
  const segs: number[] = []
  let longest = 0
  for (let v = 0; v < n; v++) if (parent[v] >= 0) {
    segs.push(v)
    const p = parent[v]
    longest = Math.max(longest, Math.hypot(x[v] - x[p], y[v] - y[p]))
  }
  const R = reach(longest)
  const pairs: [number, number, number][] = []
  if (!(R > 0)) return pairs
  const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768)
  const grid = new Map<number, number[]>()
  const cellOf = (v: number): [number, number] => { const p = parent[v]; return [Math.floor((x[v] + x[p]) / 2 / R), Math.floor((y[v] + y[p]) / 2 / R)] }
  for (const v of segs) {
    const k = key(...cellOf(v))
    const list = grid.get(k)
    if (list) list.push(v); else grid.set(k, [v])
  }
  for (const a of segs) {
    const pa = parent[a], [ci, cj] = cellOf(a)
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      for (const b of grid.get(key(i, j)) ?? []) {
        if (sys[b] === sys[a] || b < a) continue
        const pb = parent[b]
        const d = segmentDistance(x[pa], y[pa], x[a], y[a], x[pb], y[pb], x[b], y[b])
        if (d <= R) pairs.push([a, b, d])
      }
    }
  }
  return pairs
}

const widestOf = (widths: ArrayLike<number>, n: number) => { let w = 0; for (let v = 0; v < n; v++) w = Math.max(w, widths[v]); return w }

// The closest the veins of two different systems come, edge to edge, mm, with these widths; Infinity when no two come
// near, and below 0 where they overlap.
export function systemGap(x: ArrayLike<number>, y: ArrayLike<number>, parent: ArrayLike<number>, sys: ArrayLike<number>, n: number, widths: ArrayLike<number>): number {
  const widest = widestOf(widths, n)
  let closest = Infinity
  for (const [a, b, d] of crossPairs(x, y, parent, sys, n, longest => widest + longest + 1)) closest = Math.min(closest, d - widths[a] / 2 - widths[b] / 2)
  return closest
}

// Interweave: Murray widths keep growing as a tree gains ends, after a vein has passed another system's vein, so the
// widths are capped where two systems pass close: each end of a segment may be at most half the room between it and
// the nearest segment of another system, after the gap. The cap spreads along the vein, so a vein narrows over a few
// segments rather than at once. A segment is drawn as wide as the point it grows to, so its width is that point's.
// Returns the new widths, how many points were narrowed, and the closest gap left between the systems' veins.
export function separateWidths(x: ArrayLike<number>, y: ArrayLike<number>, parent: ArrayLike<number>, sys: ArrayLike<number>, n: number,
  widths: Float64Array, gap: number, taper = 0.4): { widths: Float64Array; narrowed: number; closest: number } {
  const widest = widestOf(widths, n) / 2
  const cap = new Float64Array(n).fill(Infinity)
  const pairs = crossPairs(x, y, parent, sys, n, longest => Math.max(0, gap) + 2 * widest + longest)
  for (const [a, b, d] of pairs) {
    const room = Math.max(0, (d - Math.max(0, gap)) / 2)
    for (const v of [a, b]) if (room < cap[v]) cap[v] = room
  }
  // Spread each cap along the tree: a half-width can grow by at most `taper` mm a millimetre away from a cap.
  const limit = Float64Array.from(cap)
  for (let pass = 0; pass < 2; pass++) {
    // Down the tree (parents come before children), then up.
    for (let v = 0; v < n; v++) {
      const p = parent[v]
      if (p < 0) continue
      limit[v] = Math.min(limit[v], limit[p] + taper * Math.hypot(x[v] - x[p], y[v] - y[p]))
    }
    for (let v = n - 1; v >= 0; v--) {
      const p = parent[v]
      if (p < 0) continue
      limit[p] = Math.min(limit[p], limit[v] + taper * Math.hypot(x[v] - x[p], y[v] - y[p]))
    }
  }
  let narrowed = 0
  const out = new Float64Array(n)
  for (let v = 0; v < n; v++) {
    const r = Math.min(widths[v] / 2, limit[v])
    if (r < widths[v] / 2 - 1e-9) narrowed++
    out[v] = 2 * r
  }
  let closest = Infinity
  for (const [a, b, d] of pairs) closest = Math.min(closest, d - out[a] / 2 - out[b] / 2)
  return { widths: out, narrowed, closest }
}

export type NetworkStats = { points: number; ends: number; forks: number; loops: number; roots: number; length: number }

export function networkStats(x: ArrayLike<number>, y: ArrayLike<number>, parent: ArrayLike<number>, joins: ArrayLike<number>, n: number): NetworkStats {
  const kids = new Int32Array(n)
  let roots = 0, length = 0
  for (let v = 0; v < n; v++) {
    const p = parent[v]
    if (p < 0) { roots++; continue }
    kids[p]++
    length += Math.hypot(x[v] - x[p], y[v] - y[p])
  }
  const joined = new Uint8Array(n)
  for (let i = 0; i + 1 < joins.length; i += 2) {
    const a = joins[i], b = joins[i + 1]
    joined[a] = 1; joined[b] = 1
    length += Math.hypot(x[a] - x[b], y[a] - y[b])
  }
  let ends = 0, forks = 0
  for (let v = 0; v < n; v++) {
    if (kids[v] === 0 && parent[v] >= 0 && !joined[v]) ends++
    if (kids[v] >= 2) forks++
  }
  return { points: n, ends, forks, loops: joins.length / 2, roots, length }
}

export type Cubic = [number, number, number, number, number, number] // c1x, c1y, c2x, c2y, x, y

// Smooth curves through a chain's points: each segment becomes a cubic Bézier whose handles follow the
// neighbouring points (Catmull–Rom), so the curve passes through every vein point, forks included, with no corners.
export function smoothChain(p: Vec[]): Cubic[] {
  const n = p.length
  const at = (i: number) => p[Math.max(0, Math.min(n - 1, i))]
  const out: Cubic[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    out.push([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]])
  }
  return out
}

// A chain's smooth curve as points, `per` to a segment, for DXF and outlines.
export function flattenChain(p: Vec[], per: number): Vec[] {
  if (p.length < 3 || per <= 1) return p.slice()
  return flattenCurves(p[0], smoothChain(p), per)
}

// Curves from `start` as points, `per` to a curve.
export function flattenCurves(start: Vec, curves: Cubic[], per: number): Vec[] {
  const out: Vec[] = [start]
  let [px, py] = start
  for (const [c1x, c1y, c2x, c2y, x, y] of curves) {
    for (let k = 1; k <= per; k++) {
      const t = k / per, u = 1 - t
      out.push([u * u * u * px + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * py + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y])
    }
    px = x; py = y
  }
  return out
}

// A straight segment as a cubic, its handles a third of the way along.
const straight = (a: Vec, b: Vec): Cubic => [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3, a[0] + ((b[0] - a[0]) * 2) / 3, a[1] + ((b[1] - a[1]) * 2) / 3, b[0], b[1]]
// Each curve is checked as this many chords, kept this much (mm) further from the edges than asked: a chord and
// its curve are under 0.001 mm apart at a segment's length, so the curve itself keeps the promise.
const CHORDS = 16
const MARGIN = 0.002

// Smooth curves through a chain for an export, that keep the engine's promises: every curve stays inside the shape
// and at least the edge clearance from its edges. Catmull–Rom curves can swing a little wide of a sharp turn, such
// as a loop join, by up to about a tenth of a millimetre; a curve that would leave the shape or come nearer an edge
// than the clearance is drawn straight there instead, as the engine grew it.
export function safeCurves(p: Vec[], region: Region, clearance: number): Cubic[] {
  const r = Math.max(0, clearance) + MARGIN
  return smoothChain(p).map((c, i) => {
    const [ax, ay] = p[i]
    let px = ax, py = ay
    for (let k = 1; k <= CHORDS; k++) {
      const t = k / CHORDS, u = 1 - t
      const qx = u * u * u * ax + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4]
      const qy = u * u * u * ay + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5]
      if (!region.clearOf(px, py, qx, qy, r)) return straight(p[i], p[i + 1])
      px = qx; py = qy
    }
    return c
  })
}
