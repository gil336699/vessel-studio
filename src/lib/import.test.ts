import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Engine } from '../veins/engine'
import { boxOf, rectRing, type Ring, type Vec } from '../veins/geometry'
import { fitToSheet, freshDesign, hasGrown, regionOf, type Imported } from './design'
import { atIllustratorSize, shapeFromDrawing } from './importShape'
import { applyPreset, DEFAULTS, growthParams } from './settings'
import { readSvgDrawing, type SvgDrawing } from './svgImport'

const fixture = (name: string) => readFileSync(new URL(`../../test-fixtures/${name}`, import.meta.url), 'utf8')
const imported = (svg: string, name = 'shape.svg') => {
  const shape = shapeFromDrawing(readSvgDrawing(svg), name, 'mm', 300)
  if ('error' in shape) throw new Error(shape.error)
  return shape
}
const drawing = (w: number, h: number, rings: Ring[], elements?: number[]): SvgDrawing =>
  ({ width: w, height: h, paths: rings.map((points, i) => ({ closed: true, points, element: elements?.[i] ?? i })), units: 'file', fromClip: false, clipped: 0, texts: 0 })

describe('importing drawings', () => {
  it('grows in a bow tie or a figure of eight drawn as one path, whose halves cancel in its signed area', () => {
    const shapes = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="150mm" viewBox="0 0 200 150"><path d="M10,10 L190,140 L190,10 L10,140 Z"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100"><path d="M100,50 C130,10 190,10 190,50 C190,90 130,90 100,50 C70,10 10,10 10,50 C10,90 70,90 100,50 Z"/></svg>',
    ]
    for (const svg of shapes) {
      const { imported: im } = imported(svg)
      const s = { ...applyPreset({ ...DEFAULTS, width: im.width, height: im.height, shape: 'imported' }, 'leaf'), leafGrowth: false }
      const region = regionOf(s, im)
      expect(region.area).toBeGreaterThan(1000)
      const d = freshDesign(s, im, null)
      expect(d.attractors.length / 2).toBe(s.count)
      // Each half is a part with a root of its own.
      expect(d.roots.length).toBeGreaterThanOrEqual(1)
      const e = new Engine(region, d.attractors, growthParams(s), { roots: d.roots })
      for (let i = 0; i < 3000 && !e.snapshot().done; i++) e.stepOnce()
      expect(e.points).toBeGreaterThan(1000)
    }
  })

  it('says so when nothing in the file is on its page, rather than importing an empty shape', () => {
    // A 100 mm page whose only shape was moved off the artboard.
    const shape = shapeFromDrawing(drawing(100, 100, [rectRing(150, 20, 190, 60)]), 'moved.svg', 'mm', 300)
    expect('error' in shape && shape.error).toMatch(/lie on its page/)
  })

  it('keeps a panel set in its frame’s opening with an even gap round it, which only looks like an outlined stroke', () => {
    // The designer's facade: a frame with three openings, and a panel in each, 10 mm in from its edges, drawn on its own.
    const all = imported(fixture('facade-all.svg'), 'facade-all.svg')
    expect(all.notes.join(' ')).not.toMatch(/outlined stroke/)
    expect(all.parts).toBe(4)
    // An outlined stroke is one compound path, its two edges in the same element: that is still read as one line.
    const stroke = shapeFromDrawing(drawing(200, 200, [rectRing(10, 10, 190, 190), rectRing(11, 11, 189, 189)], [0, 0]), 'stroke.svg', 'mm', 300)
    if ('error' in stroke) throw new Error(stroke.error)
    expect(stroke.notes.join(' ')).toMatch(/outlined stroke/)
  })

  it('notes a frame with several openings, and a frame round other shapes, each in its own words', () => {
    // Three openings: 40, 27 and 10 % of the outline, none of them half on its own.
    const frame = imported(fixture('facade-frame.svg'), 'facade-frame.svg')
    expect(frame.notes.join(' ')).toMatch(/make a frame/)
    // A badge whose letters sit inside its ring: veins grow in the ring and the letters, so it says the ring grows too.
    const logo = imported(fixture('illustrator-logo.svg'), 'illustrator-logo.svg')
    expect(logo.notes.join(' ')).not.toMatch(/import that opening/)
    expect(logo.notes.join(' ')).toMatch(/frame round the other shapes/)
  })

  it('says how much a drawing larger than any sheet was scaled, and how to get it back to full size', () => {
    // A 4,200 × 3,000 mm facade on a 3 m sheet: 71 %.
    const big = shapeFromDrawing(drawing(4200, 3000, [rectRing(100, 100, 4100, 2900)]), 'facade.svg', 'mm', 300)
    if ('error' in big) throw new Error(big.error)
    expect(big.imported.width).toBeCloseTo(3000, 6)
    expect(big.warnings.join(' ')).toMatch(/4200 mm × 3000 mm, larger than the largest sheet \(3000 mm a side\), so it was scaled to 71 %.*enlarge them by 140 %/)
  })

  it('reads a page again at 72 points per inch within the sheet limits, keeping its proportions', () => {
    // A 2,400 × 600 mm page read at 96 per inch is 3,200 × 800 mm at 72: more than the largest sheet.
    const im: Imported = { name: 'long.svg', sized: 'css', width: 2400, height: 600, rings: [rectRing(0, 0, 2400, 600)] }
    const { imported: at72, warnings } = atIllustratorSize(im, 'mm', 300)
    expect(at72.width).toBeCloseTo(3000, 6)
    expect(at72.height).toBeCloseTo(750, 6)
    const [x0, y0, x1, y1] = boxOf(at72.rings)
    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(4, 6)
    expect(warnings.join(' ')).toMatch(/scaled to 94 %/)
    expect(at72.sized).toBe('points')
  })

  it('subtracts art trimmed at the sheet’s corner from the sheet when growing outside it', () => {
    // A disc centred on the bottom right corner: a quarter of it is on the sheet, along two of its edges.
    const disc: Ring = Array.from({ length: 240 }, (_, i): Vec => [200 + 60 * Math.cos((i / 240) * 2 * Math.PI), 150 + 60 * Math.sin((i / 240) * 2 * Math.PI)])
    const im: Imported = { name: 'corner.svg', sized: 'file', width: 200, height: 150, rings: [disc] }
    const s = { ...DEFAULTS, width: 200, height: 150, shape: 'imported' as const, invert: true }
    const region = regionOf(s, im)
    expect(region.area).toBeCloseTo(200 * 150 - (Math.PI * 60 * 60) / 4, -2)
    expect(region.parts()).toHaveLength(1)
  })

  it('places again the attractors of a project saved before shapes were trimmed to the sheet, or sets them aside once grown', () => {
    // Saved by 1.2.0: a 100 mm page whose disc runs off its right edge, with attractors placed in the whole disc.
    const disc: Ring = Array.from({ length: 120 }, (_, i): Vec => [100 + 40 * Math.cos((i / 120) * 2 * Math.PI), 50 + 40 * Math.sin((i / 120) * 2 * Math.PI)])
    const im: Imported = { name: 'bleed.svg', sized: 'file', width: 100, height: 100, rings: [disc] }
    const s = { ...DEFAULTS, width: 100, height: 100, shape: 'imported' as const, count: 1000 }
    const d = freshDesign(s, im, null)
    const old = { ...d, attractors: Float64Array.from(Array.from({ length: 1000 }, (_, i) => [100 + 30 * Math.cos(i), 50 + 30 * Math.sin(i)]).flat()) }
    const { design: placed, off } = fitToSheet(old)
    expect(off).toBeGreaterThan(300)
    const region = regionOf(s, im)
    for (let i = 0; i < placed.attractors.length; i += 2) expect(region.contains(placed.attractors[i], placed.attractors[i + 1])).toBe(true)
    // Grown, the veins stay; the attractors off the sheet count as used, as no vein can reach them.
    const grown = { ...old, growth: { ...old.growth, step: 5 } }
    const kept = fitToSheet(grown)
    expect(hasGrown(kept.design)).toBe(true)
    expect(kept.design.attractors).toBe(grown.attractors)
    const usedCount = kept.design.growth.used.reduce((n, u) => n + u, 0)
    expect(usedCount).toBe(kept.off)
    // A project saved since, with its shape on the sheet, opens as it was.
    expect(fitToSheet(d).design).toBe(d)
  })
})
