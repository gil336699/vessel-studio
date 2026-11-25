import { describe, expect, it } from 'vitest'
import { placeAttractors } from './attractors'
import { Engine, type GrowthParams, type Root } from './engine'
import { ellipseRing } from './geometry'
import { separateWidths, trimDeadEnds, veinWidths } from './network'
import { Region } from './region'

// Two or three systems on a small ellipse, as Vessel Studio 3D grows them: Join's inlet and outlet trees, and
// interwoven systems that never touch.
const region = new Region([ellipseRing(50, 70, 45, 65)])
const base: GrowthParams = {
  segment: 0.5, kill: 1, attraction: 0, topology: 'open', inertia: 0.3, wiggle: 0.08, pull: 0, pullMode: 'up', crowd: 0.45, clearance: 0,
  leafSteps: 0, minLoop: 8, maxPoints: 400_000, seed: 1, widths: { rule: 'murray', tip: 0.11, max: 1.3, exponent: 3 },
}
const join: GrowthParams = { ...base, systems: 2, coupling: 'join', tipPull: 0.6 }
const weave: GrowthParams = { ...base, systems: 2, coupling: 'interweave', gap: 0.3, repel: 0.3 }
// The inlet at the bottom, the outlet at the top.
const ends: Root[] = [[50, 134, 0], [50, 6, 1]]
// Roots round the edge, the systems taking turns.
const around = (n: number, T: number): Root[] => Array.from({ length: n }, (_, k) => { const t = ((k + 0.5) / n) * 2 * Math.PI; return [50 + 43.5 * Math.cos(t), 70 + 63.5 * Math.sin(t), k % T] })

function grow(p: GrowthParams, count: number, roots: Root[], steps = 4000) {
  const T = p.systems ?? 1
  const interwoven = T > 1 && p.coupling !== 'join'
  const e = new Engine(region, placeAttractors(region, interwoven ? count * T : count, 'even', 1).points, p, { roots })
  for (let i = 0; i < steps && !e.done; i++) e.stepOnce()
  return e
}

// The shortest distance between two segments, worked out on its own here: 0 when they cross or touch.
function segmentGap(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const cross = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px)
  const d1 = cross(cx, cy, dx, dy, ax, ay), d2 = cross(cx, cy, dx, dy, bx, by), d3 = cross(ax, ay, bx, by, cx, cy), d4 = cross(ax, ay, bx, by, dx, dy)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  const toSeg = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => {
    const ex = rx - qx, ey = ry - qy, L2 = ex * ex + ey * ey, t = L2 > 0 ? Math.max(0, Math.min(1, ((px - qx) * ex + (py - qy) * ey) / L2)) : 0
    return Math.hypot(px - qx - ex * t, py - qy - ey * t)
  }
  return Math.min(toSeg(ax, ay, cx, cy, dx, dy), toSeg(bx, by, cx, cy, dx, dy), toSeg(cx, cy, ax, ay, bx, by), toSeg(dx, dy, ax, ay, bx, by))
}

// For every segment of one system and every segment of another near it: the distance between their centre lines,
// and their widths.
function crossings(e: Engine, widths?: Float64Array): { closest: number; edge: number } {
  const n = e.points, x = e.x, y = e.y, parent = e.parent, sys = e.sys
  let closest = Infinity, edge = Infinity
  for (let v = 0; v < n; v++) {
    const pv = parent[v]
    if (pv < 0) continue
    for (let u = v + 1; u < n; u++) {
      const pu = parent[u]
      if (pu < 0 || sys[u] === sys[v] || Math.abs(x[u] - x[v]) > 4 || Math.abs(y[u] - y[v]) > 4) continue
      const d = segmentGap(x[pv], y[pv], x[v], y[v], x[pu], y[pu], x[u], y[u])
      closest = Math.min(closest, d)
      if (widths) edge = Math.min(edge, d - widths[v] / 2 - widths[u] / 2)
    }
  }
  return { closest, edge }
}

// Segments between two vein points along their tree, or Infinity when they're in different trees or more than
// `limit` apart.
function alongTree(parent: ArrayLike<number>, a: number, b: number, limit: number): number {
  const depth = (v: number) => { let d = 0; for (let p = v; parent[p] >= 0; p = parent[p]) d++; return d }
  let da = depth(a), db = depth(b), steps = 0
  while (da > db) { a = parent[a]; da--; steps++ }
  while (db > da) { b = parent[b]; db--; steps++ }
  while (a !== b) { if (parent[a] < 0 || parent[b] < 0) return Infinity; a = parent[a]; b = parent[b]; steps += 2 }
  return steps > limit ? Infinity : steps
}

describe('Join: an inlet tree and an outlet tree', () => {
  const e = grow(join, 600, ends)

  it('grow toward each other and join where they meet, every join between the two trees, within the kill distance', () => {
    expect(e.done).toBe('reached')
    const links = e.links
    expect(links.length / 2).toBeGreaterThanOrEqual(10)
    for (let i = 0; i < links.length; i += 2) {
      const a = links[i], b = links[i + 1]
      expect(e.sys[a]).not.toBe(e.sys[b])
      expect(Math.hypot(e.x[a] - e.x[b], e.y[a] - e.y[b])).toBeLessThan(join.kill)
    }
  })

  it('never cross: their veins meet only where they join', () => {
    expect(crossings(e).closest).toBeGreaterThan(0)
  })

  it('join sparingly, not as the rungs of a ladder where two veins run side by side', () => {
    const L = e.links
    let ladders = 0
    for (let i = 0; i < L.length; i += 2) for (let j = i + 2; j < L.length; j += 2) {
      // Match each join's ends by tree.
      const [a1, b1] = e.sys[L[i]] === 0 ? [L[i], L[i + 1]] : [L[i + 1], L[i]]
      const [a2, b2] = e.sys[L[j]] === 0 ? [L[j], L[j + 1]] : [L[j + 1], L[j]]
      if (alongTree(e.parent, a1, a2, join.minLoop) <= join.minLoop && alongTree(e.parent, b1, b2, join.minLoop) <= join.minLoop) ladders++
    }
    expect(ladders).toBe(0)
  })

  it('carry flow from inlet to outlet once trimmed: every end left is a join, and the inlet reaches the outlet', () => {
    const n = e.points, keep = trimDeadEnds(e.parent, n, e.links)
    const linked = new Set(Array.from(e.links)), kids = new Int32Array(n)
    for (let v = 0; v < n; v++) if (keep[v] && e.parent[v] >= 0) kids[e.parent[v]]++
    for (let v = 0; v < n; v++) if (keep[v] && e.parent[v] >= 0 && kids[v] === 0) expect(linked.has(v)).toBe(true)
    // Walk the kept veins and the joins from the inlet's root.
    const next = Array.from({ length: n }, () => [] as number[])
    for (let v = 0; v < n; v++) if (keep[v] && e.parent[v] >= 0) { next[v].push(e.parent[v]); next[e.parent[v]].push(v) }
    for (let i = 0; i < e.links.length; i += 2) { next[e.links[i]].push(e.links[i + 1]); next[e.links[i + 1]].push(e.links[i]) }
    const seen = new Uint8Array(n), queue = [0]
    seen[0] = 1
    for (let q = 0; q < queue.length; q++) for (const w of next[queue[q]]) if (!seen[w]) { seen[w] = 1; queue.push(w) }
    expect(seen[1]).toBe(1)
  })
})

describe('Interweave: two systems in the same shape', () => {
  it('keep the gap between them along every segment, so they never touch, and after narrowing edge to edge too', () => {
    const e = grow(weave, 800, around(12, 2))
    // As grown: centre lines at least the gap and a tip's width apart.
    const { closest } = crossings(e)
    expect(closest).toBeGreaterThanOrEqual(weave.gap! + weave.widths!.tip - 1e-9)
    // Murray widths grow after a vein passes another system's, so the drawn widths are narrowed to keep the gap.
    const widths = separateWidths(e.x, e.y, e.parent, e.sys, e.points, veinWidths(e.parent, e.points, weave.widths!), weave.gap!).widths
    expect(crossings(e, widths).edge).toBeGreaterThanOrEqual(weave.gap! - 1e-9)
  })

  it('end as reached once they fill the shape, though each system’s attractors in the other’s space stay out of its reach', () => {
    const e = grow(weave, 800, ends)
    expect(e.done).toBe('reached')
    expect(e.live).toBe(0)
  })

  it('grow three systems, each from its own roots, none touching another', () => {
    const e = grow({ ...weave, systems: 3 }, 600, around(12, 3))
    expect(e.done).toBe('reached')
    for (let t = 0; t < 3; t++) expect(Array.from(e.sys).filter(s => s === t).length).toBeGreaterThan(500)
    expect(crossings(e).closest).toBeGreaterThanOrEqual(weave.gap! + weave.widths!.tip - 1e-9)
  })
})

describe('two systems saved part way', () => {
  // Saved once the trees have joined, so the joins made so far must come back with the file.
  for (const [label, p, count, roots] of [['Join', join, 600, ends], ['Interweave', weave, 800, around(12, 2)]] as const) {
    it(`carry on exactly as an unbroken run: ${label}`, () => {
      const whole = grow(p, count, roots)
      const half = grow(p, count, roots, 150)
      if (p.coupling === 'join') expect(half.links.length).toBeGreaterThan(0)
      const again = new Engine(region, placeAttractors(region, p.coupling === 'join' ? count : count * 2, 'even', 1).points, p, { state: half.snapshot() })
      for (let i = 0; i < 4000 && !again.done; i++) again.stepOnce()
      const a = whole.snapshot(), b = again.snapshot()
      for (const key of ['x', 'y', 'parent', 'sys', 'joins', 'links', 'used'] as const) expect(Array.from(b[key] ?? [])).toEqual(Array.from(a[key] ?? []))
      expect([b.step, b.rng, b.done]).toEqual([a.step, a.rng, a.done])
    })
  }
})
