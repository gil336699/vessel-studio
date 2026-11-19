// Tests for problems an independent code review found in 1.0.0 before release.
import { describe, expect, it } from 'vitest'
import { placeAttractors } from './attractors'
import { Engine, type GrowthParams } from './engine'
import { ellipseRing, isConvex, rectRing, type Ring } from './geometry'
import { Region } from './region'
import { invertRings, presetRings } from './shapes'

const params: GrowthParams = { segment: 1, kill: 1.2, attraction: 0, topology: 'closed', inertia: 0.1, wiggle: 0.05, pull: 0, pullMode: 'up', crowd: 0.45, leafSteps: 0, minLoop: 8, maxPoints: 200_000, seed: 2 }

describe('loops when growth gets stuck', () => {
  it('reports every attractor it uses up, so the page and saved files agree with the engine', () => {
    const region = new Region(presetRings('leaf', 120, 170, 6))
    const attractors = placeAttractors(region, 2500, 'even', 4).points
    const e = new Engine(region, attractors, params, { roots: [region.nearestInside(60, 163, 0.5)!] })
    const reported = new Set<number>()
    for (let i = 0; i < 4000; i++) { const c = e.stepOnce(); if (!c) break; for (const s of c.used) reported.add(s) }
    const flagged = [...e.used].flatMap((u, i) => (u ? [i] : []))
    expect(e.done).not.toBeNull()
    expect([...reported].sort((a, b) => a - b)).toEqual(flagged)
    expect(e.live).toBe(attractors.length / 2 - flagged.length)
  })

  it('leaves attractors no vein reached live, so a longer attraction distance can still grow to them', () => {
    const region = new Region(presetRings('ellipse', 160, 200, 8))
    const attractors = placeAttractors(region, 2500, 'even', 4).points
    const e = new Engine(region, attractors, { ...params, attraction: 1.5 }, { roots: [[80, 100]] })
    for (let i = 0; i < 4000 && e.stepOnce(); i++) { /* grow */ }
    expect(e.done).toBe('out-of-reach')
    expect(e.live).toBeGreaterThan(2000)
    e.setParams({ ...params, attraction: 0 })
    let grew = 0
    for (let i = 0; i < 4000; i++) { const c = e.stepOnce(); if (!c) break; grew += c.grew }
    expect(grew).toBeGreaterThan(1000)
  })
})

describe('obstacles', () => {
  it('never uses up an attractor across a gap no vein can cross', () => {
    // Two islands 1 mm apart; veins start on the left one. Attractors right by the gap on the right island are
    // within the kill distance of veins on the left, but those veins can't see them.
    const rings: Ring[] = [rectRing(0, 0, 50, 100), rectRing(51, 0, 100, 100)]
    const region = new Region(rings)
    const attractors = placeAttractors(region, 3000, 'even', 6).points
    const e = new Engine(region, attractors, { ...params, topology: 'open', kill: 2 }, { roots: [[25, 50]] })
    for (let i = 0; i < 4000 && e.stepOnce(); i++) { /* grow */ }
    let rightUsed = 0
    for (let i = 0; i < attractors.length / 2; i++) if (e.used[i] && attractors[i * 2] > 50.5) rightUsed++
    expect(rightUsed).toBe(0)
    for (let v = 0; v < e.points; v++) expect(e.x[v]).toBeLessThan(50)
  })

  it('counts a hole’s area against the shape, so a grid fills a ring or an inverted shape', () => {
    const ring = new Region(presetRings('ring', 200, 200, 0))
    const outer = Math.PI * 100 * 100, inner = Math.PI * 36 * 36
    expect(ring.area).toBeGreaterThan((outer - inner) * 0.99)
    expect(ring.area).toBeLessThan((outer - inner) * 1.01)
    const inverted = new Region(invertRings([ellipseRing(100, 100, 60, 60)], 200, 200))
    expect(inverted.area).toBeCloseTo(200 * 200 - Math.PI * 3600, -2)
    expect(placeAttractors(inverted, 4000, 'grid', 3).points.length / 2).toBe(4000)
  })

  it('does not treat a star as convex', () => {
    const star: Ring = Array.from({ length: 5 }, (_, i) => { const a = (i * 4 * Math.PI) / 5 - Math.PI / 2; return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)] as [number, number] })
    expect(isConvex(star)).toBe(false)
    expect(isConvex(ellipseRing(0, 0, 10, 5))).toBe(true)
  })

  it('fills a thin frame with exactly the count asked for, even placed at random', () => {
    // A 0.5 mm wall: about 1 % of the box, so a sample often misses.
    const frame = new Region([rectRing(0, 0, 200, 200), rectRing(0.5, 0.5, 199.5, 199.5)])
    for (const placement of ['random', 'even'] as const) expect(placeAttractors(frame, 3000, placement, 8).points.length / 2).toBe(3000)
  })
})
