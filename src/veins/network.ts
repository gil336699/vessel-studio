// The grown veins as drawable pieces: vein widths by Murray's law, the veins split into paths between forks,
// and the numbers the measurements panel shows. Plain functions of the points, so the page, the exports and
// the tests all agree.
import type { Vec } from './geometry'

export type WidthRule = 'murray' | 'even'
export type WidthSettings = { rule: WidthRule; tip: number; max: number; exponent: number }

// How many vein ends each point feeds (the pipe model). A point is only added after its parent, so walking the
// indices downward visits every child before its parent.
export function feeds(parent: ArrayLike<number>, n: number): Float64Array {
  const q = new Float64Array(n)
  for (let v = n - 1; v >= 0; v--) {
    if (q[v] === 0) q[v] = 1
    const p = parent[v]
    if (p >= 0) q[p] += q[v]
  }
  return q
}

// Width (mm) of the vein from each point's parent to the point. Murray's law: at each fork the parent's
// width^n is the sum of its children's, starting from the tip width at every end, so a vein feeding m ends is
// tip × m^(1/n) wide. Even gives every vein the tip width, for pen plotters.
export function veinWidths(parent: ArrayLike<number>, n: number, w: WidthSettings): Float64Array {
  const out = new Float64Array(n)
  if (w.rule === 'even') return out.fill(w.tip)
  const q = feeds(parent, n)
  const inv = 1 / Math.max(1, w.exponent)
  for (let v = 0; v < n; v++) out[v] = Math.min(Math.max(w.tip, w.max), w.tip * q[v] ** inv)
  return out
}

// A vein between forks: its points and its width. A chain's width never changes along it, because a point
// with one child feeds exactly the ends its child does.
export type Chain = { points: Vec[]; width: number; join?: boolean }

export function chains(x: ArrayLike<number>, y: ArrayLike<number>, parent: ArrayLike<number>, joins: ArrayLike<number>, n: number, widths: Float64Array): Chain[] {
  const childStart = new Int32Array(n + 1)
  for (let v = 0; v < n; v++) if (parent[v] >= 0) childStart[parent[v] + 1]++
  for (let v = 0; v < n; v++) childStart[v + 1] += childStart[v]
  const kids = new Int32Array(childStart[n])
  const fill = childStart.slice()
  for (let v = 0; v < n; v++) if (parent[v] >= 0) kids[fill[parent[v]]++] = v
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
      out.push({ points: pts, width: widths[first] })
      for (let k = childStart[v]; k < childStart[v + 1]; k++) stack.push([v, kids[k]])
    }
  }
  for (let i = 0; i + 1 < joins.length; i += 2) {
    if (usedJoin.has(i)) continue
    const a = joins[i], b = joins[i + 1]
    out.push({ points: [[x[a], y[a]], [x[b], y[b]]], width: Math.min(widths[a] || Infinity, widths[b] || Infinity), join: true })
  }
  return out
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
  const out: Vec[] = [p[0]]
  let [px, py] = p[0]
  for (const [c1x, c1y, c2x, c2y, x, y] of smoothChain(p)) {
    for (let k = 1; k <= per; k++) {
      const t = k / per, u = 1 - t
      out.push([u * u * u * px + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * py + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y])
    }
    px = x; py = y
  }
  return out
}
