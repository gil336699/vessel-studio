import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Engine } from '../veins/engine'
import { smoothChain, type Cubic } from '../veins/network'
import { mergeStrokeBands } from '../veins/strokes'
import { freshDesign, regionOf, shapeRings, type Imported } from './design'
import { designDxf } from './dxfExport'
import { forExport, sceneOf } from './scene'
import { applyPreset, DEFAULTS, growthParams, type Settings } from './settings'
import { readSvgDrawing } from './svgImport'
import { designSvg } from './svgExport'

// A design grown to the end and its export scene.
function grown(s: Settings, imported: Imported | null) {
  const d = freshDesign(s, imported, null)
  const region = regionOf(s, imported)
  const e = new Engine(region, d.attractors, growthParams(s), { roots: d.roots })
  for (let i = 0; i < 4000 && !e.snapshot().done; i++) e.stepOnce()
  const g = e.snapshot()
  const scene = sceneOf(s, shapeRings(s, imported), { x: g.x, y: g.y, parent: g.parent, joins: g.joins, points: g.x.length }, d.attractors, Uint8Array.from(g.used), d.roots)
  return { region, scene }
}

// Points along a cubic from (x0, y0).
function along(x0: number, y0: number, [a, b, c, d, x, y]: Cubic, n: number): [number, number][] {
  return Array.from({ length: n }, (_, k) => {
    const t = (k + 1) / n, u = 1 - t
    return [u * u * u * x0 + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x, u * u * u * y0 + 3 * u * u * t * b + 3 * u * t * t * d + t * t * t * y]
  })
}

// Every point along the veins of an SVG export, 64 to a curve.
function svgVeinPoints(svg: string): [number, number][] {
  const veins = svg.slice(svg.indexOf('<g id="veins"'), svg.indexOf('</g>', svg.indexOf('<g id="veins"')))
  const out: [number, number][] = []
  for (const [, d] of veins.matchAll(/ d="([^"]+)"/g)) {
    let x = 0, y = 0
    for (const cmd of d.match(/[MCL][^MCL]*/g) ?? []) {
      const v = cmd.slice(1).trim().split(/[\s,]+/).map(Number)
      if (cmd[0] === 'M' || cmd[0] === 'L') { x = v[0]; y = v[1]; out.push([x, y]); continue }
      for (let i = 0; i + 5 < v.length; i += 6) { const c = v.slice(i, i + 6) as Cubic; out.push(...along(x, y, c, 64)); x = c[4]; y = c[5] }
    }
  }
  return out
}

const gilsShape = (name: string): Imported => {
  const drawing = readSvgDrawing(readFileSync(new URL(`../../test-fixtures/${name}.svg`, import.meta.url), 'utf8'))
  return { name: `${name}.svg`, sized: drawing.units, width: drawing.width, height: drawing.height, rings: mergeStrokeBands(drawing.paths.filter(p => p.closed).map(p => p.points)).rings }
}

describe('smooth curves in exports', () => {
  it('stay inside the shape at sharp loop joins, where plain curves swing out of it', () => {
    const s = applyPreset({ ...DEFAULTS }, 'capillary')
    const { region, scene } = grown(s, null)
    // Plain Catmull–Rom curves through these veins leave the leaf somewhere.
    let plainOut = 0
    for (const c of scene.veins ?? []) {
      if (c.points.length < 3) continue
      let [x, y] = c.points[0]
      for (const cubic of smoothChain(c.points)) { for (const [px, py] of along(x, y, cubic, 64)) if (!region.contains(px, py)) plainOut++; [x, y] = [cubic[4], cubic[5]] }
    }
    expect(plainOut).toBeGreaterThan(0)
    // The exported SVG's curves don't.
    const points = svgVeinPoints(designSvg(forExport(scene, s, region), s))
    expect(points.length).toBeGreaterThan(100000)
    expect(points.filter(([x, y]) => !region.contains(x, y)).length).toBe(0)
  })

  it('keep the edge clearance in the SVG and the DXF', () => {
    const imported = gilsShape('TestingShape_1-04')
    const s: Settings = { ...applyPreset({ ...DEFAULTS, width: imported.width, height: imported.height, shape: 'imported' }, 'loops'), clearance: 2, units: 'mm' }
    const { region, scene } = grown(s, imported)
    const exported = forExport(scene, s, region)
    const svgPoints = svgVeinPoints(designSvg(exported, s))
    expect(svgPoints.filter(([x, y]) => region.edgeDistance(x, y, 2) < 2 - 1e-6).length).toBe(0)
    // DXF: polylines in the sheet's units with y up. Every segment between vertices keeps the clearance.
    const dxf = designDxf(exported, s)
    const lines = dxf.split('\n')
    let checked = 0, close = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== 'POLYLINE' || lines[i + 2] !== 'VEINS') continue
      const vs: [number, number][] = []
      for (let k = i; k < lines.length && lines[k] !== 'SEQEND'; k++) if (lines[k] === 'VERTEX') vs.push([Number(lines[k + 4]), s.height - Number(lines[k + 6])])
      for (let k = 1; k < vs.length; k++) { checked++; if (!region.clearOf(vs[k - 1][0], vs[k - 1][1], vs[k][0], vs[k][1], 2 - 1e-6)) close++ }
    }
    expect(checked).toBeGreaterThan(10000)
    expect(close).toBe(0)
  })

  it('reads its own SVG back as the shape alone, not its attractor and root dots', () => {
    const s = { ...applyPreset({ ...DEFAULTS }, 'leaf'), showAttractors: true, showRoots: true }
    const { region, scene } = grown(s, null)
    const svg = designSvg(forExport(scene, s, region), s)
    expect(svg).toMatch(/<circle /)
    const back = readSvgDrawing(svg)
    expect(back.paths.filter(p => p.closed)).toHaveLength(scene.rings?.length ?? 0)
  })
})
