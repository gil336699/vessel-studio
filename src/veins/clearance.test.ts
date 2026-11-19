import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { freshDesign, planChange, regionOf, type Design, type Imported } from '../lib/design'
import { applyPreset, DEFAULTS, growthParams, sanitizeSettings, type Settings } from '../lib/settings'
import { readSvgDrawing } from '../lib/svgImport'
import { Engine } from './engine'
import { rectRing, type Ring, type Vec } from './geometry'
import { Region } from './region'
import { mergeStrokeBands } from './strokes'

// Gil's TestingShape 1-01 (a rounded triangle with a triangular window, drawn as outlined strokes), imported.
function gilsShape(): Imported {
  const drawing = readSvgDrawing(readFileSync(new URL('../../test-fixtures/TestingShape_1-01.svg', import.meta.url), 'utf8'))
  const rings = mergeStrokeBands(drawing.paths.filter(p => p.closed).map(p => p.points)).rings
  return { name: 'TestingShape_1-01.svg', sized: drawing.units, width: drawing.width, height: drawing.height, rings }
}

// Grows a design to the end and checks every root, attractor, vein and join against the clearance.
function growAndCheck(d: Design, c: number) {
  const region = regionOf(d.settings, d.imported)
  const near = (x: number, y: number) => region.edgeDistance(x, y, c) < c - 1e-9
  const a = d.attractors
  let closeAttractors = 0
  for (let i = 0; i < a.length; i += 2) if (near(a[i], a[i + 1])) closeAttractors++
  const closeRoots = d.roots.filter(([x, y]) => near(x, y)).length
  const e = new Engine(region, d.attractors, growthParams(d.settings), { roots: d.roots })
  for (let i = 0; i < 4000 && !e.snapshot().done; i++) e.stepOnce()
  const s = e.snapshot()
  let closeVeins = 0, closeJoins = 0
  for (let i = 0; i < s.x.length; i++) {
    const p = s.parent[i]
    if (p >= 0 && !region.clearOf(s.x[p], s.y[p], s.x[i], s.y[i], c - 1e-9)) closeVeins++
  }
  for (let k = 0; k + 1 < s.joins.length; k += 2) {
    const u = s.joins[k], v = s.joins[k + 1]
    if (!region.clearOf(s.x[u], s.y[u], s.x[v], s.y[v], c - 1e-9)) closeJoins++
  }
  let left = 0
  for (let i = 0; i < s.used.length; i++) if (!s.used[i]) left++
  return { closeAttractors, closeRoots, closeVeins, closeJoins, points: s.x.length, joins: s.joins.length / 2, left, total: s.used.length, done: s.done }
}

const onGilsShape = (preset: 'leaf' | 'loops', c: number): Design => {
  const imported = gilsShape()
  const s: Settings = { ...applyPreset({ ...DEFAULTS, width: imported.width, height: imported.height, shape: 'imported' }, preset), clearance: c, count: 2500 }
  return freshDesign(s, imported, null)
}

describe('edge clearance', () => {
  it('keeps open veins, their roots and attractors 3 mm clear of Gil’s outline and its window, and still fills it', () => {
    const r = growAndCheck(onGilsShape('leaf', 3), 3)
    expect(r).toMatchObject({ closeAttractors: 0, closeRoots: 0, closeVeins: 0 })
    expect(r.points).toBeGreaterThan(2000)
    expect(r.left / r.total).toBeLessThan(0.01)
  })

  it('keeps loops and their joins clear too', () => {
    const r = growAndCheck(onGilsShape('loops', 3), 3)
    expect(r).toMatchObject({ closeAttractors: 0, closeRoots: 0, closeVeins: 0, closeJoins: 0 })
    expect(r.joins).toBeGreaterThan(300)
    expect(r.left / r.total).toBeLessThan(0.01)
  })

  it('joins loops only along clear lines, even round a hole full of sharp points', () => {
    // A star-shaped hole whose 12 points poke into the sheet: a join between veins either side of a point can pass
    // closer to its tip than either vein is. Without the join test, two joins here came within 0.6 mm of a tip.
    const star: Ring = Array.from({ length: 24 }, (_, i): Vec => {
      const r = i % 2 ? 24 : 46, t = (i / 24) * 2 * Math.PI
      return [100 + r * Math.cos(t), 100 + r * Math.sin(t)]
    })
    const imported: Imported = { name: 'star.svg', sized: 'file', width: 200, height: 200, rings: [rectRing(0, 0, 200, 200), star] }
    const s: Settings = { ...DEFAULTS, width: 200, height: 200, shape: 'imported', loops: true, leafGrowth: false, segment: 1, kill: 8, clearance: 2, count: 4000 }
    const r = growAndCheck(freshDesign(s, imported, null), 2)
    expect(r).toMatchObject({ closeAttractors: 0, closeRoots: 0, closeVeins: 0, closeJoins: 0 })
    expect(r.joins).toBeGreaterThan(200)
  })

  it('measures a segment’s whole length, not just its ends, so a vein can’t cut close past a corner', () => {
    // A square hole from 50 to 60. The segment's ends are 15 from the hole; its middle passes 7.07 from the corner.
    const region = new Region([rectRing(0, 0, 120, 120), rectRing(50, 50, 60, 60)])
    expect(region.clearOf(55, 75, 75, 55, 7)).toBe(true)
    expect(region.clearOf(55, 75, 75, 55, 7.2)).toBe(false)
    expect(region.edgeDistance(55, 75, 20)).toBeCloseTo(15, 9)
    expect(region.edgeDistance(75, 55, 20)).toBeCloseTo(15, 9)
  })

  it('places the attractors again and moves the roots in when the clearance changes', () => {
    const d = freshDesign({ ...DEFAULTS }, null, null)
    const planned = planChange(d, { clearance: 6 }, null, null)
    expect(planned.restarts).toBe(true)
    expect(planned.short).toBe(false)
    const region = regionOf(planned.next.settings, null)
    const a = planned.next.attractors
    expect(a.length / 2).toBe(DEFAULTS.count)
    for (let i = 0; i < a.length; i += 2) expect(region.edgeDistance(a[i], a[i + 1], 6)).toBeGreaterThanOrEqual(6)
    for (const [x, y] of planned.next.roots) expect(region.edgeDistance(x, y, 6)).toBeGreaterThanOrEqual(6)
  })

  it('is off unless set, and never more than an eighth of the sheet', () => {
    expect(DEFAULTS.clearance).toBe(0)
    expect(sanitizeSettings({}).clearance).toBe(0)
    expect(sanitizeSettings({ clearance: -2 }).clearance).toBe(0)
    expect(sanitizeSettings({ width: 210, height: 297, clearance: 500 }).clearance).toBeCloseTo(210 / 8, 9)
  })
})
