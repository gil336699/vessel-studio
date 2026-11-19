import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { placeAttractors } from '../veins/attractors'
import { Engine, type GrowthParams } from '../veins/engine'
import { Region } from '../veins/region'
import { presetRings } from '../veins/shapes'
import { createRunner, type Frame, type FromRunner, type Load } from './runner'

const rings = presetRings('leaf', 120, 160, 6)
const region = new Region(rings)
const attractors = placeAttractors(region, 1200, 'even', 2).points
const params: GrowthParams = { segment: 1.2, kill: 2, attraction: 0, topology: 'open', inertia: 0.2, wiggle: 0.2, pull: 0, pullMode: 'up', crowd: 0.45, leafSteps: 80, minLoop: 8, maxPoints: 100_000, seed: 3 }
const roots: [number, number][] = [[60, 150]]
const load = (gen = 1): Load => ({ gen, rings, attractors, params, roots, state: null })

// The page's mirror: what it rebuilds from frames alone.
function mirror(frames: Frame[]) {
  // It starts with the roots it sent.
  const x: number[] = [60], y: number[] = [150], parent: number[] = [-1], joins: number[] = []
  const used = new Set<number>()
  for (const f of frames) {
    expect(f.from).toBe(x.length)
    x.push(...f.x); y.push(...f.y); parent.push(...f.parent)
    expect(f.joinFrom * 2).toBe(joins.length)
    joins.push(...f.joins)
    for (const s of f.used) used.add(s)
  }
  return { x, y, parent, joins, used }
}

describe('growth worker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends one frame at a time, carrying only changes, and ends a set number of steps exactly where a direct run does', () => {
    const got: FromRunner[] = []
    let clock = 0
    const runner = createRunner(message => got.push(message), () => (clock += 1))
    runner.handle({ kind: 'load', load: load() })
    runner.handle({ kind: 'play', run: 1, steps: 90, perBatch: 7 })
    vi.advanceTimersByTime(20)
    expect(got.filter(m => m.kind === 'frame')).toHaveLength(1)
    // Without an acknowledgement the worker keeps stepping but sends nothing more.
    vi.advanceTimersByTime(300)
    expect(got.filter(m => m.kind === 'frame')).toHaveLength(1)
    for (let i = 0; i < 80 && !got.some(m => m.kind === 'stopped'); i++) { runner.handle({ kind: 'ack' }); vi.advanceTimersByTime(20) }
    const stopped = got.find(m => m.kind === 'stopped')
    expect(stopped?.kind).toBe('stopped')
    if (stopped?.kind !== 'stopped') return
    expect(stopped.frame.step).toBe(90)
    expect(stopped.frame.done).toBeNull()
    const frames = got.flatMap(m => (m.kind === 'frame' || m.kind === 'stopped' ? [m.frame] : []))
    const page = mirror(frames)
    const direct = new Engine(region, attractors, params, { roots })
    for (let i = 0; i < 90; i++) direct.stepOnce()
    expect(page.x.length).toBeGreaterThan(500)
    expect([...direct.x]).toEqual(page.x)
    expect([...direct.y]).toEqual(page.y)
    expect([...direct.parent]).toEqual(page.parent)
    expect([...page.used].sort((a, b) => a - b)).toEqual([...direct.used].flatMap((u, i) => (u ? [i] : [])))
    expect(stopped.frame.rng).toBe(direct.rngState)
  })

  it('stops when asked, and a new load replaces the old growth', () => {
    const got: FromRunner[] = []
    const runner = createRunner(message => got.push(message))
    runner.handle({ kind: 'load', load: load(1) })
    runner.handle({ kind: 'play', run: 2, steps: null, perBatch: 3 })
    vi.advanceTimersByTime(100)
    runner.handle({ kind: 'stop' })
    const stopped = got.find(m => m.kind === 'stopped')
    expect(stopped?.kind === 'stopped' && stopped.frame.step).toBeGreaterThan(0)
    expect(stopped?.kind === 'stopped' && stopped.run).toBe(2)
    got.length = 0
    runner.handle({ kind: 'load', load: load(2) })
    runner.handle({ kind: 'play', run: 3, steps: 1, perBatch: 3 })
    vi.advanceTimersByTime(20)
    const next = got.find(m => m.kind === 'stopped')
    expect(next?.kind === 'stopped' && next.frame.gen).toBe(2)
    expect(next?.kind === 'stopped' && next.frame.step).toBe(1)
  })
  it('sends a frame when growth settings change, so a finished growth that can carry on says so', () => {
    const got: FromRunner[] = []
    const runner = createRunner(message => got.push(message))
    runner.handle({ kind: 'load', load: { ...load(4), params: { ...params, attraction: 1 } } })
    runner.handle({ kind: 'play', run: 5, steps: null, perBatch: 50 })
    for (let i = 0; i < 200 && !got.some(m => m.kind === 'stopped'); i++) { vi.advanceTimersByTime(20); runner.handle({ kind: 'ack' }) }
    const stopped = got.find(m => m.kind === 'stopped')
    expect(stopped?.kind === 'stopped' && stopped.frame.done).toBe('out-of-reach')
    got.length = 0
    runner.handle({ kind: 'ack' })
    runner.handle({ kind: 'params', params: { ...params, attraction: 0 } })
    const frame = got.find(m => m.kind === 'frame')
    expect(frame?.kind === 'frame' && frame.frame.done).toBeNull()
  })
})
