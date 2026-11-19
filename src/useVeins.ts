// The page's model of a design: settings, shape, roots, attractors and the veins grown so far, with undo,
// unsaved state and the growth worker. The worker owns the veins while they grow. The page keeps a mirror that
// each frame adds to, for drawing, and copies it into the design when growth stops.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Vec } from './veins/geometry'
import { engineState, GROWTH_KEYS, hasGrown, placeFor, placementKey, regionOf, rootsFor, shapeRings, startGrowth, startRoots, type Design, type Growth, type Imported } from './lib/design'
import { emptyHistory, record, redo as redoStep, undo as undoStep, type History } from './lib/history'
import { growthParams, sanitizeSettings, type Settings } from './lib/settings'
import { fitPicture, type PictureData } from './lib/picture'
import { GrowthClient } from './worker/client'
import type { Frame, FromRunner } from './worker/runner'

export type Status = { text: string; warning?: boolean } | null
export type Stats = { revision: number; step: number; points: number; live: number; waiting: number; done: Growth['done']; rate: number }

// The veins as the worker last sent them, in arrays that grow as frames add points.
export class Mirror {
  x = new Float64Array(0); y = new Float64Array(0); parent = new Int32Array(0); joins = new Int32Array(0); used = new Uint8Array(0)
  points = 0; joinPairs = 0
  step = 0; rng = 0; idle = 0; done: Growth['done'] = null; live = 0; waiting = 0

  reset(g: Growth) {
    this.x = grow(new Float64Array(0), g.x.length); this.x.set(g.x)
    this.y = grow(new Float64Array(0), g.y.length); this.y.set(g.y)
    this.parent = grow(new Int32Array(0), g.parent.length); this.parent.set(g.parent)
    this.joins = grow(new Int32Array(0), g.joins.length); this.joins.set(g.joins)
    this.used = g.used.slice()
    this.points = g.x.length; this.joinPairs = g.joins.length / 2
    this.step = g.step; this.rng = g.rng; this.idle = g.idle; this.done = g.done
    this.live = this.used.reduce((n, u) => n + (u ? 0 : 1), 0)
    this.waiting = 0
  }

  // Adds a frame's changes. False when the frame doesn't follow on from what's here.
  apply(f: Frame): boolean {
    if (f.from !== this.points || f.joinFrom !== this.joinPairs) return false
    const n = this.points + f.x.length
    this.x = grow(this.x, n); this.y = grow(this.y, n); this.parent = grow(this.parent, n)
    this.x.set(f.x, this.points); this.y.set(f.y, this.points); this.parent.set(f.parent, this.points)
    this.points = n
    const j = this.joinPairs * 2 + f.joins.length
    this.joins = grow(this.joins, j); this.joins.set(f.joins, this.joinPairs * 2)
    this.joinPairs = j / 2
    for (const s of f.used) this.used[s] = 1
    this.step = f.step; this.rng = f.rng; this.idle = f.idle; this.done = f.done; this.live = f.live; this.waiting = f.waiting
    return true
  }

  // New growth settings may let finished growth carry on, as the engine allows. True if it was finished.
  resume(): boolean {
    if (!this.done || this.done === 'empty') return false
    this.done = null
    return true
  }

  view() {
    return { x: this.x.subarray(0, this.points), y: this.y.subarray(0, this.points), parent: this.parent.subarray(0, this.points), joins: this.joins.subarray(0, this.joinPairs * 2), points: this.points }
  }

  growth(): Growth {
    return { step: this.step, rng: this.rng, idle: this.idle, done: this.done, x: this.x.slice(0, this.points), y: this.y.slice(0, this.points), parent: this.parent.slice(0, this.points), joins: this.joins.slice(0, this.joinPairs * 2), used: this.used.slice() }
  }
}

function grow<T extends Float64Array | Int32Array>(a: T, n: number): T {
  if (a.length >= n) return a
  const next = new (a.constructor as { new (n: number): T })(Math.max(n, a.length * 2, 256))
  next.set(a)
  return next
}

export type Picture = PictureData | null

const statsOf = (m: Mirror, revision: number, rate = 0): Stats =>
  ({ revision, step: m.step, points: m.points, live: m.live, waiting: m.waiting, done: m.done, rate })

export function useVeins(initial: () => { design: Design; saved: boolean }, setStatus: (status: Status) => void, picture: Picture) {
  const [first] = useState(initial)
  const [design, setDesign] = useState<Design>(first.design)
  const committed = useRef<Design>(first.design)
  // One mirror for the page's lifetime; frames add to it, and each frame's view goes into state for drawing.
  const [mirror] = useState(() => { const m = new Mirror(); m.reset(first.design.growth); return m })
  const [stats, setStats] = useState<Stats>(() => statsOf(mirror, 0))
  const [net, setNet] = useState(() => mirror.view())
  const revision = useRef(0)
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const runningRef = useRef(false)
  const runId = useRef(0)
  const gen = useRef(0)
  const waiters = useRef<(() => void)[]>([])
  const history = useRef<History<Design>>(emptyHistory())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [unsaved, setUnsaved] = useState(!first.saved)
  const client = useRef<GrowthClient | null>(null)
  const statusRef = useRef(setStatus)
  useEffect(() => { statusRef.current = setStatus }, [setStatus])
  const pictureRef = useRef(picture)
  useEffect(() => { pictureRef.current = picture }, [picture])

  // The design as it is now, with the veins from the latest frame.
  const current = useCallback((): Design => ({ ...committed.current, growth: mirror.growth() }), [mirror])
  const show = useCallback((rate = 0) => { setStats(statsOf(mirror, ++revision.current, rate)); setNet(mirror.view()) }, [mirror])
  const commit = useCallback((d: Design) => {
    committed.current = d
    setDesign(d)
    mirror.reset(d.growth)
    show()
  }, [show, mirror])
  const syncHistory = () => { setCanUndo(history.current.past.length > 0); setCanRedo(history.current.future.length > 0) }
  const remember = useCallback((before: Design, key: string | null) => {
    history.current = record(history.current, before, key)
    syncHistory()
  }, [])
  const load = useCallback((d: Design) => {
    client.current?.load({ gen: ++gen.current, rings: shapeRings(d.settings, d.imported), attractors: d.attractors, params: growthParams(d.settings), roots: d.roots, state: engineState(d.growth) })
  }, [])

  useEffect(() => {
    const onMessage = (message: FromRunner) => {
      const c = client.current
      if (message.kind === 'error') {
        runningRef.current = false
        setRunning(false); setStopping(false)
        statusRef.current({ text: `Growth stopped: ${message.message}`, warning: true })
        waiters.current.splice(0).forEach(resolve => resolve())
        return
      }
      const { frame } = message
      if (frame.gen !== gen.current) { c?.ack(); return }
      const fits = mirror.apply(frame)
      if (message.kind === 'frame') {
        show(frame.stepsPerSecond)
        // Ready for the next frame once this one is drawn, or after a moment when the browser draws no frames
        // (a hidden pane or tab), so the counts still update.
        let acked = false
        const ack = () => { if (!acked) { acked = true; c?.ack() } }
        requestAnimationFrame(ack)
        setTimeout(ack, 250)
        if (!runningRef.current && fits) { committed.current = { ...committed.current, growth: mirror.growth() }; setDesign(committed.current) }
        return
      }
      // Stopped: the worker's final veins become the design's.
      const before = committed.current.growth.step
      committed.current = { ...committed.current, growth: mirror.growth() }
      setDesign(committed.current)
      show(0)
      c?.ack()
      if (message.run === runId.current) {
        runningRef.current = false
        setRunning(false); setStopping(false)
      }
      if (frame.step !== before) setUnsaved(true)
      waiters.current.splice(0).forEach(resolve => resolve())
    }
    const c = new GrowthClient(onMessage)
    client.current = c
    const d = committed.current
    c.load({ gen: ++gen.current, rings: shapeRings(d.settings, d.imported), attractors: d.attractors, params: growthParams(d.settings), roots: d.roots, state: engineState(d.growth) })
    return () => { c.dispose(); client.current = null }
  }, [show, mirror])

  // Stops growing and waits for the worker's last veins, so nothing after it works from a stale copy.
  const halt = useCallback((): Promise<void> => {
    if (!runningRef.current) return Promise.resolve()
    setStopping(true)
    client.current?.stop()
    return new Promise(resolve => waiters.current.push(resolve))
  }, [])

  const replace = useCallback(async (next: Design, remembered = true) => {
    await halt()
    if (remembered) remember(current(), null)
    commit(next)
    load(next)
    setUnsaved(true)
  }, [halt, remember, current, commit, load])

  // The design after a settings change: new attractors (and a fresh start) when the shape or their placement
  // changes, otherwise the same veins with the new settings.
  const plan = useCallback((cur: Design, patch: Partial<Settings>, imported: Imported | null, pic: Picture, roots?: Vec[]): { next: Design; restarts: boolean; short?: boolean } => {
    const settings = sanitizeSettings({ ...cur.settings, ...patch })
    const key = placementKey(settings, imported, pic?.name ?? null)
    const reshaped = (['width', 'height', 'margin', 'shape', 'invert'] as const).some(k => settings[k] !== cur.settings[k]) || imported !== cur.imported
    if (key === cur.placedFor && !roots) return { next: { ...cur, settings, imported }, restarts: false }
    const region = regionOf(settings, imported)
    const newShape = settings.shape !== cur.settings.shape || settings.invert !== cur.settings.invert || imported !== cur.imported
    const scaled = cur.roots.map(([x, y]): Vec => [(x * settings.width) / cur.settings.width, (y * settings.height) / cur.settings.height])
    const start = roots ?? (newShape ? startRoots(settings, region) : rootsFor(settings, region, reshaped ? scaled : cur.roots))
    const placed = key === cur.placedFor ? { points: cur.attractors, short: false } : placeFor(settings, region, pic ? fitPicture(pic, settings.width, settings.height) : null)
    return { next: { settings, imported, roots: start, attractors: placed.points, placedFor: key, growth: startGrowth(start, placed.points.length / 2, settings.seed) }, restarts: true, short: placed.short }
  }, [])

  // A settings change. Ones that start the veins again wait for growth to stop; the rest apply live.
  const change = useCallback((patch: Partial<Settings>, key: string | null = null, opts: { imported?: Imported | null; roots?: Vec[]; quiet?: boolean } = {}) => {
    const apply = () => {
      const cur = current()
      const imported = opts.imported === undefined ? cur.imported : opts.imported
      const { next, restarts, short } = plan(cur, patch, imported, pictureRef.current, opts.roots)
      remember(cur, key)
      setUnsaved(true)
      if (restarts) {
        commit(next)
        load(next)
        const placed = next.attractors.length / 2
        if (short) statusRef.current({ text: `Only ${placed.toLocaleString()} of ${next.settings.count.toLocaleString()} attractors fit${next.settings.placement === 'picture' ? ': the picture is too pale for more. Use a darker picture or fewer attractors.' : ' in this shape. Use fewer, or a larger shape.'}`, warning: true })
        else if (hasGrown(cur) && !opts.quiet) statusRef.current({ text: 'The veins started again for the new shape or attractors. Undo brings them back.' })
        return
      }
      committed.current = { ...next, growth: cur.growth }
      setDesign(committed.current)
      if (GROWTH_KEYS.some(k => next.settings[k] !== cur.settings[k])) {
        client.current?.params(growthParams(next.settings))
        // New growth settings may let finished growth carry on, as the engine allows.
        if (mirror.resume()) show()
      }
      if (next.settings.speed !== cur.settings.speed) client.current?.speed(next.settings.speed)
    }
    const cur = current()
    const restarts = plan(cur, patch, opts.imported === undefined ? cur.imported : opts.imported, pictureRef.current, opts.roots).restarts
    if (restarts && runningRef.current) void halt().then(apply)
    else apply()
  }, [current, plan, remember, commit, load, halt, show, mirror])

  // Places attractors again for a new picture, when Placement is Picture.
  const pictureChanged = useCallback((pic: Picture) => {
    pictureRef.current = pic
    const cur = current()
    if (cur.settings.placement !== 'picture') return
    void halt().then(() => {
      const c = current()
      const { next } = plan(c, {}, c.imported, pic)
      remember(c, null)
      commit(next)
      load(next)
      setUnsaved(true)
    })
  }, [current, plan, remember, commit, load, halt])

  const play = useCallback(() => {
    if (runningRef.current) return
    remember(current(), null)
    runningRef.current = true
    setRunning(true)
    runId.current = client.current?.play(null, committed.current.settings.speed) ?? 0
  }, [remember, current])

  const step = useCallback(() => {
    if (runningRef.current) return
    remember(current(), 'step')
    runningRef.current = true
    setRunning(true)
    runId.current = client.current?.play(1, 1) ?? 0
  }, [remember, current])

  const pause = useCallback(() => { if (runningRef.current) { setStopping(true); client.current?.stop() } }, [])

  const reset = useCallback(async () => {
    await halt()
    const cur = current()
    remember(cur, null)
    const next = { ...cur, growth: startGrowth(cur.roots, cur.attractors.length / 2, cur.settings.seed) }
    commit(next)
    load(next)
    setUnsaved(true)
  }, [halt, current, remember, commit, load])

  const undo = useCallback(async () => {
    await halt()
    const result = undoStep(history.current, current())
    if (!result) return
    history.current = result.history
    syncHistory()
    commit(result.state)
    load(result.state)
    setUnsaved(true)
  }, [halt, current, commit, load])

  const redo = useCallback(async () => {
    await halt()
    const result = redoStep(history.current, current())
    if (!result) return
    history.current = result.history
    syncHistory()
    commit(result.state)
    load(result.state)
    setUnsaved(true)
  }, [halt, current, commit, load])

  // Roots. Before any growth, an edit just moves the start. After growth has begun, a new root joins in as a
  // vein of its own; moving or removing one starts the veins again (Undo brings them back).
  const addRoot = useCallback((x: number, y: number) => {
    const cur = current()
    remember(cur, null)
    setUnsaved(true)
    if (hasGrown(cur) || runningRef.current) {
      committed.current = { ...cur, roots: [...cur.roots, [x, y]] }
      setDesign(committed.current)
      client.current?.root(x, y)
      return
    }
    const roots: Vec[] = [...cur.roots, [x, y]]
    const next = { ...cur, roots, growth: startGrowth(roots, cur.attractors.length / 2, cur.settings.seed) }
    commit(next)
    load(next)
  }, [current, remember, commit, load])

  const setRoots = useCallback(async (roots: Vec[], key: string | null = null) => {
    await halt()
    const cur = current()
    remember(cur, key)
    const next = { ...cur, roots, growth: startGrowth(roots, cur.attractors.length / 2, cur.settings.seed) }
    commit(next)
    load(next)
    setUnsaved(true)
    if (hasGrown(cur)) statusRef.current({ text: 'The veins started again from the new roots. Undo brings them back.' })
  }, [halt, current, remember, commit, load])

  const markSaved = useCallback(() => setUnsaved(false), [])

  return {
    design, stats, net, mirror, running, stopping, unsaved, canUndo, canRedo,
    current, change, pictureChanged, play, step, pause, reset, undo, redo, addRoot, setRoots, replace, markSaved,
  }
}

export type VeinsModel = ReturnType<typeof useVeins>
