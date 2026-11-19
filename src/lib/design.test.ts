import { describe, expect, it } from 'vitest'
import { Engine } from '../veins/engine'
import type { Ring } from '../veins/geometry'
import { Region } from '../veins/region'
import { freshDesign, planChange, regionOf, shapeRings, type Design, type Imported } from './design'
import type { PictureData } from './picture'
import { atIllustratorSize, shapeFromDrawing } from './importShape'
import { parseProject, projectJson } from './project'
import { applyPreset, DEFAULTS, growthParams, PRESETS } from './settings'

// A design grown part way, as the page would hold it.
function grown(d: Design, steps: number): Design {
  const e = new Engine(regionOf(d.settings, d.imported), d.attractors, growthParams(d.settings), { roots: d.roots })
  for (let i = 0; i < steps; i++) e.stepOnce()
  const s = e.snapshot()
  return { ...d, growth: { step: s.step, rng: s.rng, idle: s.idle ?? 0, done: s.done, x: Float64Array.from(s.x), y: Float64Array.from(s.y), parent: Int32Array.from(s.parent), joins: Int32Array.from(s.joins), used: Uint8Array.from(s.used) } }
}

const square = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

describe('changes to a design', () => {
  it('keeps a reopened Picture design’s veins through ordinary edits, though the picture isn’t saved', () => {
    // A dark disc in the middle of a white picture.
    const picture: PictureData = { name: 'photo.png', width: 20, height: 20, dark: Float32Array.from({ length: 400 }, (_, i) => (Math.hypot((i % 20) - 9.5, Math.floor(i / 20) - 9.5) < 6 ? 1 : 0)) }
    const s = { ...applyPreset({ ...DEFAULTS, width: 120, height: 160, count: 1200 }, 'neural'), placement: 'picture' as const }
    const start = planChange(freshDesign(s, null, null), {}, null, picture, { replace: true }).next
    const d = grown(start, 40)
    const reopened = parseProject(projectJson(d, 'test'))
    // No picture is loaded after reopening. A colour change and a view toggle keep everything.
    for (const patch of [{ veinColor: '#123456' }, { showAttractors: true }]) {
      const planned = planChange(reopened, patch, reopened.imported, null)
      expect(planned.restarts).toBe(false)
      expect(planned.next.growth.x.length).toBe(d.growth.x.length)
    }
    // A change that needs the picture says so, and places evenly.
    const recount = planChange(reopened, { count: 1500 }, reopened.imported, null)
    expect(recount.restarts).toBe(true)
    expect(recount.noPicture).toBe(true)
  })

  it('treats an edited SVG re-imported under the same name and page size as a new shape', () => {
    const base = { ...applyPreset({ ...DEFAULTS, width: 100, height: 100, count: 600 }, 'leaf'), shape: 'imported' as const, leafGrowth: false }
    const first: Imported = { name: 'shape.svg', sized: 'file', width: 100, height: 100, rings: [square(10, 10, 90, 90)] }
    const d = grown(freshDesign(base, first, null), 30)
    const triangle: Imported = { name: 'shape.svg', sized: 'file', width: 100, height: 100, rings: [[[50, 8], [92, 92], [8, 92]]] }
    const planned = planChange(d, {}, triangle, null)
    expect(planned.restarts).toBe(true)
    const region = new Region(shapeRings(planned.next.settings, triangle))
    const a = planned.next.attractors
    for (let i = 0; i < a.length; i += 2) expect(region.contains(a[i], a[i + 1])).toBe(true)
    for (const [x, y] of planned.next.roots) expect(region.contains(x, y)).toBe(true)
  })

  it('keeps an imported shape when a preset is picked, and a built-in shape takes the preset’s', () => {
    for (const p of PRESETS) {
      const s = applyPreset({ ...DEFAULTS, width: 381, height: 381, shape: 'imported' }, p.id)
      expect(s.shape).toBe('imported')
      expect(s.count).toBe(p.values.count)
    }
    expect(applyPreset({ ...DEFAULTS, shape: 'rect' }, 'arterial').shape).toBe('ellipse')
  })

  it('never stretches an imported outline: a sheet of other proportions fits it and centres it', () => {
    // Gil's pill page is 296.4 × 160.5 mm. Typed down to 10 mm wide, the sheet can't be under 10 mm tall.
    const imported: Imported = { name: 'pill.svg', sized: 'illustrator', width: 296.4, height: 160.5, rings: [square(0, 0, 296.4, 160.5)] }
    const [ring] = shapeRings({ ...DEFAULTS, width: 10, height: 10, shape: 'imported' }, imported)
    const k = 10 / 296.4
    expect(ring[0][0]).toBeCloseTo(0, 9)
    expect(ring[2][0]).toBeCloseTo(10, 9)
    // As tall as it should be for its width, and centred top to bottom.
    expect(ring[2][1] - ring[0][1]).toBeCloseTo(160.5 * k, 9)
    expect(ring[0][1]).toBeCloseTo((10 - 160.5 * k) / 2, 9)
  })

  it('stays finished when every attractor is reached, whatever growth setting changes', () => {
    // The Leaf preset on A4 reaches all 4,000 of its attractors.
    const s = applyPreset({ ...DEFAULTS }, 'leaf')
    const d = freshDesign(s, null, null)
    const e = new Engine(regionOf(s, null), d.attractors, growthParams(s), { roots: d.roots })
    for (let i = 0; i < 4000 && e.stepOnce(); i++) { /* grow */ }
    expect(e.done).toBe('reached')
    e.setParams({ ...growthParams(s), segment: s.segment / 2 })
    expect(e.done).toBe('reached')
    expect(e.stepOnce()).toBeNull()
  })

  it('reads a file with no stated size again at Illustrator’s 72 points per inch, when asked', () => {
    const im: Imported = { name: 'b.svg', sized: 'css', width: 228.6, height: 228.6, rings: [square(10, 10, 100, 100)] }
    const big = atIllustratorSize(im)
    // 9 in read at 96 per inch is 12 in at 72.
    expect(big.width).toBeCloseTo(304.8, 6)
    expect(big.sized).toBe('illustrator')
    expect(big.rings[0][2]).toEqual([100 * (96 / 72), 100 * (96 / 72)])
  })

  it('says when outlines make a frame, so veins grow in its band rather than its opening', () => {
    const drawing = (rings: Ring[]) => ({ width: 200, height: 200, paths: rings.map((points, element) => ({ closed: true, points, element })), units: 'file' as const, fromClip: false, clipped: 0, texts: 0 })
    // A 180 mm panel with a 20 mm frame: the opening is most of it.
    const framed = shapeFromDrawing(drawing([square(10, 10, 190, 190), square(30, 30, 170, 170)]), 'screen.svg', 'mm', 300)
    if ('error' in framed) throw new Error(framed.error)
    expect(framed.notes.join(' ')).toMatch(/make a frame/)
    // A leaf with a small hole is no frame.
    const holed = shapeFromDrawing(drawing([square(10, 10, 190, 190), square(90, 90, 110, 110)]), 'leaf.svg', 'mm', 300)
    if ('error' in holed) throw new Error(holed.error)
    expect(holed.notes.join(' ')).not.toMatch(/frame/)
  })

  it('grows only in the part of a drawing that is on its page, as with a bleed', () => {
    // A 100 mm page with a disc centred on its right edge: half of it lies off the page.
    const disc: Ring = Array.from({ length: 120 }, (_, i): [number, number] => [100 + 40 * Math.cos((i / 120) * 2 * Math.PI), 50 + 40 * Math.sin((i / 120) * 2 * Math.PI)])
    const drawing = { width: 100, height: 100, paths: [{ closed: true, points: disc, element: 0 }], units: 'file' as const, fromClip: false, clipped: 0, texts: 0 }
    const shape = shapeFromDrawing(drawing, 'bleed.svg', 'mm', 300)
    if ('error' in shape) throw new Error(shape.error)
    expect(shape.warnings.join(' ')).toMatch(/runs past its page/)
    for (const invert of [false, true]) {
      const s = { ...DEFAULTS, width: 100, height: 100, shape: 'imported' as const, invert, count: 2000, leafGrowth: false }
      const d = freshDesign(s, shape.imported, null)
      const a = d.attractors
      for (let i = 0; i < a.length; i += 2) { expect(a[i]).toBeLessThanOrEqual(100); expect(a[i + 1]).toBeLessThanOrEqual(100) }
      // The half disc on the page, or the page less that half disc.
      const half = (Math.PI * 40 * 40) / 2
      expect(regionOf(s, shape.imported).area).toBeCloseTo(invert ? 100 * 100 - half : half, -1)
    }
  })

  it('scales an imported outline with the sheet, keeping its place on the page', () => {
    const imported: Imported = { name: 'shape.svg', sized: 'file', width: 100, height: 100, rings: [square(5, 5, 95, 95)] }
    const s = { ...DEFAULTS, width: 200, height: 200, shape: 'imported' as const }
    const [ring] = shapeRings(s, imported)
    expect(ring[0]).toEqual([10, 10])
    expect(ring[2]).toEqual([190, 190])
  })
})
