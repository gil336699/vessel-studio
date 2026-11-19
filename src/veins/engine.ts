// The growth engine: space colonization (Runions et al. 2005, 2007), one step at a time, deterministic, with
// its whole state saveable so a reopened design carries on exactly where it stopped.
//
// Each step, in this order:
// 1. Pair. Every live attractor pulls on its nearest vein point, if that is nearer than the attraction distance
//    (no limit by default, as for leaves) and it can see the attractor past the shape's edges. An attractor
//    within the kill distance of any vein point is used up first, as in Gil's older pages; the papers remove it
//    just after the step that reached it, which is the same except at the very start.
//    With loops (closed venation), an attractor pulls every vein point in its relative neighbourhood instead,
//    and stays until all of them have arrived; then they join there.
// 2. Grow. Every vein point that was pulled adds one point, a segment length away, toward the average of its
//    pulls, optionally blended with its last heading (Keep heading), a seeded wobble (Wiggle) and a steady Pull.
//    A new point that would leave the shape, or land on another vein, is refused.
// 3. The step's new points go in together, so the result never depends on the order points are visited.
//    A refused step still counts for the attractors it would have reached: another vein already fills that
//    space. Without that, an attractor caught between two veins pulls one of them forever. The older pages
//    had no guard, and their points piled up there without end.
//
// The nearest vein point of every attractor is cached and updated with each step's new points only: vein
// points never move or vanish, so that is exact, and ties go to the older point, as a full search would.
import type { Vec } from './geometry'
import { Rng } from './random'
import type { Region } from './region'

export type Topology = 'open' | 'closed'
export type PullMode = 'up' | 'down' | 'left' | 'right' | 'out'

export type GrowthParams = {
  segment: number // mm between a vein point and the next
  kill: number // mm: an attractor this close to a vein is used up
  attraction: number // mm: how far a vein point senses attractors; 0 means no limit
  topology: Topology
  inertia: number // 0–0.95: how much of its last heading a vein keeps
  // Keep heading for vein ends only, so a side branch starts toward its own attractors. False is BioVessel's rule,
  // which bent side branches along the vein they leave too.
  headingEndsOnly?: boolean
  wiggle: number // 0–1.5: seeded wobble added to each step's heading
  pull: number // 0–1: steady pull added to each step's heading
  pullMode: PullMode
  crowd: number // 0–0.9 of a segment: a new point this close to another vein point is refused; 0 turns it off
  leafSteps: number // leaf growth: steps for the outline to grow to full size from the first root; 0 is off
  minLoop: number // loops: veins this many segments apart along the tree don't join, so no tiny bulbs
  maxPoints: number // a cap on vein points, to keep the browser responsive
  seed: number // for Wiggle
}

export type StopReason = 'reached' | 'stalled' | 'out-of-reach' | 'cap' | 'empty'

// Everything a step depends on, as plain arrays, for project files and the worker.
export type EngineState = {
  step: number
  rng: number
  x: ArrayLike<number>
  y: ArrayLike<number>
  parent: ArrayLike<number>
  joins: ArrayLike<number> // pairs of vein points joined by a loop, [a0, b0, a1, b1, …]
  used: ArrayLike<number> // 1 for each attractor that is used up
  done: StopReason | null
  idle?: number // steps since an attractor was last used
}

// What changed in a step, for the page's mirror.
export type StepChange = { grew: number; joined: number; used: number[] }

const LIVE = 0, USED = 1
// The leaf starts at this fraction of its full size.
const LEAF_START = 0.06
// Loops: at most this many nearest vein points are tested for the relative neighbourhood of a source, and a
// source farther than RN_FAR segments from every vein pulls only its nearest point.
const RN_CANDIDATES = 48
const RN_FAR = 10
// Growth that uses no attractor for longer than it takes to cross the whole shape, plus this many steps, is stuck:
// for example points piling up where attractors pull both ways, with Keep veins apart off.
const IDLE_SPARE = 50

class Grow {
  data: Float64Array | Int32Array
  length = 0
  constructor(private kind: 'f' | 'i', capacity = 1024) { this.data = kind === 'f' ? new Float64Array(capacity) : new Int32Array(capacity) }
  push(v: number) {
    if (this.length === this.data.length) {
      const next = this.kind === 'f' ? new Float64Array(this.data.length * 2) : new Int32Array(this.data.length * 2)
      next.set(this.data); this.data = next
    }
    this.data[this.length++] = v
  }
  view() { return this.data.subarray(0, this.length) }
}

// Vein points in a uniform grid, for the crowding test and loop neighbourhoods.
class PointGrid {
  private map = new Map<number, number[]>()
  constructor(private cell: number) {}
  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768) }
  add(id: number, x: number, y: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell))
    const list = this.map.get(k)
    if (list) list.push(id); else this.map.set(k, [id])
  }
  // Every point within r of (x, y), unordered.
  near(x: number, y: number, r: number, xs: ArrayLike<number>, ys: ArrayLike<number>, visit: (id: number, d2: number) => boolean | void) {
    const r2 = r * r, c = this.cell
    for (let j = Math.floor((y - r) / c); j <= Math.floor((y + r) / c); j++) for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      const list = this.map.get(this.key(i, j))
      if (!list) continue
      for (const id of list) {
        const dx = xs[id] - x, dy = ys[id] - y, d2 = dx * dx + dy * dy
        if (d2 < r2 && visit(id, d2) === true) return
      }
    }
  }
}

export class Engine {
  params: GrowthParams
  readonly region: Region | null
  readonly ax: Float64Array
  readonly ay: Float64Array
  // 0 live, 1 used up.
  readonly used: Uint8Array
  // The step from which each attractor counts (leaf growth); 0 for all of them when leaf growth is off.
  appear: Int32Array
  // Nearest vein point and its squared distance, for every attractor.
  private best: Float64Array
  private owner: Int32Array
  private xs = new Grow('f')
  private ys = new Grow('f')
  private parents = new Grow('i')
  private depths = new Grow('i')
  private roots = new Grow('i') // the root each vein point grew from
  private kids = new Grow('i') // children of each vein point
  private joinList = new Grow('i')
  private grid: PointGrid
  private rng: Rng
  step = 0
  done: StopReason | null = null
  idle = 0
  live: number
  // Leaf growth centre: the first root.
  private centre: Vec | null = null
  // Scratch, reused every step.
  private pullX = new Float64Array(0)
  private pullY = new Float64Array(0)
  private pullN = new Int32Array(0)
  private head = new Int32Array(0)

  constructor(region: Region | null, attractors: Float64Array, params: GrowthParams, from: { roots: Vec[] } | { state: EngineState }) {
    this.region = region
    this.params = { ...params }
    const k = attractors.length / 2
    this.ax = new Float64Array(k); this.ay = new Float64Array(k)
    for (let i = 0; i < k; i++) { this.ax[i] = attractors[i * 2]; this.ay[i] = attractors[i * 2 + 1] }
    this.used = new Uint8Array(k)
    this.best = new Float64Array(k).fill(Infinity)
    this.owner = new Int32Array(k).fill(-1)
    this.appear = new Int32Array(k)
    this.grid = new PointGrid(Math.max(1e-6, 2.5 * params.segment))
    if ('roots' in from) {
      this.rng = new Rng(params.seed)
      for (const [x, y] of from.roots) this.addPoint(x, y, -1)
    } else {
      const s = from.state
      this.rng = new Rng(params.seed, s.rng)
      this.step = s.step
      this.done = s.done
      this.idle = s.idle ?? 0
      for (let i = 0; i < s.x.length; i++) this.addPoint(s.x[i], s.y[i], s.parent[i])
      for (let i = 0; i < s.joins.length; i++) this.joinList.push(s.joins[i])
      for (let i = 0; i < k && i < s.used.length; i++) this.used[i] = s.used[i] ? USED : LIVE
    }
    this.live = this.used.reduce((n, u) => n + (u === LIVE ? 1 : 0), 0)
    // The longest way across: the shape's, or the attractors' and roots' when there is no shape.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const take = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    if (region && !region.empty) { take(region.box[0], region.box[1]); take(region.box[2], region.box[3]) }
    else {
      for (let i = 0; i < k; i++) take(this.ax[i], this.ay[i])
      for (let i = 0; i < this.xs.length; i++) take(this.xs.data[i], this.ys.data[i])
    }
    this.span = Number.isFinite(x0) ? Math.hypot(x1 - x0, y1 - y0) : 0
    this.refreshNearest(0)
    this.setLeafGrowth()
  }

  private span = 0
  private get idleLimit() { return Math.ceil(this.span / Math.max(1e-9, this.params.segment)) + IDLE_SPARE }

  get points(): number { return this.xs.length }
  get x(): Float64Array { return this.xs.view() as Float64Array }
  get y(): Float64Array { return this.ys.view() as Float64Array }
  get parent(): Int32Array { return this.parents.view() as Int32Array }
  get joins(): Int32Array { return this.joinList.view() as Int32Array }
  get rngState(): number { return this.rng.state }
  // Attractors still to appear as the leaf grows.
  get waiting(): number { let n = 0; for (let i = 0; i < this.used.length; i++) if (this.used[i] === LIVE && this.appear[i] > this.step) n++; return n }

  setParams(params: GrowthParams) {
    const leafChanged = params.leafSteps !== this.params.leafSteps
    if (params.segment !== this.params.segment) {
      // The grid's cells follow the segment length; rebuild it for the new one.
      this.grid = new PointGrid(Math.max(1e-6, 2.5 * params.segment))
      for (let i = 0; i < this.xs.length; i++) this.grid.add(i, this.xs.data[i], this.ys.data[i])
    }
    this.params = { ...params }
    if (leafChanged) this.setLeafGrowth()
    // New settings may let growth carry on.
    if (this.done && this.done !== 'empty') this.done = null
  }

  // A root added while growing starts a new vein of its own.
  addRoot(x: number, y: number) {
    const from = this.xs.length
    this.addPoint(x, y, -1)
    this.refreshNearest(from)
    if (this.done) this.done = null
    if (!this.centre) this.setLeafGrowth()
  }

  snapshot(): EngineState {
    return { step: this.step, rng: this.rng.state, x: this.x.slice(), y: this.y.slice(), parent: this.parent.slice(), joins: this.joins.slice(), used: this.used.slice(), done: this.done, idle: this.idle }
  }

  private addPoint(x: number, y: number, parent: number) {
    const id = this.xs.length
    this.xs.push(x); this.ys.push(y); this.parents.push(parent)
    this.depths.push(parent >= 0 ? this.depths.data[parent] + 1 : 0)
    this.roots.push(parent >= 0 ? this.roots.data[parent] : id)
    this.kids.push(0)
    if (parent >= 0) this.kids.data[parent]++
    this.grid.add(id, x, y)
    return id
  }

  // Leaf growth (Runions 2005, marginal growth): the outline grows from LEAF_START of its size to full size about
  // the first root, and each attractor counts from the step the growing outline first holds it.
  private setLeafGrowth() {
    const T = this.params.leafSteps
    this.appear.fill(0)
    if (!(T > 0) || !this.region || this.xs.length === 0) { this.centre = null; return }
    const c: Vec = [this.xs.data[0], this.ys.data[0]]
    this.centre = c
    const inside = (i: number, s: number) => this.region!.contains(c[0] + (this.ax[i] - c[0]) / s, c[1] + (this.ay[i] - c[1]) / s)
    for (let i = 0; i < this.ax.length; i++) {
      let lo = LEAF_START, hi = 1
      if (inside(i, lo)) { this.appear[i] = 0; continue }
      for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (inside(i, mid)) hi = mid; else lo = mid }
      this.appear[i] = Math.ceil(((hi - LEAF_START) / (1 - LEAF_START)) * T)
    }
  }

  // Bring each attractor's nearest vein point up to date with the points from index `from` on.
  private refreshNearest(from: number) {
    const m = this.xs.length - from
    if (m <= 0) return
    const xs = this.xs.data, ys = this.ys.data
    const order = Array.from({ length: m }, (_, i) => from + i).sort((a, b) => xs[a] - xs[b] || a - b)
    const sx = new Float64Array(m), sy = new Float64Array(m), id = new Int32Array(m)
    order.forEach((p, i) => { sx[i] = xs[p]; sy[i] = ys[p]; id[i] = p })
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE) continue
      const qx = this.ax[s], qy = this.ay[s]
      let b = this.best[s], o = this.owner[s]
      let lo = 0, hi = m
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sx[mid] < qx) lo = mid + 1; else hi = mid }
      for (let i = lo; i < m; i++) {
        const dx = qx - sx[i]
        if (dx * dx > b) break
        const dy = qy - sy[i], d2 = dx * dx + dy * dy
        if (d2 < b || (d2 === b && id[i] < o)) { b = d2; o = id[i] }
      }
      for (let i = lo - 1; i >= 0; i--) {
        const dx = qx - sx[i]
        if (dx * dx > b) break
        const dy = qy - sy[i], d2 = dx * dx + dy * dy
        if (d2 < b || (d2 === b && id[i] < o)) { b = d2; o = id[i] }
      }
      this.best[s] = b; this.owner[s] = o
    }
  }

  private sees(v: number, s: number): boolean {
    return !this.region || this.region.sees(this.xs.data[v], this.ys.data[v], this.ax[s], this.ay[s])
  }

  // The pull direction for a vein point, as a unit vector, or zeros.
  private pullOf(v: number): Vec {
    const { pullMode } = this.params
    switch (pullMode) {
      case 'up': return [0, -1]
      case 'down': return [0, 1]
      case 'left': return [-1, 0]
      case 'right': return [1, 0]
      case 'out': {
        const r = this.roots.data[v], dx = this.xs.data[v] - this.xs.data[r], dy = this.ys.data[v] - this.ys.data[r], L = Math.hypot(dx, dy)
        return L > 0 ? [dx / L, dy / L] : [0, 0]
      }
    }
  }

  // Segments between two vein points along the tree, or Infinity when that's more than `limit` or they grew
  // from different roots.
  private treeGap(a: number, b: number, limit: number): number {
    const parent = this.parents.data, depth = this.depths.data
    let steps = 0
    while (depth[a] > depth[b]) { a = parent[a]; if (++steps > limit) return Infinity }
    while (depth[b] > depth[a]) { b = parent[b]; if (++steps > limit) return Infinity }
    while (a !== b) {
      a = parent[a]; b = parent[b]; steps += 2
      if (a < 0 || b < 0 || steps > limit) return Infinity
    }
    return steps
  }

  // Grow one step. Returns what changed, or null once growth has stopped.
  stepOnce(): StepChange | null {
    if (this.done) return null
    const P = this.params
    const n = this.xs.length
    if (n === 0) { this.done = 'empty'; return null }
    if (this.pullN.length < n) {
      const size = Math.max(n, this.pullN.length * 2)
      this.pullX = new Float64Array(size); this.pullY = new Float64Array(size); this.pullN = new Int32Array(size)
      this.head = new Int32Array(size).fill(-1)
    }
    const xs = this.xs.data, ys = this.ys.data
    const pullX = this.pullX, pullY = this.pullY, pullN = this.pullN, head = this.head
    const touched: number[] = []
    const usedNow: number[] = []
    const resolved: { s: number; arrived: number[] }[] = []
    const limit = P.attraction > 0 ? P.attraction : Infinity
    const step = this.step
    let waiting = 0, inReach = 0
    // Which attractors pull each point this step, as linked lists.
    const pairS: number[] = [], pairNext: number[] = []
    const pulls = (v: number, s: number, d: number) => {
      if (pullN[v] === 0) touched.push(v)
      pullX[v] += (this.ax[s] - xs[v]) / d
      pullY[v] += (this.ay[s] - ys[v]) / d
      pullN[v]++
      pairS.push(s); pairNext.push(head[v]); head[v] = pairS.length - 1
    }
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE) continue
      if (this.appear[s] > step) { waiting++; continue }
      const d = Math.sqrt(this.best[s])
      if (P.topology === 'open') {
        if (d < P.kill) { this.used[s] = USED; usedNow.push(s); continue }
        if (!(d < limit)) continue
        inReach++
        const v = this.owner[s]
        if (!this.sees(v, s)) continue
        pulls(v, s, d)
      } else {
        if (!(d < limit)) continue
        inReach++
        // Far from every vein, the nearest point is the one that matters, and finding the whole neighbourhood
        // would search a wide empty area; loops only form once veins come near.
        if (d > Math.max(RN_FAR * P.segment, 2 * P.kill)) {
          const v = this.owner[s]
          if (this.sees(v, s)) pulls(v, s, d)
          continue
        }
        const rn = this.neighbourhood(s, d)
        if (!rn.length) continue
        const away = rn.filter(([, dv]) => !(dv < P.kill))
        if (!away.length) { resolved.push({ s, arrived: rn.map(([v]) => v) }); continue }
        for (const [v, dv] of away) pulls(v, s, dv)
      }
    }
    touched.sort((a, b) => a - b)

    // Grow the pulled points, all from the positions before this step.
    const D = P.segment, crowd2 = (P.crowd * D) ** 2
    const newX: number[] = [], newY: number[] = [], newParent: number[] = []
    // A refused step uses up the attractors it would have come close to: a vein already fills that space.
    const covered = (P.kill + P.crowd * D) ** 2
    const refuse = (list: number, px: number, py: number) => {
      if (P.topology !== 'open') return
      for (let k = list; k >= 0; k = pairNext[k]) {
        const s = pairS[k]
        if (this.used[s] !== LIVE) continue
        const dx = this.ax[s] - px, dy = this.ay[s] - py
        if (dx * dx + dy * dy < covered) { this.used[s] = USED; usedNow.push(s) }
      }
    }
    for (const v of touched) {
      const count = pullN[v], list = head[v]
      const tx = pullX[v] / count, ty = pullY[v] / count
      pullX[v] = 0; pullY[v] = 0; pullN[v] = 0; head[v] = -1
      let vx = tx, vy = ty
      if (P.inertia > 0 && (P.headingEndsOnly === false || this.kids.data[v] === 0)) {
        const p = this.parents.data[v]
        let hx = 0, hy = 0
        if (p >= 0) { const dx = xs[v] - xs[p], dy = ys[v] - ys[p], mag = Math.hypot(dx, dy); hx = dx / (mag || 1); hy = dy / (mag || 1) }
        vx = tx * (1 - P.inertia) + hx * P.inertia
        vy = ty * (1 - P.inertia) + hy * P.inertia
      }
      if (P.wiggle > 0) {
        vx += (this.rng.next() - 0.5) * P.wiggle
        vy += (this.rng.next() - 0.5) * P.wiggle
      }
      if (P.pull > 0) { const [gx, gy] = this.pullOf(v); vx += gx * P.pull; vy += gy * P.pull }
      const mag = Math.hypot(vx, vy)
      if (!(mag > 1e-12)) continue
      const px = xs[v] + (vx / mag) * D, py = ys[v] + (vy / mag) * D
      if (this.region && (!this.region.contains(px, py) || this.region.crosses(xs[v], ys[v], px, py))) { refuse(list, px, py); continue }
      if (crowd2 > 0) {
        let crowded = false
        this.grid.near(px, py, P.crowd * D, xs, ys, id => { if (id !== v) { crowded = true; return true } })
        if (!crowded) for (let i = 0; i < newX.length; i++) { const dx = newX[i] - px, dy = newY[i] - py; if (dx * dx + dy * dy < crowd2) { crowded = true; break } }
        if (crowded) { refuse(list, px, py); continue }
      }
      newX.push(px); newY.push(py); newParent.push(v)
    }
    const from = this.xs.length
    for (let i = 0; i < newX.length; i++) this.addPoint(newX[i], newY[i], newParent[i])

    // Loops: each resolved source becomes a junction joined to every vein that arrived, unless two arrivals are
    // close along the tree, which would close a tiny bulb.
    let joined = 0
    for (const { s, arrived } of resolved) {
      this.used[s] = USED; usedNow.push(s)
      if (arrived.length < 2) continue
      const first = arrived[0]
      const others = arrived.slice(1).filter(v => this.treeGap(v, first, P.minLoop) > P.minLoop)
      if (!others.length) continue
      const j = this.addPoint(this.ax[s], this.ay[s], first)
      for (const v of others) { this.joinList.push(v); this.joinList.push(j); joined++ }
    }
    this.live -= usedNow.length
    this.refreshNearest(from)
    const grew = this.xs.length - from
    this.step++
    this.idle = usedNow.length > 0 ? 0 : this.idle + 1

    if (this.live === 0) this.done = 'reached'
    else if (this.xs.length >= P.maxPoints) this.done = 'cap'
    else if (waiting === 0 && ((grew === 0 && usedNow.length === 0) || this.idle >= this.idleLimit)) {
      if (P.topology === 'closed') this.settleLoops()
      this.done = inReach === 0 ? 'out-of-reach' : 'stalled'
    }
    return { grew, joined, used: usedNow }
  }

  // Stuck with loops: each source joins the veins that did arrive, and the rest are dropped.
  private settleLoops() {
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE) continue
      const d = Math.sqrt(this.best[s])
      const arrived = this.neighbourhood(s, d).filter(([, dv]) => dv < this.params.kill).map(([v]) => v)
      this.used[s] = USED; this.live--
      if (arrived.length < 2) continue
      const others = arrived.slice(1).filter(v => this.treeGap(v, arrived[0], this.params.minLoop) > this.params.minLoop)
      if (!others.length) continue
      const j = this.addPoint(this.ax[s], this.ay[s], arrived[0])
      for (const v of others) { this.joinList.push(v); this.joinList.push(j) }
    }
  }

  // The relative neighbourhood of source s among the vein points it can see: v counts unless some u is nearer
  // the source than v and nearer v than the source is (Runions 2005, Eq. 2). Nearest first.
  private neighbourhood(s: number, nearest: number): [number, number][] {
    const P = this.params, qx = this.ax[s], qy = this.ay[s]
    const reach = Math.min(P.attraction > 0 ? P.attraction : Infinity, 2.5 * nearest + 2 * P.segment)
    const found: [number, number][] = []
    this.grid.near(qx, qy, Math.max(reach, nearest * 1.000001 + 1e-9), this.xs.data, this.ys.data, (id, d2) => { found.push([id, Math.sqrt(d2)]) })
    found.sort((a, b) => a[1] - b[1] || a[0] - b[0])
    const xs = this.xs.data, ys = this.ys.data
    const out: [number, number][] = []
    for (let i = 0; i < found.length && i < RN_CANDIDATES; i++) {
      const [v, dv] = found[i]
      let open = true
      for (let k = 0; k < i && open; k++) {
        const u = found[k][0]
        if (Math.hypot(xs[u] - xs[v], ys[u] - ys[v]) <= dv) open = false
      }
      if (open && this.sees(v, s)) out.push([v, dv])
    }
    return out
  }
}
