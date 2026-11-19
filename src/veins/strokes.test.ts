import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readSvgDrawing } from '../lib/svgImport'
import { ellipseRing, rectRing, signedArea, type Ring } from './geometry'
import { Rng } from './random'
import { Region } from './region'
import { mergeStrokeBands } from './strokes'

// Gil's TestingShapes, 2026-11-18: Illustrator files, 1080 × 1080 pt pages.
const rings = (name: string): Ring[] =>
  readSvgDrawing(readFileSync(new URL(`../../test-fixtures/${name}.svg`, import.meta.url), 'utf8')).paths.filter(p => p.closed).map(p => p.points)
const area = (r: Ring) => Math.abs(signedArea(r))
const circle = (cx: number, cy: number, r: number, n = 180): Ring => ellipseRing(cx, cy, r, r, n)

describe('outlines drawn as outlined strokes', () => {
  it.each(['TestingShape_1-01', 'TestingShape_1-02', 'TestingShape_1-03'])('reads %s as a boundary and a hole, with the veins off the drawn lines', name => {
    const drawn = rings(name)
    expect(drawn).toHaveLength(4)
    const m = mergeStrokeBands(drawn)
    expect(m.pairs).toBe(2)
    expect(m.rings).toHaveLength(2)
    // The boundary keeps its band's inner edge and the hole its band's outer edge: the 2nd and 3rd largest.
    const [a0, a1, a2, a3] = drawn.map(area).sort((p, q) => p - q)
    expect(m.rings.map(area).sort((p, q) => p - q)).toEqual([a1, a2])
    expect(a3 - a2).toBeLessThan(0.02 * a3)
    expect(a1 - a0).toBeLessThan(0.05 * a1)
    // The band is the stroke Gil drew, under 1.2 mm.
    expect(m.width).toBeGreaterThan(0.5)
    expect(m.width).toBeLessThan(1.2)
    // Read as drawn, there's only the bands: under 3 % of the shape. Merged, it's the shape less its hole.
    const before = new Region(drawn), after = new Region(m.rings)
    expect(before.area).toBeLessThan(0.03 * a2)
    expect(after.area).toBeCloseTo(a2 - a1, 0)
    // Nowhere veins can grow is on a drawn line.
    const rng = new Rng(7)
    const [x0, y0, x1, y1] = after.box
    let inside = 0
    for (let i = 0; i < 20000; i++) {
      const x = x0 + (x1 - x0) * rng.next(), y = y0 + (y1 - y0) * rng.next()
      if (!after.contains(x, y)) continue
      inside++
      expect(before.contains(x, y)).toBe(false)
    }
    expect(inside).toBeGreaterThan(5000)
  })

  it.each(['TestingShape_1-04', 'TestingShape_1-05', 'pill-with-hole'])('leaves %s, drawn with ordinary outlines, as it is', name => {
    const drawn = rings(name)
    const m = mergeStrokeBands(drawn)
    expect(m.pairs).toBe(0)
    expect(m.rings).toBe(drawn)
  })

  it('leaves a wide frame a frame, and an outline that hugs another only part of the way a real shape', () => {
    // A 100 mm square with a 20 mm frame.
    expect(mergeStrokeBands([rectRing(0, 0, 100, 100), rectRing(20, 20, 80, 80)]).pairs).toBe(0)
    // A disc and a dented disc inside it: 0.5 mm apart round most of the edge, 6 mm at the dent.
    const outer = circle(150, 150, 100)
    const dented = circle(150, 150, 99.5).map(([x, y], i): [number, number] => {
      if (i >= 36) return [x, y]
      const k = 94 / 99.5
      return [150 + (x - 150) * k, 150 + (y - 150) * k]
    })
    expect(mergeStrokeBands([outer, dented]).pairs).toBe(0)
  })

  it('reads a small hole drawn with the same stroke as a line too, though it is too small to tell on its own', () => {
    // A 200 mm disc and a 10 mm hole, both drawn with a 0.8 mm stroke centred on the line.
    const w = 0.8
    const drawn = [circle(150, 150, 100 + w / 2), circle(150, 150, 100 - w / 2), circle(150, 90, 5 + w / 2, 72), circle(150, 90, 5 - w / 2, 72)]
    const m = mergeStrokeBands(drawn)
    expect(m.pairs).toBe(2)
    expect(m.width).toBeCloseTo(w, 1)
    // The boundary's inner edge and the hole's outer edge.
    expect(m.rings.map(area).sort((p, q) => p - q)).toEqual([area(drawn[2]), area(drawn[1])])
    // On its own, the small one stays as drawn.
    expect(mergeStrokeBands(drawn.slice(2)).pairs).toBe(0)
  })

  it('keeps an island inside a hole as a boundary, by its inner edge', () => {
    const w = 1
    const pair = (r: number): Ring[] => [circle(150, 150, r + w / 2), circle(150, 150, r - w / 2)]
    const drawn = [...pair(100), ...pair(60), ...pair(30)]
    const m = mergeStrokeBands(drawn)
    expect(m.pairs).toBe(3)
    // Boundary 100 by its inner edge, hole 60 by its outer edge, island 30 by its inner edge.
    expect(m.rings.map(area).sort((p, q) => p - q)).toEqual([area(drawn[5]), area(drawn[2]), area(drawn[1])])
  })

  it('reads a drawing of nearly 1,000 outlines quickly, as it does on every change to the shape', () => {
    // 484 washers, each a disc with a hole: 968 outlines, none of them strokes. Measured 2026-11-18 on this
    // Mac: 52 ms for the shape and 6 ms for the stroke check; testing every pair of outlines took 26 s.
    const rings: Ring[] = []
    for (let i = 0; i < 22; i++) for (let j = 0; j < 22; j++) rings.push(circle(10 + i * 20, 10 + j * 20, 8, 64), circle(10 + i * 20, 10 + j * 20, 3, 32))
    const t = performance.now()
    const region = new Region(rings)
    const m = mergeStrokeBands(rings)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(m.pairs).toBe(0)
    expect(region.area).toBeCloseTo(484 * (area(rings[0]) - area(rings[1])), 3)
  }, 60000)
})
