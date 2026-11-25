import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Engine, type Root } from '../veins/engine'
import { pointInRing } from '../veins/geometry'
import { Mirror } from '../useVeins'
import { createRunner, type FromRunner } from '../worker/runner'
import { engineState, freshDesign, placementKey, planChange, regionOf, rootSystem, shapeRings, startRoots, type Design, type Imported } from './design'
import { designDxf, LAYER_JOINS, LAYER_VEINS, systemLayer } from './dxfExport'
import { shapeFromDrawing } from './importShape'
import { parseProject, projectJson } from './project'
import { forExport, sceneOf } from './scene'
import { applyPreset, DEFAULTS, growthParams, type Settings } from './settings'
import { readSvgDrawing } from './svgImport'
import { designSvg } from './svgExport'

// Two or three systems through the design: roots for each system, attractors, project files, exports and the worker.

function imported(name: string): Imported {
  const shape = shapeFromDrawing(readSvgDrawing(readFileSync(new URL(`../../test-fixtures/${name}`, import.meta.url), 'utf8')), name, 'mm', 300)
  if ('error' in shape) throw new Error(shape.error)
  return shape.imported
}
const onSheet = (im: Imported, s: Settings): Settings => ({ ...s, width: im.width, height: im.height, shape: 'imported' })
// A smaller A5 sheet keeps the growth quick.
const a5 = { ...DEFAULTS, width: 148, height: 210 }
const joinPreset = applyPreset(a5, 'join'), weavePreset = applyPreset(a5, 'interweave')

// The design grown to the end, as the page would hold it.
function grown(d: Design, steps = 3000): Design {
  const e = new Engine(regionOf(d.settings, d.imported), d.attractors, growthParams(d.settings), { roots: d.roots })
  for (let i = 0; i < steps && !e.done; i++) e.stepOnce()
  const s = e.snapshot()
  return { ...d, growth: { step: s.step, rng: s.rng, idle: s.idle ?? 0, done: s.done, x: Float64Array.from(s.x), y: Float64Array.from(s.y), parent: Int32Array.from(s.parent), sys: Int32Array.from(s.sys ?? []), joins: Int32Array.from(s.joins), links: Int32Array.from(s.links ?? []), used: Uint8Array.from(s.used) } }
}
const sceneFor = (d: Design) => sceneOf(d.settings, shapeRings(d.settings, d.imported), { ...d.growth, points: d.growth.x.length }, d.attractors, d.growth.used, d.roots)
const systemsOf = (roots: Root[]) => roots.map(rootSystem)

describe('roots for two or three systems', () => {
  it('put the inlet at one end of the shape and the outlet at the other, across its longer side', () => {
    const tall = freshDesign(joinPreset, null, null, startRoots(joinPreset, regionOf(joinPreset, null), 'ends'))
    expect(systemsOf(tall.roots)).toEqual([0, 1])
    const [[, inletY], [, outletY]] = tall.roots
    expect(inletY).toBeGreaterThan(a5.height * 0.9)
    expect(outletY).toBeLessThan(a5.height * 0.1)
    // On a wide sheet the ellipse lies across it: the inlet on the left, the outlet on the right.
    const wide = { ...joinPreset, width: 210, height: 148 }
    const [[inletX], [outletX]] = startRoots(wide, regionOf(wide, null), 'ends')
    expect(inletX).toBeLessThan(210 * 0.1)
    expect(outletX).toBeGreaterThan(210 * 0.9)
  })

  it('give every part of a drawing its own inlet and outlet, at its two ends', () => {
    const im = imported('earrings.svg'), s = onSheet(im, joinPreset)
    const region = regionOf(s, im)
    const roots = startRoots(s, region, 'shape')
    for (const part of region.parts()) {
      const own = roots.filter(([x, y]) => pointInRing(part, x, y))
      expect(own.map(rootSystem).sort()).toEqual([0, 1])
      // At the part's ends, across its longer side, not side by side.
      const xs = part.map(p => p[0]), ys = part.map(p => p[1])
      const long = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      expect(Math.hypot(own[0][0] - own[1][0], own[0][1] - own[1][1])).toBeGreaterThan(0.6 * long)
    }
  })

  it('take turns round the edge, six for each system, with every letter of a word getting each system', () => {
    const roots = startRoots(weavePreset, regionOf(weavePreset, null), 'edge')
    expect(systemsOf(roots)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1])
    const im = imported('illustrator-word.svg'), s = onSheet(im, weavePreset)
    const region = regionOf(s, im)
    const word = startRoots(s, region, 'edge')
    for (const part of region.parts()) expect(new Set(word.filter(([x, y]) => pointInRing(part, x, y)).map(rootSystem))).toEqual(new Set([0, 1]))
    // A drawing of many small parts, more than twelve roots go round: still one of each system round every part.
    const dots: Imported = { name: 'dots.svg', sized: 'file', width: 200, height: 200, rings: Array.from({ length: 30 }, (_, k): [number, number][] => {
      const x = 15 + (k % 6) * 30, y = 25 + Math.floor(k / 6) * 35
      return [[x, y], [x + 16, y], [x + 16, y + 16], [x, y + 16]]
    }) }
    const many = onSheet(dots, weavePreset), dotRegion = regionOf(many, dots)
    const dotRoots = startRoots(many, dotRegion, 'edge')
    for (const part of dotRegion.parts()) expect(new Set(dotRoots.filter(([x, y]) => pointInRing(part, x, y)).map(rootSystem))).toEqual(new Set([0, 1]))
  })

  it('put a root for each system side by side where one system has one, far enough apart for their veins', () => {
    const roots = startRoots(weavePreset, regionOf(weavePreset, null), 'base')
    expect(systemsOf(roots)).toEqual([0, 1])
    expect(Math.abs(roots[1][0] - roots[0][0])).toBeGreaterThanOrEqual(2 * weavePreset.maxWidth + 2 * weavePreset.gap - 1e-9)
  })

  it('are placed again for a new number of systems when a rule placed them, and keep their systems when placed by hand', () => {
    const one = freshDesign(a5, null, null)
    const two = planChange(one, { systems: 2, coupling: 'join' }, null, null).next
    expect(systemsOf(two.roots)).toEqual([0, 1])
    // A root of system B placed by hand stays B through a new sheet size.
    const hand: Design = { ...two, rootsBy: undefined, roots: [[74, 180], [74, 40, 1]] }
    const bigger = planChange(hand, { width: 200, height: 280 }, null, null).next
    expect(systemsOf(bigger.roots)).toEqual([0, 1])
  })
})

describe('attractors for two or three systems', () => {
  it('give each interwoven system Count of its own, while Join’s trees share Count, and leave one system’s placement as it was', () => {
    expect(freshDesign(weavePreset, null, null).attractors.length / 2).toBe(weavePreset.count * 2)
    expect(freshDesign(joinPreset, null, null).attractors.length / 2).toBe(joinPreset.count)
    // Joining or interweaving the same count places them differently, as does a second system.
    expect(placementKey({ ...weavePreset, coupling: 'join' }, null)).not.toBe(placementKey(weavePreset, null))
    expect(placementKey({ ...joinPreset, systems: 1 }, null)).not.toBe(placementKey(joinPreset, null))
    // One system: the same key as 1.4.0, so a reopened design keeps its attractors through ordinary edits.
    expect(placementKey(DEFAULTS, null)).toBe(JSON.stringify([210, 297, 12, 'leaf', false, 4000, 'even', 1, '', 0]))
  })
})

describe('project files with two systems', () => {
  it('keep every root’s system and the joins between the trees, and carry on exactly where they stopped', () => {
    const d = freshDesign(joinPreset, null, null, startRoots(joinPreset, regionOf(joinPreset, null), 'ends'))
    const half = grown(d, 80)
    const text = projectJson(half, '1.5.0')
    expect(JSON.parse(text).version).toBe(2)
    const back = parseProject(text)
    expect(back.roots).toEqual(half.roots)
    expect(Array.from(back.growth.sys)).toEqual(Array.from(half.growth.sys))
    expect(Array.from(back.growth.links)).toEqual(Array.from(half.growth.links))
    // Reopened, it grows on exactly as the unbroken run.
    const region = regionOf(back.settings, null)
    const again = new Engine(region, back.attractors, growthParams(back.settings), { state: engineState(back.growth) })
    const whole = new Engine(region, d.attractors, growthParams(d.settings), { roots: d.roots })
    for (let i = 0; i < 160; i++) { whole.stepOnce(); if (i >= 80) again.stepOnce() }
    expect(Array.from(again.links)).toEqual(Array.from(whole.links))
    expect(Array.from(again.x)).toEqual(Array.from(whole.x))
  })

  it('write a design of one system as version 1, as before, so older versions still open it', () => {
    const file = JSON.parse(projectJson(grown(freshDesign(a5, null, null), 40), '1.5.0'))
    expect(file.version).toBe(1)
    expect(file.growth.sys).toBeUndefined()
    expect(file.growth.links).toBeUndefined()
    expect(file.roots.every((r: number[]) => r.length === 2)).toBe(true)
  })

  it('refuse a root of a system that isn’t A, B or C', () => {
    const file = JSON.parse(projectJson(freshDesign(joinPreset, null, null), '1.5.0'))
    file.roots[0] = [10, 10, 3]
    expect(() => parseProject(JSON.stringify(file))).toThrow(/A, B or C/)
  })
})

describe('exports with two systems', () => {
  const d = grown(freshDesign(joinPreset, null, null, startRoots(joinPreset, regionOf(joinPreset, null), 'ends')))
  const scene = forExport(sceneFor(d), d.settings, regionOf(d.settings, null))

  it('put each system and the joins on layers of their own, in their own colours', () => {
    const svg = designSvg(scene, d.settings)
    expect(svg).toContain(`id="veins-a" inkscape:groupmode="layer" inkscape:label="System A" fill="none" stroke="${joinPreset.veinColor}"`)
    expect(svg).toContain(`id="veins-b" inkscape:groupmode="layer" inkscape:label="System B" fill="none" stroke="${joinPreset.veinColorB}"`)
    expect(svg).toContain(`id="joins" inkscape:groupmode="layer" inkscape:label="Joins" fill="none" stroke="${joinPreset.linkColor}"`)
    expect(svg).not.toContain('id="veins"')
    const dxf = designDxf(scene, d.settings).split('\n')
    for (const layer of [systemLayer(0), systemLayer(1), LAYER_JOINS]) expect(dxf.filter((line, i) => line === layer && dxf[i - 1] === '8').length).toBeGreaterThan(0)
    expect(dxf).not.toContain(LAYER_VEINS)
    // One system: one Veins layer, as before.
    const single = grown(freshDesign(a5, null, null), 60)
    const one = designSvg(sceneFor(single), single.settings)
    expect(one).toContain('id="veins" inkscape:groupmode="layer" inkscape:label="Veins"')
    expect(designDxf(sceneFor(single), single.settings).split('\n')).toContain(LAYER_VEINS)
  })

  it('leave out the dead ends with Trim dead ends on, so every vein drawn carries flow', () => {
    const count = (s: Settings, settled = true) => sceneOf(s, shapeRings(s, null), { ...d.growth, points: d.growth.x.length }, d.attractors, d.growth.used, d.roots, { settled }).veins!
      .filter(c => !c.link).reduce((n, c) => n + c.points.length - 1, 0)
    const trimmed = count(d.settings), all = count({ ...d.settings, trim: false })
    expect(all).toBe(d.growth.x.length - d.roots.length)
    expect(trimmed).toBeLessThan(all * 0.8)
    // While growing, the view shows every vein: veins still meeting the other tree aren't dead ends yet.
    expect(count(d.settings, false)).toBe(all)
  })
})

describe('the worker with two systems', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends each new point’s system and the joins between the trees, so the page’s copy matches the engine', () => {
    const d = freshDesign(joinPreset, null, null, startRoots(joinPreset, regionOf(joinPreset, null), 'ends'))
    const got: FromRunner[] = []
    let clock = 0
    const runner = createRunner(message => got.push(message), () => (clock += 1))
    runner.handle({ kind: 'load', load: { gen: 1, rings: shapeRings(d.settings, null), attractors: d.attractors, params: growthParams(d.settings), roots: d.roots, state: engineState(d.growth) } })
    runner.handle({ kind: 'play', run: 1, steps: 200, perBatch: 9 })
    const m = new Mirror()
    m.reset(d.growth)
    for (let i = 0; i < 400 && !got.some(x => x.kind === 'stopped'); i++) {
      vi.advanceTimersByTime(20)
      for (const msg of got.splice(0)) {
        if (msg.kind === 'error') throw new Error(msg.message)
        expect(m.apply(msg.frame)).toBe(true)
        if (msg.kind === 'stopped') got.push(msg)
      }
      runner.handle({ kind: 'ack' })
    }
    const direct = new Engine(regionOf(d.settings, null), d.attractors, growthParams(d.settings), { roots: d.roots })
    for (let i = 0; i < 200; i++) direct.stepOnce()
    expect(m.links.length).toBeGreaterThan(0)
    const view = m.view()
    expect(Array.from(view.sys)).toEqual(Array.from(direct.sys))
    expect(Array.from(view.links)).toEqual(Array.from(direct.links))
  })
})
