import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Engine } from '../veins/engine'
import { chains, veinWidths } from '../veins/network'
import { freshDesign, regionOf, shapeRings, type Imported } from './design'
import { designDxf } from './dxfExport'
import { sceneContents, sceneOf } from './scene'
import { applyPreset, DEFAULTS, growthParams, widthSettings, type Settings } from './settings'
import { readSvgDrawing } from './svgImport'
import { designSvg } from './svgExport'

function grown(s: Settings, imported: Imported | null = null, steps = 400) {
  const d = freshDesign(s, imported, null)
  const e = new Engine(regionOf(s, imported), d.attractors, growthParams(s), { roots: d.roots })
  for (let i = 0; i < steps && e.stepOnce(); i++) { /* grow */ }
  const net = { x: e.x, y: e.y, parent: e.parent, joins: e.joins, points: e.points }
  return { d, e, net, scene: (t: Settings) => sceneOf(t, shapeRings(t, imported), net, d.attractors, e.used, d.roots) }
}

const base = applyPreset({ ...DEFAULTS, width: 150, height: 200, count: 1500 }, 'leaf')

describe('exports hold what the view shows', () => {
  it('writes the veins as one path per vein between forks, at real size, with each part on its own layer', () => {
    // Part way through, so some attractors are still in play.
    const g = grown({ ...base, showAttractors: true }, null, 120)
    const scene = g.scene({ ...base, showAttractors: true })
    const svg = designSvg(scene, base)
    expect(g.e.live).toBeGreaterThan(50)
    expect(svg).toContain('width="150mm" height="200mm" viewBox="0 0 150 200"')
    const count = (re: RegExp) => (svg.match(re) ?? []).length
    expect(count(/<g id="veins"/g)).toBe(1)
    expect(count(/<g id="shape"/g)).toBe(1)
    expect(count(/<g id="roots"/g)).toBe(1)
    expect(count(/<g id="attractors"/g)).toBe(1)
    const paths = count(/<path stroke-width=/g)
    expect(paths).toBe(scene.veins!.length)
    expect(paths).toBeGreaterThan(200)
    // As many paths as the tree has veins between forks, and as many circles as attractors still in play.
    const live = Array.from(g.e.used).filter(u => !u).length
    expect(count(/<circle /g)).toBe(live + g.d.roots.length)
    // No background rectangle, which laser software would engrave.
    expect(svg).not.toContain('<rect')
    expect(sceneContents(scene)).toEqual(['the veins', 'the shape', 'the attractors', 'the roots'])
  })

  it('leaves out every part that is switched off, and says when nothing would be exported', () => {
    const hidden = { ...base, showVeins: false, showBoundary: false, showRoots: false, showAttractors: false }
    const g = grown(base, null, 50)
    const scene = g.scene(hidden)
    expect(sceneContents(scene)).toEqual([])
    const svg = designSvg(scene, hidden)
    expect(svg).not.toContain('<path')
    expect(svg).not.toContain('<circle')
    expect(designDxf(scene, hidden)).not.toContain('POLYLINE')
  })

  it('gives Murray widths in millimetres, thickest at the root', () => {
    const g = grown(base)
    const widths = veinWidths(g.net.parent, g.net.points, widthSettings(base))
    const c = chains(g.net.x, g.net.y, g.net.parent, g.net.joins, g.net.points, widths)
    const svg = designSvg(g.scene(base), base)
    const ws = [...svg.matchAll(/stroke-width="([\d.]+)" d=/g)].map(m => Number(m[1]))
    expect(Math.min(...ws)).toBeCloseTo(base.tipWidth, 3)
    expect(Math.max(...ws)).toBeGreaterThan(base.tipWidth * 3)
    expect(Math.max(...ws)).toBeLessThanOrEqual(base.maxWidth + 1e-9)
    expect(c.length).toBe(ws.length)
  })

  it('writes DXF R12 with a layer per part, y flipped, in the sheet’s units', () => {
    const g = grown({ ...base, showAttractors: true }, null, 80)
    const scene = g.scene({ ...base, showAttractors: true })
    const dxf = designDxf(scene, base)
    expect(dxf).toContain('AC1009')
    for (const layer of ['VEINS', 'SHAPE', 'ATTRACTORS', 'ROOTS']) expect(dxf).toContain(`\n2\n${layer}\n`)
    expect((dxf.match(/\nPOLYLINE\n8\nVEINS\n/g) ?? []).length).toBe(scene.veins!.length)
    // The first root, at the leaf's base near the bottom, sits near the top in DXF's y-up coordinates.
    const [rx, ry] = g.d.roots[0]
    expect(dxf).toContain(`\nCIRCLE\n8\nROOTS\n10\n${Number(rx.toFixed(4))}\n20\n${Number((200 - ry).toFixed(4))}\n`)
    const inches = designDxf(scene, { ...base, units: 'in' })
    expect(inches).toContain('$INSUNITS\n70\n1')
  })

  it('grows in Gil’s Illustrator outline at its real size and keeps out of its hole', () => {
    const drawing = readSvgDrawing(readFileSync('test-fixtures/pill-with-hole.svg', 'utf8'))
    expect(drawing.units).toBe('illustrator')
    const imported: Imported = { name: 'pill-with-hole.svg', sized: drawing.units, width: drawing.width, height: drawing.height, rings: drawing.paths.filter(p => p.closed).map(p => p.points) }
    // 840.08 × 455 pt at 72 pt per inch.
    expect(drawing.width).toBeCloseTo((840.08 / 72) * 25.4, 3)
    const s = { ...applyPreset({ ...DEFAULTS, width: drawing.width, height: drawing.height, count: 1500 }, 'arterial'), shape: 'imported' as const }
    const g = grown(s, imported)
    const region = regionOf(s, imported)
    for (let v = 0; v < g.net.points; v++) expect(region.contains(g.net.x[v], g.net.y[v])).toBe(true)
    expect(g.net.points).toBeGreaterThan(500)
  })
})
