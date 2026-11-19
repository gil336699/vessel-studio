import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Engine } from '../veins/engine'
import { engineState, freshDesign, regionOf } from './design'
import { parseProject, projectJson, ProjectError } from './project'
import { applyPreset, DEFAULTS, growthParams } from './settings'

const settings = applyPreset({ ...DEFAULTS, width: 120, height: 170, count: 1500, wiggle: 0.3 }, 'loops')

describe('project files', () => {
  it('reopens a half-grown design that then grows exactly like an unbroken run', () => {
    const d = freshDesign(settings, null, null)
    const region = regionOf(d.settings, null)
    const whole = new Engine(region, d.attractors, growthParams(d.settings), { roots: d.roots })
    for (let i = 0; i < 180; i++) whole.stepOnce()
    const half = new Engine(region, d.attractors, growthParams(d.settings), { roots: d.roots })
    for (let i = 0; i < 90; i++) half.stepOnce()
    const s = half.snapshot()
    const saved = { ...d, growth: { step: s.step, rng: s.rng, idle: s.idle ?? 0, done: s.done, x: Float64Array.from(s.x), y: Float64Array.from(s.y), parent: Int32Array.from(s.parent), joins: Int32Array.from(s.joins), used: Uint8Array.from(s.used) } }
    const reopened = parseProject(projectJson(saved, '1.0.0'))
    expect(reopened.settings).toEqual(d.settings)
    expect(Array.from(reopened.attractors)).toEqual(Array.from(d.attractors))
    const again = new Engine(regionOf(reopened.settings, null), reopened.attractors, growthParams(reopened.settings), { state: engineState(reopened.growth) })
    for (let i = 0; i < 90; i++) again.stepOnce()
    expect(whole.joins.length).toBeGreaterThan(10)
    expect(Array.from(again.x)).toEqual(Array.from(whole.x))
    expect(Array.from(again.y)).toEqual(Array.from(whole.y))
    expect(Array.from(again.parent)).toEqual(Array.from(whole.parent))
    expect(Array.from(again.joins)).toEqual(Array.from(whole.joins))
    expect(again.rngState).toBe(whole.rngState)
  })

  it('opens the version 1 file in test-fixtures, filling settings it lacks with defaults', () => {
    const d = parseProject(readFileSync('test-fixtures/minimal-v1.vessel.json', 'utf8'))
    expect(d.settings.units).toBe('mm')
    expect(d.settings.tipWidth).toBe(DEFAULTS.tipWidth)
    expect(d.settings.count).toBe(300)
    expect(d.roots).toEqual([[50, 90]])
    expect(d.growth.x.length).toBe(3)
    expect(Array.from(d.growth.used)).toEqual([0, 1, 0])
  })

  it('refuses bad files with a plain message', () => {
    const good = JSON.parse(readFileSync('test-fixtures/minimal-v1.vessel.json', 'utf8'))
    const bad = (patch: object) => () => parseProject(JSON.stringify({ ...good, ...patch }))
    expect(() => parseProject('not json')).toThrow(ProjectError)
    expect(() => parseProject('{"schema":"line-growth","version":1}')).toThrow(/isn’t a Vessel Studio project/)
    expect(bad({ version: 2 })).toThrow(/newer Vessel Studio/)
    expect(bad({ attractors: [1, 2, 3] })).toThrow(/missing a coordinate/)
    expect(bad({ growth: { ...good.growth, parent: [-1, 2, 1] } })).toThrow(/comes after it/)
    expect(bad({ growth: { ...good.growth, joins: [0, 9] } })).toThrow(/isn’t there/)
    expect(bad({ settings: { ...good.settings, shape: 'imported' } })).toThrow(/imported shape/)
  })
})
