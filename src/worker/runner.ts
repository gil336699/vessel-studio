// Owns the growing veins inside the worker. It steps in batches and sends the page one frame at a time, only
// after the page has drawn the last one, so drawing never falls behind and a slow step never freezes the page
// (the pattern of Line Growth's runner). Frames carry only what changed: the new vein points and joins, and the
// attractors used up since the last frame. The page keeps the rest.
import { Engine, type EngineState, type GrowthParams, type StopReason } from '../veins/engine'
import type { Ring, Vec } from '../veins/geometry'
import { Region } from '../veins/region'

export type Load = { gen: number; rings: Ring[]; attractors: Float64Array; params: GrowthParams; roots: Vec[]; state: EngineState | null }

export type Frame = {
  gen: number
  step: number; rng: number; idle: number; done: StopReason | null
  // Vein points from index `from` on, and join pairs from pair `joinFrom` on.
  from: number; x: Float64Array; y: Float64Array; parent: Int32Array
  joinFrom: number; joins: Int32Array
  used: Int32Array // attractors used up since the last frame
  live: number; waiting: number
  stepsPerSecond: number
}

export type ToRunner =
  | { kind: 'load'; load: Load }
  | { kind: 'params'; params: GrowthParams }
  | { kind: 'root'; x: number; y: number }
  // steps: null grows until stopped; a number runs that many steps, as Step does.
  | { kind: 'play'; run: number; steps: number | null; perBatch: number }
  | { kind: 'speed'; perBatch: number }
  | { kind: 'stop' }
  // The page drew the last frame and can take another.
  | { kind: 'ack' }
export type FromRunner =
  | { kind: 'frame'; frame: Frame }
  | { kind: 'stopped'; run: number; frame: Frame }
  | { kind: 'error'; message: string }

type Run = { id: number; remaining: number | null; perBatch: number; timer?: ReturnType<typeof setTimeout> }
const BATCH_MS = 16 // one batch per display frame at most
const DEADLINE_MS = 30 // a batch stops early after this, so Stop and edits never wait long
// Browsers slow a hidden page's timers, even a worker's, to a few a second. A batch then catches up on the
// steps it missed, for up to half the time since the last batch and never more than this.
const CATCH_UP_MS = 120

export function createRunner(post: (message: FromRunner, transfer: Transferable[]) => void, now: () => number = () => performance.now()) {
  let engine: Engine | null = null
  let gen = 0
  let run: Run | null = null
  let lastBatch = 0
  // What the page has: points and join pairs up to these counts.
  let sentPoints = 0, sentJoins = 0
  let used: number[] = []
  let dirty = false, inFlight = false
  let rateSteps = 0, rateStart = 0, rate = 0

  function frame(): [Frame, Transferable[]] {
    const e = engine!
    const n = e.points, j = e.joins.length / 2
    const out: Frame = {
      gen, step: e.step, rng: e.rngState, idle: e.idle, done: e.done,
      from: sentPoints, x: e.x.slice(sentPoints, n), y: e.y.slice(sentPoints, n), parent: e.parent.slice(sentPoints, n),
      joinFrom: sentJoins, joins: e.joins.slice(sentJoins * 2, j * 2),
      used: Int32Array.from(used), live: e.live, waiting: e.waiting, stepsPerSecond: run ? rate : 0,
    }
    sentPoints = n; sentJoins = j; used = []
    dirty = false
    inFlight = true
    return [out, [out.x.buffer, out.y.buffer, out.parent.buffer, out.joins.buffer, out.used.buffer]]
  }
  function flush() {
    if (!engine || !dirty || inFlight) return
    const [out, transfer] = frame()
    post({ kind: 'frame', frame: out }, transfer)
  }
  function end() {
    if (!run) return
    clearTimeout(run.timer)
    const id = run.id
    run = null
    rate = 0
    const [out, transfer] = frame()
    post({ kind: 'stopped', run: id, frame: out }, transfer)
  }

  function batch() {
    const current = run, e = engine
    if (!current || !e) return
    const started = now()
    const since = lastBatch ? Math.min(1000, started - lastBatch) : BATCH_MS
    lastBatch = started
    // Growing runs Speed steps per display frame, catching up when timers fire late; Step runs exactly its count.
    const limit = current.remaining === null ? Math.max(current.perBatch, Math.round((current.perBatch * since) / BATCH_MS)) : Math.min(current.perBatch, current.remaining)
    const deadline = current.remaining === null ? Math.min(CATCH_UP_MS, Math.max(DEADLINE_MS, since / 2)) : DEADLINE_MS
    let steps = 0
    while (steps < limit && (steps === 0 || now() - started < deadline)) {
      const change = e.stepOnce()
      if (!change) break
      for (const s of change.used) used.push(s)
      steps++
      if (e.done) break
    }
    const t = now()
    rateSteps += steps
    if (t - rateStart >= 500) { rate = (rateSteps * 1000) / Math.max(1, t - rateStart); rateSteps = 0; rateStart = t }
    dirty = true
    if (e.done || steps === 0) return end()
    if (current.remaining !== null) {
      current.remaining -= steps
      if (current.remaining <= 0) return end()
    }
    current.timer = setTimeout(guarded(batch), Math.max(0, BATCH_MS - (t - started)))
    flush()
  }

  function fail(error: unknown) {
    if (run) clearTimeout(run.timer)
    run = null
    post({ kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
  const guarded = (fn: () => void) => () => { try { fn() } catch (error) { fail(error) } }

  function handle(message: ToRunner) {
    switch (message.kind) {
      case 'load': {
        if (run) { clearTimeout(run.timer); run = null }
        const { load } = message
        // Built before it's taken on, so a load that fails leaves the last engine and its frames as they were.
        const region = new Region(load.rings)
        const next = new Engine(region.empty ? null : region, load.attractors, load.params, load.state ? { state: load.state } : { roots: load.roots })
        gen = load.gen
        engine = next
        // The page already has this state; the first frame it needs is the next change. With leaf growth, it doesn't
        // know how many attractors are still to appear, so an empty frame tells it.
        sentPoints = engine.points; sentJoins = engine.joins.length / 2; used = []
        dirty = engine.waiting > 0; inFlight = false
        flush()
        return
      }
      case 'ack': inFlight = false; flush(); return
    }
    const e = engine
    if (!e) return
    switch (message.kind) {
      case 'params': e.setParams(message.params); dirty = true; flush(); return
      case 'speed': if (run) run.perBatch = Math.max(1, message.perBatch); return
      case 'play':
        if (run) clearTimeout(run.timer)
        run = { id: message.run, remaining: message.steps, perBatch: Math.max(1, message.perBatch) }
        rateSteps = 0; rateStart = now(); rate = 0; lastBatch = 0
        run.timer = setTimeout(guarded(batch), 0)
        return
      case 'stop': end(); return
      case 'root': e.addRoot(message.x, message.y); dirty = true; flush(); return
    }
  }

  return { handle: (message: ToRunner) => guarded(() => handle(message))() }
}
