// Tests for problems an independent code review found in 1.0.0 before release.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptyHistory, record } from './history'
import { parseProject } from './project'
import { drawScene } from './render'
import type { Scene } from './scene'
import { keepSession } from './session'
import { DEFAULTS } from './settings'

const good = JSON.parse(readFileSync('test-fixtures/minimal-v1.vessel.json', 'utf8'))
const imported = { name: 'x.svg', sized: 'file', width: 100, height: 100, rings: [[[10, 10], [90, 10], [90, 90]]] }

describe('project files refuse damage that would reach the exports', () => {
  it('refuses outline points that aren’t numbers, and coordinates far off any sheet', () => {
    const bad = (patch: object) => () => parseProject(JSON.stringify({ ...good, ...patch }))
    expect(bad({ settings: { ...good.settings, shape: 'imported' }, imported: { ...imported, rings: [[['a', 'b'], [90, 10], [90, 90]]] } })).toThrow(/isn’t a point/)
    expect(bad({ settings: { ...good.settings, shape: 'imported' }, imported: { ...imported, rings: [[5, [90, 10], [90, 90]]] } })).toThrow(/isn’t a point/)
    expect(bad({ attractors: [30, 40, 1e300, 50, 60, 70] })).toThrow(/far outside/)
    expect(bad({ roots: [[50, 1e9]] })).toThrow(/isn’t a point/)
    // An outline with too few points is dropped rather than written as an empty path.
    const opened = parseProject(JSON.stringify({ ...good, settings: { ...good.settings, shape: 'imported' }, imported: { ...imported, rings: [[], ...imported.rings] } }))
    expect(opened.imported?.rings).toHaveLength(1)
  })
})

describe('PNG hairlines', () => {
  it('never sets a line width of 0, which canvas ignores, keeping the last width', () => {
    const widths: number[] = []
    const ctx = new Proxy({}, {
      get: (_, key) => (key === 'canvas' ? {} : () => undefined),
      set: (_, key, value) => { if (key === 'lineWidth') widths.push(value as number); return true },
    }) as unknown as CanvasRenderingContext2D
    const scene: Scene = { width: 100, height: 100, systems: 1, rings: null, attractors: null, roots: null,
      veins: [{ points: [[10, 10], [20, 20]], width: 2 }, { points: [[30, 30], [40, 40]], width: 0.01 }] }
    // 30 pixels per inch: a 0.01 mm vein is a hundredth of a pixel.
    drawScene(ctx, scene, { ...DEFAULTS, tipWidth: 0.01 }, { scale: 30 / 25.4, ox: 0, oy: 0 }, { background: null, minPx: 0 })
    expect(widths.length).toBe(2)
    expect(Math.min(...widths)).toBeGreaterThan(0)
    expect(Math.min(...widths)).toBeLessThan(0.1)
  })
})

describe('the session kept between visits', () => {
  const store = () => {
    const map = new Map<string, string>([['s', 'older design'], ['u', '0']])
    return { map, set: (k: string, v: string) => { if (v.length > 10) return false; map.set(k, v); return true }, remove: (k: string) => { map.delete(k) } }
  }
  it('removes the older copy when the design is too big to keep, or the browser refuses it', () => {
    const a = store()
    expect(keepSession(a, 's', 'u', 'x'.repeat(50), true, 20)).toBe('too-big')
    expect(a.map.has('s')).toBe(false)
    const b = store()
    expect(keepSession(b, 's', 'u', 'x'.repeat(15), true, 20)).toBe('failed')
    expect(b.map.has('s')).toBe(false)
    const c = store()
    expect(keepSession(c, 's', 'u', 'new', true, 20)).toBe('kept')
    expect(c.map.get('s')).toBe('new')
    expect(c.map.get('u')).toBe('1')
  })

  it('doesn’t build a copy an estimate already shows is too big', () => {
    const a = store()
    let built = 0
    expect(keepSession(a, 's', 'u', () => { built++; return 'x'.repeat(50) }, true, 20, 900)).toBe('too-big')
    expect(built).toBe(0)
    expect(a.map.has('s')).toBe(false)
    expect(keepSession(a, 's', 'u', () => { built++; return 'new' }, true, 20, 3)).toBe('kept')
    expect(built).toBe(1)
  })
})

describe('undo history', () => {
  it('keeps no more steps than the limit given', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < 30; i++) h = record(h, i, null, i * 1000, 8)
    expect(h.past).toEqual([22, 23, 24, 25, 26, 27, 28, 29])
  })
})
