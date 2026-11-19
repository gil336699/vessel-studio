import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { placeAttractors } from '../veins/attractors'
import { Engine } from '../veins/engine'
import { pointInRing, rectRing, signedArea, type Ring } from '../veins/geometry'
import { Region } from '../veins/region'
import { freshDesign, planChange, regionOf, startRoots, type Imported } from './design'
import { shapeFromDrawing } from './importShape'
import { applyPreset, DEFAULTS, growthParams, type Settings } from './settings'
import { readSvgDrawing } from './svgImport'

// An SVG from test-fixtures, imported as the Shape tab does it.
function imported(name: string): Imported {
  const shape = shapeFromDrawing(readSvgDrawing(readFileSync(new URL(`../../test-fixtures/${name}`, import.meta.url), 'utf8')), name, 'mm', 300)
  if ('error' in shape) throw new Error(shape.error)
  return shape.imported
}
const onSheet = (im: Imported, extra: Partial<Settings> = {}): Settings => ({ ...applyPreset({ ...DEFAULTS, width: im.width, height: im.height, shape: 'imported' }, 'leaf'), ...extra })

// Grown to the end: the share of attractors no vein reached.
function leftOver(s: Settings, im: Imported | null): number {
  const d = freshDesign(s, im, null)
  const e = new Engine(regionOf(s, im), d.attractors, growthParams(s), { roots: d.roots })
  for (let i = 0; i < 4000 && !e.snapshot().done; i++) e.stepOnce()
  return e.live / (d.attractors.length / 2)
}

describe('roots in every part of a shape', () => {
  it('gives each letter of an outlined word and each part of a logo its own root, so all of it grows', () => {
    // Made in Illustrator 2027 and saved with Export As: "Arbore" in Futura Bold, and a badge with "FERN & CO".
    for (const [name, parts] of [['illustrator-word.svg', 6], ['illustrator-logo.svg', 13]] as const) {
      const im = imported(name), s = onSheet(im)
      const region = regionOf(s, im)
      expect(region.parts()).toHaveLength(parts)
      const roots = startRoots(s, region)
      expect(roots).toHaveLength(parts)
      // Each root is inside the shape and in a different part: the smallest outline round it, as letters can sit
      // inside a badge's ring.
      const smallestFirst = [...region.parts()].sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)))
      const owners = roots.map(([x, y]) => { expect(region.contains(x, y)).toBe(true); return smallestFirst.findIndex(r => pointInRing(r, x, y)) })
      expect(new Set(owners).size).toBe(parts)
      expect(leftOver(s, im)).toBeLessThan(0.02)
    }
  })

  it('roots every letter with presets that start veins at the centre, and after a sheet preset', () => {
    const im = imported('illustrator-word.svg')
    // Arterial, Neural and Capillary start veins at the centre: of each part, for a word.
    for (const preset of ['arterial', 'neural', 'capillary'] as const) {
      const s = applyPreset({ ...DEFAULTS, width: im.width, height: im.height, shape: 'imported' }, preset)
      const region = regionOf(s, im)
      const roots = startRoots(s, region, 'centre')
      const smallestFirst = [...region.parts()].sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)))
      expect(new Set(roots.map(([x, y]) => smallestFirst.findIndex(r => pointInRing(r, x, y)))).size).toBe(6)
    }
    // A square sheet for a long word: the outline is fitted and centred, and its roots move with it.
    const s = onSheet(im)
    const d = freshDesign(s, im, null)
    const next = planChange(d, { width: 200, height: 200 }, im, null).next
    const region = regionOf(next.settings, im)
    const smallestFirst = [...region.parts()].sort((a, b) => Math.abs(signedArea(a)) - Math.abs(signedArea(b)))
    const owners = new Set(next.roots.map(([x, y]) => smallestFirst.findIndex(r => pointInRing(r, x, y))))
    expect(owners.has(-1)).toBe(false)
    expect(owners.size).toBe(6)
  })

  it('roots every part of a drawing with many, such as a page of small letters', () => {
    // 90 small squares in a grid on a 300 × 200 mm sheet.
    const rings: Ring[] = []
    for (let i = 0; i < 15; i++) for (let j = 0; j < 6; j++) rings.push(rectRing(10 + i * 19, 10 + j * 30, 22 + i * 19, 30 + j * 30))
    const im: Imported = { name: 'grid.svg', sized: 'file', width: 300, height: 200, rings }
    const s = onSheet(im)
    expect(startRoots(s, regionOf(s, im))).toHaveLength(90)
  })

  it('gives a root even to a part too small to count as an area of its own, such as the dot of an i', () => {
    // A 280 × 200 mm panel and a 3 mm square dot well away from it, on a 300 × 220 mm sheet.
    const im: Imported = { name: 'dot.svg', sized: 'file', width: 300, height: 220, rings: [rectRing(10, 10, 290, 210), [[150, 212], [153, 212], [153, 215], [150, 215]]] }
    const s = onSheet(im)
    const roots = startRoots(s, regionOf(s, im))
    expect(roots.some(([x, y]) => x > 150 && x < 153 && y > 212 && y < 215)).toBe(true)
  })

  it('puts a root clicked just outside a corner next to that corner, not halfway along an edge', () => {
    // The Rectangle shape on A4 with a 12 mm margin; a click 4 mm outside its top-left corner.
    const region = new Region([rectRing(12, 12, 198, 285)])
    const p = region.nearestInside(8, 8, 0.5)!
    expect(region.contains(p[0], p[1])).toBe(true)
    expect(Math.hypot(p[0] - 12, p[1] - 12)).toBeLessThan(3)
  })

  it('finds a point inside from a baseline between two letters', () => {
    // Two letters 4 mm apart, standing on y = 50; the point is on that line, in the gap.
    const region = new Region([rectRing(0, 20, 30, 50), rectRing(34, 20, 64, 50)])
    const p = region.nearestInside(32, 50, 0.5)
    expect(p).not.toBeNull()
    expect(region.contains(p![0], p![1])).toBe(true)
  })

  it('places attractors in an outline that crosses itself', () => {
    // A bow tie drawn as one path: its two halves wind opposite ways, so its signed area is 0.
    const bow: Ring = [[0, 0], [100, 60], [100, 0], [0, 60]]
    const region = new Region([bow])
    expect(region.area).toBeGreaterThan(2800)
    expect(region.area).toBeLessThan(3200)
    expect(placeAttractors(region, 2000, 'even', 1).points.length / 2).toBe(2000)
  })

  it('grows round Gil’s pill and inside its hole when growing outside the shape', () => {
    const im = imported('pill-with-hole.svg'), s = onSheet(im, { invert: true })
    const region = regionOf(s, im)
    const roots = startRoots(s, region)
    // The pill nearly fills its page, so the space round it is in several pieces, each with a root, and its hole has one.
    expect(roots.length).toBeGreaterThanOrEqual(2)
    for (const [x, y] of roots) expect(region.contains(x, y)).toBe(true)
    expect(leftOver(s, im)).toBeLessThan(0.02)
  })

  it('puts edge roots round every part, not just the first outline in the file', () => {
    const im = imported('illustrator-word.svg'), s = onSheet(im)
    const region = regionOf(s, im)
    const roots = startRoots(s, region, 'edge')
    const parts = region.parts()
    const owners = new Set(roots.map(([x, y]) => parts.findIndex(r => pointInRing(r, x, y))))
    expect(owners.size).toBe(parts.length)
  })
})
