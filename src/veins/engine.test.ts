import { describe, expect, it } from 'vitest'
import { placeAttractors } from './attractors'
import { Engine, type EngineState, type GrowthParams } from './engine'
import { segmentsCross, type Ring } from './geometry'
import { chains, feeds, networkStats, veinWidths } from './network'
import { Region } from './region'
import { defaultRoots, presetRings } from './shapes'

const params: GrowthParams = { segment: 1.5, kill: 2.5, attraction: 0, topology: 'open', inertia: 0, wiggle: 0, pull: 0, pullMode: 'up', crowd: 0.45, leafSteps: 0, minLoop: 8, maxPoints: 200_000, seed: 5 }

function setup(kind: 'leaf' | 'ellipse' | 'ring' | 'rect', count: number, p: Partial<GrowthParams> = {}) {
  const rings = presetRings(kind, 160, 200, 8)
  const region = new Region(rings)
  const attractors = placeAttractors(region, count, 'even', 3).points
  const roots = defaultRoots(kind, 160, 200, 8, false).map(([x, y]) => region.nearestInside(x, y, 0.5)!)
  return { region, rings, attractors, engine: new Engine(region, attractors, { ...params, ...p }, { roots }) }
}

function run(engine: Engine, cap = 5000) {
  let steps = 0
  while (steps < cap && engine.stepOnce()) steps++
  return steps
}

// Every vein segment and loop join, as point pairs.
function segments(e: Engine): [number, number][] {
  const out: [number, number][] = []
  for (let v = 0; v < e.points; v++) if (e.parent[v] >= 0) out.push([e.parent[v], v])
  for (let i = 0; i < e.joins.length; i += 2) out.push([e.joins[i], e.joins[i + 1]])
  return out
}

function crossingsWithEdge(e: Engine, rings: Ring[]): number {
  let hits = 0
  for (const [a, b] of segments(e)) for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length]
    if (segmentsCross(e.x[a], e.y[a], e.x[b], e.y[b], p[0], p[1], q[0], q[1])) hits++
  }
  return hits
}

describe('attractors', () => {
  it('places exactly the count asked for, all inside, the same for the same seed', () => {
    const region = new Region(presetRings('leaf', 160, 200, 8))
    for (const placement of ['even', 'random', 'grid', 'edge'] as const) {
      const a = placeAttractors(region, 1500, placement, 9)
      expect(a.points.length / 2).toBe(1500)
      expect(a.short).toBe(false)
      for (let i = 0; i < a.points.length; i += 2) expect(region.contains(a.points[i], a.points[i + 1])).toBe(true)
      expect(placeAttractors(region, 1500, placement, 9).points).toEqual(a.points)
    }
  })

  it('spaces Even points more evenly than Random ones', () => {
    const region = new Region(presetRings('rect', 160, 200, 8))
    const closest = (pts: Float64Array) => {
      let worst = Infinity
      for (let i = 0; i < pts.length; i += 2) for (let j = i + 2; j < pts.length; j += 2) worst = Math.min(worst, Math.hypot(pts[i] - pts[j], pts[i + 1] - pts[j + 1]))
      return worst
    }
    const even = closest(placeAttractors(region, 800, 'even', 4).points), random = closest(placeAttractors(region, 800, 'random', 4).points)
    expect(even).toBeGreaterThan(3 * random)
  })

  it('crowds Edge points near the outline', () => {
    const region = new Region(presetRings('ellipse', 160, 200, 8))
    const nearEdge = (pts: Float64Array) => { let k = 0; for (let i = 0; i < pts.length; i += 2) if (region.edgeDistance(pts[i], pts[i + 1], 10) < 10) k++; return k / (pts.length / 2) }
    expect(nearEdge(placeAttractors(region, 1500, 'edge', 2).points)).toBeGreaterThan(nearEdge(placeAttractors(region, 1500, 'even', 2).points) + 0.15)
  })
})

describe('engine', () => {
  it('grows a branching tree that uses up its attractors and stays inside the leaf', () => {
    const { engine, rings } = setup('leaf', 2500)
    const steps = run(engine)
    // A handful can be left where no vein can grow, a little beyond the kill distance of two veins.
    expect(['reached', 'stalled']).toContain(engine.done)
    expect(engine.live).toBeLessThan(2500 * 0.01)
    expect(steps).toBeGreaterThan(40)
    const stats = networkStats(engine.x, engine.y, engine.parent, engine.joins, engine.points)
    expect(stats.forks).toBeGreaterThan(100)
    expect(stats.loops).toBe(0)
    expect(crossingsWithEdge(engine, rings)).toBe(0)
    for (let v = 0; v < engine.points; v++) expect(engine.region!.contains(engine.x[v], engine.y[v])).toBe(true)
  })

  it('never leaves the shape, even when pulled hard against its edge', () => {
    // A strong upward pull and wobble would carry veins out through the leaf's top edges without the guard.
    const { engine, rings } = setup('leaf', 2500, { pull: 1, pullMode: 'up', wiggle: 1 })
    run(engine)
    expect(engine.points).toBeGreaterThan(1000)
    expect(crossingsWithEdge(engine, rings)).toBe(0)
    let outside = 0
    for (let v = 0; v < engine.points; v++) if (!engine.region!.contains(engine.x[v], engine.y[v])) outside++
    expect(outside).toBe(0)
  })

  it('never crosses an obstacle: the ring\'s hole stays empty', () => {
    const { engine, rings } = setup('ring', 2000)
    run(engine)
    expect(engine.points).toBeGreaterThan(500)
    expect(crossingsWithEdge(engine, rings)).toBe(0)
  })

  it('keeps new points apart, so no two vein points pile up', () => {
    const { engine } = setup('ellipse', 2000, { crowd: 0.45 })
    run(engine)
    let close = 0
    for (let a = 0; a < engine.points; a++) for (let b = a + 1; b < engine.points; b++) {
      if (engine.parent[b] === a || engine.parent[a] === b) continue
      if (Math.hypot(engine.x[a] - engine.x[b], engine.y[a] - engine.y[b]) < 0.45 * params.segment - 1e-9) close++
    }
    expect(close).toBe(0)
  })

  it('closes loops with real joins when Loops is on', () => {
    const { engine, rings } = setup('leaf', 2500, { topology: 'closed', kill: 1.5 })
    run(engine)
    const stats = networkStats(engine.x, engine.y, engine.parent, engine.joins, engine.points)
    expect(stats.loops).toBeGreaterThan(50)
    // Each join connects two points that met at a source, so it is short.
    for (let i = 0; i < engine.joins.length; i += 2) {
      const a = engine.joins[i], b = engine.joins[i + 1]
      expect(Math.hypot(engine.x[a] - engine.x[b], engine.y[a] - engine.y[b])).toBeLessThan(1.5 + 1e-9)
    }
    expect(crossingsWithEdge(engine, rings)).toBe(0)
  })

  for (const topology of ['open', 'closed'] as const) it(`carries on after save and reopen exactly as an unbroken run (${topology}, with wiggle, keep heading, pull and leaf growth)`, () => {
    const p: Partial<GrowthParams> = { topology, wiggle: 0.3, inertia: 0.4, pull: 0.2, pullMode: 'out', leafSteps: 160 }
    const whole = setup('leaf', 1800, p)
    const total = run(whole.engine)
    const half = setup('leaf', 1800, p)
    for (let i = 0; i < 80; i++) half.engine.stepOnce()
    // Saved half way through growing, with attractors still waiting for the leaf to reach them.
    expect(half.engine.done).toBeNull()
    expect(half.engine.waiting).toBeGreaterThan(100)
    const saved: EngineState = JSON.parse(JSON.stringify({ ...half.engine.snapshot(), x: Array.from(half.engine.x), y: Array.from(half.engine.y), parent: Array.from(half.engine.parent), joins: Array.from(half.engine.joins), used: Array.from(half.engine.used) }))
    const reopened = new Engine(half.region, half.attractors, { ...params, ...p }, { state: saved })
    run(reopened)
    expect(total).toBeGreaterThan(160)
    expect(whole.engine.points).toBeGreaterThan(1000)
    expect(reopened.step).toBe(whole.engine.step)
    expect(reopened.done).toBe(whole.engine.done)
    expect(Array.from(reopened.x)).toEqual(Array.from(whole.engine.x))
    expect(Array.from(reopened.y)).toEqual(Array.from(whole.engine.y))
    expect(Array.from(reopened.parent)).toEqual(Array.from(whole.engine.parent))
    expect(Array.from(reopened.joins)).toEqual(Array.from(whole.engine.joins))
    expect(Array.from(reopened.used)).toEqual(Array.from(whole.engine.used))
    expect(reopened.rngState).toBe(whole.engine.rngState)
  })

  it('ends even without Keep veins apart, where the older pages piled points up forever', () => {
    const { engine } = setup('leaf', 2500, { crowd: 0 })
    const steps = run(engine, 20000)
    expect(engine.done).not.toBeNull()
    expect(steps).toBeLessThan(2000)
    expect(engine.points).toBeLessThan(20000)
  })

  it('grows the leaf outward with leaf growth: early points stay near the root', () => {
    const { engine } = setup('leaf', 2000, { leafSteps: 200 })
    for (let i = 0; i < 40; i++) engine.stepOnce()
    const [rx, ry] = [engine.x[0], engine.y[0]]
    let far = 0
    for (let v = 0; v < engine.points; v++) far = Math.max(far, Math.hypot(engine.x[v] - rx, engine.y[v] - ry))
    // After 40 of 200 steps the outline is about a quarter of its size, so veins can't have gone much further.
    expect(far).toBeLessThan(0.4 * 184)
    expect(engine.waiting).toBeGreaterThan(500)
    run(engine)
    expect(engine.done).toBe('reached')
  })

  it('stops when the remaining attractors are out of reach', () => {
    const { engine } = setup('rect', 600, { attraction: 4 })
    run(engine)
    expect(engine.done).toBe('out-of-reach')
  })
})

describe('network', () => {
  // A Y: root 0 → 1 → 2, then 2 forks to 3 and 4, and 4 → 5.
  const x = [0, 0, 0, -1, 1, 2], y = [0, 1, 2, 3, 3, 4], parent = [-1, 0, 1, 2, 2, 4]

  it('counts the ends each point feeds', () => {
    expect(Array.from(feeds(parent, 6))).toEqual([2, 2, 2, 1, 1, 1])
  })

  it('widens a fork by Murray\'s law', () => {
    const w = veinWidths(parent, 6, { rule: 'murray', tip: 0.2, max: 5, exponent: 3 })
    expect(w[3]).toBeCloseTo(0.2, 12)
    expect(w[1]).toBeCloseTo(0.2 * 2 ** (1 / 3), 12)
    expect(veinWidths(parent, 6, { rule: 'murray', tip: 0.2, max: 0.22, exponent: 3 })[1]).toBe(0.22)
    expect(Array.from(veinWidths(parent, 6, { rule: 'even', tip: 0.3, max: 5, exponent: 3 }))).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3])
  })

  it('splits the tree into one path per vein between forks', () => {
    const w = veinWidths(parent, 6, { rule: 'murray', tip: 0.2, max: 5, exponent: 2 })
    const c = chains(x, y, parent, [], 6, w)
    expect(c.map(k => k.points.length).sort()).toEqual([2, 3, 3])
    const trunk = c.find(k => k.points.length === 3 && k.points[0][1] === 0)!
    expect(trunk.width).toBeCloseTo(0.2 * Math.SQRT2, 12)
  })

  it('carries a vein on through its loop join', () => {
    // Two veins from the root meet: 3 ends at the junction 5, which grew from 4.
    const lx = [0, -1, 1, -1, 1, 0], ly = [0, 1, 1, 2, 2, 3], lp = [-1, 0, 0, 1, 2, 4]
    const c = chains(lx, ly, lp, [3, 5], 6, veinWidths(lp, 6, { rule: 'even', tip: 1, max: 1, exponent: 3 }))
    expect(c).toHaveLength(2)
    expect(c.every(k => !k.join)).toBe(true)
    expect(c.map(k => k.points.at(-1))).toContainEqual([0, 3])
    expect(networkStats(lx, ly, lp, [3, 5], 6)).toMatchObject({ loops: 1, ends: 0, forks: 1 })
  })
})
