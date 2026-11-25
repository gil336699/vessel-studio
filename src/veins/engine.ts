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
//    A new point that would leave the shape, come nearer its edges than the edge clearance, or land on another
//    vein, is refused. With loops, only veins clear of the edges join at an attractor.
// 3. The step's new points go in together, so the result never depends on the order points are visited.
//    A refused step still counts for the attractors it would have reached: another vein already fills that
//    space. Without that, an attractor caught between two veins pulls one of them forever. The older pages
//    had no guard, and their points piled up there without end.
//
// Two or three systems can grow together, each from its own roots, as in Vessel Studio 3D:
// - Interweave: each system has its own attractors spread through the whole shape, so every system fills it, and a
//   step that would bring one system's vein nearer another system's than the gap, edge to edge, is refused; it turns
//   away and tries again, so veins pass round each other. Repel also steers veins away from other systems. On a flat
//   sheet two veins that cross touch, so the gap is kept along each whole segment, not only at its points.
// - Join: two systems, an inlet tree and an outlet tree, share the attractors, and each tree's free tips pull the
//   other tree too (never its own), so the tips meet and join into one network that flow can pass through: the
//   mutual tree attraction of Kinstlinger et al. 2020 (Nature Biomedical Engineering 4, 916–932). On a sheet, veins
//   that overlap read as joined, so the two trees' veins may come edge to edge but never overlap, except where they
//   join.
//
// The nearest vein point of every attractor, in each tree it feeds, is cached and updated with each step's new
// points only: vein points never move or vanish, so that is exact, and ties go to the older point, as a full
// search would.
import type { Vec } from './geometry'
import type { WidthSettings } from './network'
import { Rng } from './random'
import { partAt, partTest, segmentDistance, type Region } from './region'

export type Topology = 'open' | 'closed'
export type PullMode = 'up' | 'down' | 'left' | 'right' | 'out'
export type Coupling = 'interweave' | 'join'

// Where a vein starts, and the system it starts: 0 (A) when missing.
export type Root = [x: number, y: number, system?: number]

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
  clearance?: number // mm: veins stay at least this far from the shape's edges and holes; 0 or missing is off
  leafSteps: number // leaf growth: steps for the outline to grow to full size from the first root; 0 is off
  minLoop: number // loops: veins this many segments apart along the tree don't join, so no tiny bulbs
  maxPoints: number // a cap on vein points, to keep the browser responsive
  seed: number // for Wiggle
  // Systems growing together; 1 when missing. How two couple; three always interweave.
  systems?: number
  coupling?: Coupling
  gap?: number // interweave: mm kept between the veins of different systems, edge to edge
  repel?: number // interweave: 0–1, how strongly veins steer away from other systems
  tipPull?: number // join: 0–1, how strongly a tree's free tips pull the other tree
  // Vein widths, for the gap between systems.
  widths?: WidthSettings
}

export type StopReason = 'reached' | 'stalled' | 'out-of-reach' | 'cap' | 'empty'

// Everything a step depends on, as plain arrays, for project files and the worker.
export type EngineState = {
  step: number
  rng: number
  x: ArrayLike<number>
  y: ArrayLike<number>
  parent: ArrayLike<number>
  sys?: ArrayLike<number> // the system each point belongs to; all 0 when missing
  joins: ArrayLike<number> // pairs of vein points joined by a loop, [a0, b0, a1, b1, …]
  links?: ArrayLike<number> // join: pairs of vein points where the two trees met, [a0, b0, …]
  used: ArrayLike<number> // 1 for each attractor that is used up
  done: StopReason | null
  idle?: number // steps since an attractor was last used
}

// What changed in a step, for the page's mirror.
export type StepChange = { grew: number; joined: number; linked: number; used: number[] }

// An attractor that every tree grows toward (Join).
export const SHARED = 255
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
// Join: a tip pulls the other tree from this many kill distances away, and the trees join within one kill distance.
const TIP_REACH = 6
// Two or three systems: a step that another system's vein blocks turns away and tries again, this many tries in all.
const TRIES = 4

// The systems a design grows: 1 to 3.
export const systemCount = (p: Pick<GrowthParams, 'systems'>) => Math.max(1, Math.min(3, Math.floor(p.systems ?? 1) || 1))
// Join: two trees that share the attractors and join where they meet. Three systems always interweave.
export const joins = (p: Pick<GrowthParams, 'systems' | 'coupling'>) => systemCount(p) === 2 && p.coupling === 'join'
// The system attractor i feeds: each its own when interwoven, in turn, as they were placed from one even spread.
export const attractorSystem = (p: Pick<GrowthParams, 'systems' | 'coupling'>, i: number) => {
  const T = systemCount(p)
  return T === 1 ? 0 : joins(p) ? SHARED : i % T
}

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
  // Every point within r of (x, y), unordered. When the search covers more cells than hold points, as for a wide
  // loop search with a long kill distance and short segments, the cells that hold points are looked at instead.
  near(x: number, y: number, r: number, xs: ArrayLike<number>, ys: ArrayLike<number>, visit: (id: number, d2: number) => boolean | void) {
    const r2 = r * r, c = this.cell
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((y - r) / c), j1 = Math.floor((y + r) / c)
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.map.size) {
      for (const [key, list] of this.map) {
        const i = Math.floor(key / 65536) - 32768, j = (key % 65536) - 32768
        if (i < i0 || i > i1 || j < j0 || j > j1) continue
        for (const id of list) {
          const dx = xs[id] - x, dy = ys[id] - y, d2 = dx * dx + dy * dy
          if (d2 < r2 && visit(id, d2) === true) return
        }
      }
      return
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
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
  // The system each attractor feeds, or SHARED.
  readonly asys: Uint8Array
  // 0 live, 1 used up.
  readonly used: Uint8Array
  // The step from which each attractor counts (leaf growth); 0 for all of them when leaf growth is off.
  appear: Int32Array
  // How many trees there are, and for every attractor and tree (entry s * T + t) the nearest vein point and its
  // squared distance.
  private readonly T: number
  private best: Float64Array
  private owner: Int32Array
  private xs = new Grow('f')
  private ys = new Grow('f')
  private parents = new Grow('i')
  private depths = new Grow('i')
  private roots = new Grow('i') // the root each vein point grew from
  private kids = new Grow('i') // children of each vein point
  private sysOf = new Grow('i') // the system each point belongs to
  private ends = new Grow('i') // two or three systems: vein ends each point feeds, for widths
  private linked = new Grow('i') // 1 for points where the two trees met (Join)
  // Interweave with loops: the points each loop joins a point to, so the gap is kept from those veins too.
  private joinsAt = new Map<number, number[]>()
  private joinList = new Grow('i')
  private linkList = new Grow('i')
  private grid: PointGrid
  private rng: Rng
  step = 0
  done: StopReason | null = null
  idle = 0
  live: number
  // Leaf growth centre: the first root. With a shape in separate parts, each part grows about its own first root.
  private centre: Vec | null = null
  private byPart = false
  // Scratch, reused every step.
  private pullX = new Float64Array(0)
  private pullY = new Float64Array(0)
  private pullN = new Float64Array(0)
  private head = new Int32Array(0)

  constructor(region: Region | null, attractors: Float64Array, params: GrowthParams, from: { roots: Root[] } | { state: EngineState }) {
    this.region = region
    this.params = { ...params }
    this.T = systemCount(params)
    const k = attractors.length / 2
    this.ax = new Float64Array(k); this.ay = new Float64Array(k)
    this.asys = new Uint8Array(k)
    for (let i = 0; i < k; i++) { this.ax[i] = attractors[i * 2]; this.ay[i] = attractors[i * 2 + 1]; this.asys[i] = attractorSystem(params, i) }
    this.used = new Uint8Array(k)
    this.best = new Float64Array(k * this.T).fill(Infinity)
    this.owner = new Int32Array(k * this.T).fill(-1)
    this.appear = new Int32Array(k)
    this.grid = new PointGrid(Math.max(1e-6, 2.5 * params.segment))
    if ('roots' in from) {
      this.rng = new Rng(params.seed)
      for (const [x, y, system] of from.roots) this.addPoint(x, y, -1, this.systemOf(system))
    } else {
      const s = from.state
      this.rng = new Rng(params.seed, s.rng)
      this.step = s.step
      this.done = s.done
      this.idle = s.idle ?? 0
      for (let i = 0; i < s.x.length; i++) this.addPoint(s.x[i], s.y[i], s.parent[i], s.sys ? this.systemOf(s.sys[i]) : 0)
      for (let i = 0; i + 1 < s.joins.length; i += 2) this.join(s.joins[i], s.joins[i + 1])
      const links = s.links ?? []
      for (let i = 0; i + 1 < links.length; i += 2) this.link(links[i], links[i + 1])
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
  private get joining() { return joins(this.params) }
  private get weaving() { return this.T > 1 && !this.joining }
  // A system number, as one of this engine's systems.
  private systemOf(t: number | undefined) { return Math.max(0, Math.min(this.T - 1, Math.floor(t ?? 0) || 0)) }

  get systems(): number { return this.T }
  get points(): number { return this.xs.length }
  get x(): Float64Array { return this.xs.view() as Float64Array }
  get y(): Float64Array { return this.ys.view() as Float64Array }
  get parent(): Int32Array { return this.parents.view() as Int32Array }
  get sys(): Int32Array { return this.sysOf.view() as Int32Array }
  get joins(): Int32Array { return this.joinList.view() as Int32Array }
  get links(): Int32Array { return this.linkList.view() as Int32Array }
  get rngState(): number { return this.rng.state }
  // Attractors still to appear as the leaf grows.
  get waiting(): number { let n = 0; for (let i = 0; i < this.used.length; i++) if (this.used[i] === LIVE && this.appear[i] > this.step) n++; return n }
  // Join: vein ends that haven't met the other tree, the network's dead ends.
  freeTips(): number { let n = 0; for (let v = 0; v < this.xs.length; v++) if (this.isTip(v)) n++; return n }

  setParams(params: GrowthParams) {
    const leafChanged = params.leafSteps !== this.params.leafSteps
    if (params.segment !== this.params.segment) {
      // The grid's cells follow the segment length; rebuild it for the new one.
      this.grid = new PointGrid(Math.max(1e-6, 2.5 * params.segment))
      for (let i = 0; i < this.xs.length; i++) this.grid.add(i, this.xs.data[i], this.ys.data[i])
    }
    // The number of systems and how they couple are fixed for an engine; they change by starting again.
    this.params = { ...params, systems: this.params.systems, coupling: this.params.coupling }
    if (leafChanged) this.setLeafGrowth()
    // New settings may let growth carry on, unless every attractor is already reached.
    if (this.done && this.done !== 'empty' && this.done !== 'reached') this.done = null
  }

  // A root added while growing starts a new vein of its own.
  addRoot(x: number, y: number, system = 0) {
    const from = this.xs.length
    this.addPoint(x, y, -1, this.systemOf(system))
    this.refreshNearest(from)
    if (this.done) this.done = null
    // A new root can be the first in its part, which then grows about it.
    if (!this.centre || this.byPart) this.setLeafGrowth()
  }

  snapshot(): EngineState {
    return {
      step: this.step, rng: this.rng.state, x: this.x.slice(), y: this.y.slice(), parent: this.parent.slice(), sys: this.sys.slice(),
      joins: this.joins.slice(), links: this.links.slice(), used: this.used.slice(), done: this.done, idle: this.idle,
    }
  }

  private addPoint(x: number, y: number, parent: number, system: number) {
    const id = this.xs.length
    this.xs.push(x); this.ys.push(y); this.parents.push(parent)
    this.depths.push(parent >= 0 ? this.depths.data[parent] + 1 : 0)
    this.roots.push(parent >= 0 ? this.roots.data[parent] : id)
    this.kids.push(0)
    this.sysOf.push(system)
    this.linked.push(0)
    if (this.T > 1) {
      // A first child takes over its parent's end; any other adds one for every point back to the root.
      this.ends.push(1)
      if (parent >= 0 && this.kids.data[parent] > 0) for (let a = parent; a >= 0; a = this.parents.data[a]) this.ends.data[a]++
    }
    if (parent >= 0) this.kids.data[parent]++
    this.grid.add(id, x, y)
    return id
  }

  private join(a: number, b: number) {
    this.joinList.push(a); this.joinList.push(b)
    if (!this.weaving) return
    for (const [p, q] of [[a, b], [b, a]]) { const list = this.joinsAt.get(p); if (list) list.push(q); else this.joinsAt.set(p, [q]) }
  }

  private link(a: number, b: number) {
    this.linkList.push(a); this.linkList.push(b)
    this.linked.data[a] = 1; this.linked.data[b] = 1
  }

  // A vein end that hasn't met the other tree: a free tip, in Join.
  private isTip(v: number) { return this.kids.data[v] === 0 && !this.linked.data[v] && this.parents.data[v] >= 0 }

  // The width a vein has at a point, halved, as Murray's law makes it from the ends the point feeds now.
  private radius(v: number): number {
    const w = this.params.widths
    if (!w) return 0
    if (w.rule === 'even') return w.tip / 2
    return Math.min(Math.max(w.tip, w.max), w.tip * this.ends.data[v] ** (1 / Math.max(1, w.exponent))) / 2
  }

  // The widest any vein can be, halved, and a new tip's.
  private get widest() { const w = this.params.widths; return w ? (w.rule === 'even' ? w.tip : Math.max(w.tip, w.max)) / 2 : 0 }
  private get tip() { const w = this.params.widths; return w ? w.tip / 2 : 0 }

  // Two or three systems: a vein point of another system than `own` whose vein comes nearer the segment from a to b,
  // as wide as a tip, than `gap`, edge to edge; -1 when none does. Each vein is the segment from a point's parent to
  // it, and the loops that join it.
  private blocker(ax: number, ay: number, bx: number, by: number, own: number, gap: number): number {
    const P = this.params, mine = this.tip
    const xs = this.xs.data, ys = this.ys.data, SYS = this.sysOf.data, parent = this.parents.data
    // Every point of a vein that comes that near is within this distance of the segment's middle.
    const R = gap + mine + this.widest + Math.max(P.segment, P.kill) + Math.hypot(bx - ax, by - ay) / 2
    let hit = -1
    this.grid.near((ax + bx) / 2, (ay + by) / 2, R, xs, ys, id => {
      if (SYS[id] === own) return
      const need = gap + mine + this.radius(id), q = parent[id]
      if (segmentDistance(ax, ay, bx, by, q >= 0 ? xs[q] : xs[id], q >= 0 ? ys[q] : ys[id], xs[id], ys[id]) < need) { hit = id; return true }
      const joined = this.joinsAt.get(id)
      if (joined) for (const j of joined) if (segmentDistance(ax, ay, bx, by, xs[j], ys[j], xs[id], ys[id]) < need) { hit = id; return true }
    })
    return hit
  }

  // Leaf growth (Runions 2005, marginal growth): the outline grows from LEAF_START of its size to full size about
  // the first root, and each attractor counts from the step the growing outline first holds it. A shape in separate
  // parts, such as a pair of earrings or the letters of a word, grows each part about the first root in it, so each
  // grows as a leaf of its own rather than sweeping in from the first root's side.
  private setLeafGrowth() {
    const T = this.params.leafSteps
    this.appear.fill(0)
    if (!(T > 0) || !this.region || this.xs.length === 0) { this.centre = null; this.byPart = false; return }
    const c: Vec = [this.xs.data[0], this.ys.data[0]]
    this.centre = c
    const parts = this.region.parts()
    this.byPart = parts.length > 1
    // Where each attractor first shows in the outline grown about centre c, within the area `holds`.
    const appear = (i: number, c: Vec, holds: (x: number, y: number) => boolean) => {
      const inside = (s: number) => holds(c[0] + (this.ax[i] - c[0]) / s, c[1] + (this.ay[i] - c[1]) / s)
      let lo = LEAF_START, hi = 1
      if (inside(lo)) return 0
      for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (inside(mid)) hi = mid; else lo = mid }
      return Math.ceil(((hi - LEAF_START) / (1 - LEAF_START)) * T)
    }
    if (!this.byPart) {
      const holds = (x: number, y: number) => this.region!.contains(x, y)
      for (let i = 0; i < this.ax.length; i++) this.appear[i] = appear(i, c, holds)
      return
    }
    // The first root in each part is its centre; a part with no root has nothing to grow from.
    const centres: (Vec | null)[] = parts.map(() => null)
    for (let v = 0; v < this.xs.length; v++) {
      if (this.parents.data[v] >= 0) continue
      const k = partAt(parts, this.xs.data[v], this.ys.data[v])
      if (k >= 0 && !centres[k]) centres[k] = [this.xs.data[v], this.ys.data[v]]
    }
    const tests = parts.map((_, k) => (centres[k] ? partTest(parts, k) : null))
    for (let i = 0; i < this.ax.length; i++) {
      const k = partAt(parts, this.ax[i], this.ay[i]), centre = k >= 0 ? centres[k] : null, test = k >= 0 ? tests[k] : null
      if (!centre || !test) continue
      this.appear[i] = appear(i, centre, (x, y) => test(x, y) && this.region!.contains(x, y))
    }
  }

  // Bring each attractor's nearest vein point, in each tree it feeds, up to date with the points from index `from` on.
  private refreshNearest(from: number) {
    const n = this.xs.length
    if (n - from <= 0) return
    const T = this.T, xs = this.xs.data, ys = this.ys.data, SYS = this.sysOf.data
    for (let t = 0; t < T; t++) {
      const order: number[] = []
      for (let i = from; i < n; i++) if (T === 1 || SYS[i] === t) order.push(i)
      const m = order.length
      if (!m) continue
      order.sort((a, b) => xs[a] - xs[b] || a - b)
      const sx = new Float64Array(m), sy = new Float64Array(m), id = new Int32Array(m)
      order.forEach((p, i) => { sx[i] = xs[p]; sy[i] = ys[p]; id[i] = p })
      for (let s = 0; s < this.ax.length; s++) {
        if (this.used[s] !== LIVE) continue
        const a = this.asys[s]
        if (a !== SHARED && a !== t) continue
        const e = s * T + t, qx = this.ax[s], qy = this.ay[s]
        let b = this.best[e], o = this.owner[e]
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
        this.best[e] = b; this.owner[e] = o
      }
    }
  }

  private sees(v: number, s: number): boolean {
    return !this.region || this.region.sees(this.xs.data[v], this.ys.data[v], this.ax[s], this.ay[s])
  }

  // Join: whether a straight join between vein points a and b stays inside the shape, clear of its edges.
  private joinable(a: number, b: number): boolean {
    if (!this.region) return true
    const X = this.xs.data, Y = this.ys.data, clear = this.params.clearance ?? 0
    if (!this.region.sees(X[a], Y[a], X[b], Y[b])) return false
    return !(clear > 0) || this.region.clearOf(X[a], Y[a], X[b], Y[b], clear)
  }

  // Join: whether joining vein points v and u would sit beside a join already made, so near it along both trees that
  // the two joins would close a tiny loop between them, like the rungs of a ladder where two veins run side by side.
  // The same rule as loops: veins fewer than minLoop segments apart along the tree don't join.
  private besideLink(v: number, u: number): boolean {
    const L = this.linkList.data, m = this.linkList.length, limit = this.params.minLoop
    const X = this.xs.data, Y = this.ys.data, SYS = this.sysOf.data
    const far2 = (limit * this.params.segment) ** 2
    for (let i = 0; i + 1 < m; i += 2) {
      const [p, q] = SYS[L[i]] === SYS[v] ? [L[i], L[i + 1]] : [L[i + 1], L[i]]
      const dx = X[p] - X[v], dy = Y[p] - Y[v]
      if (dx * dx + dy * dy > far2) continue
      if (this.treeGap(v, p, limit) <= limit && this.treeGap(u, q, limit) <= limit) return true
    }
    return false
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
    const P = this.params, T = this.T
    const n = this.xs.length
    if (n === 0) { this.done = 'empty'; return null }
    if (this.pullN.length < n) {
      const size = Math.max(n, this.pullN.length * 2)
      this.pullX = new Float64Array(size); this.pullY = new Float64Array(size); this.pullN = new Float64Array(size)
      this.head = new Int32Array(size).fill(-1)
    }
    const xs = this.xs.data, ys = this.ys.data, SYS = this.sysOf.data
    const pullX = this.pullX, pullY = this.pullY, pullN = this.pullN, head = this.head
    const touched: number[] = []
    const usedNow: number[] = []
    const resolved: { s: number; arrived: number[] }[] = []
    const limit = P.attraction > 0 ? P.attraction : Infinity
    const step = this.step
    // Join closes the network itself, where the two trees meet: no loops.
    const open = P.topology === 'open' || this.joining
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
      // The tree it feeds. Join: a shared attractor pulls the tree whose nearest point is nearer, as one field of
      // attractors would, so each tree takes the space nearest it and the two meet between (ties go to the first).
      let t = this.asys[s]
      if (t === SHARED) { t = 0; for (let u = 1; u < T; u++) if (this.best[s * T + u] < this.best[s * T + t]) t = u }
      const e = s * T + t
      const d = Math.sqrt(this.best[e])
      if (open) {
        const v = this.owner[e]
        // Used up by a vein that reaches it; one just across an edge or a thin wall can't (it can't see it), but
        // it is in reach, so growth that stops with only these left has stalled, not run out of reach.
        if (d < P.kill) { if (this.sees(v, s)) { this.used[s] = USED; usedNow.push(s) } else inReach++; continue }
        if (!(d < limit)) continue
        inReach++
        if (!this.sees(v, s)) continue
        pulls(v, s, d)
      } else {
        if (!(d < limit)) continue
        inReach++
        // Far from every vein, the nearest point is the one that matters, and finding the whole neighbourhood
        // would search a wide empty area; loops only form once veins come near.
        if (d > Math.max(RN_FAR * P.segment, 2 * P.kill)) {
          const v = this.owner[e]
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

    // Join: each free tip pulls the nearest point of the other tree, and the two join once within the kill
    // distance. Tips are taken in order, so the result never depends on timing.
    let linkedNow = 0
    if (this.joining) {
      const reach = TIP_REACH * P.kill, w = Math.max(0, Math.min(1, P.tipPull ?? 0.6))
      for (let v = 0; v < n; v++) {
        if (!this.isTip(v)) continue
        const other = 1 - SYS[v]
        let u = -1, near = reach * reach
        this.grid.near(xs[v], ys[v], reach, xs, ys, (id, d2) => { if (SYS[id] === other && (d2 < near || (d2 === near && id < u))) { near = d2; u = id } })
        if (u < 0 || !this.joinable(v, u) || this.besideLink(v, u)) continue
        const d = Math.sqrt(near)
        if (d < P.kill) { this.link(v, u); linkedNow++; continue }
        if (!(w > 0) || this.linked.data[u] || !(d > 0)) continue
        if (pullN[u] === 0) touched.push(u)
        pullX[u] += (w * (xs[v] - xs[u])) / d
        pullY[u] += (w * (ys[v] - ys[u])) / d
        pullN[u] += w
      }
    }
    touched.sort((a, b) => a - b)

    // Grow the pulled points, all from the positions before this step.
    const D = P.segment, crowd2 = (P.crowd * D) ** 2, clear = this.region ? P.clearance ?? 0 : 0
    // Two or three systems keep apart: interwoven ones by the gap, Join's trees edge to edge.
    const weaving = this.weaving, apart = T > 1
    const gap = weaving ? Math.max(0, P.gap ?? 0) : 0, repel = weaving ? Math.max(0, Math.min(1, P.repel ?? 0)) : 0
    const newX: number[] = [], newY: number[] = [], newParent: number[] = []
    // A refused step uses up the attractors it would have come close to: a vein already fills that space.
    const covered = (P.kill + P.crowd * D) ** 2
    const refuse = (list: number, px: number, py: number) => {
      if (!open) return
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
      const own = SYS[v]
      if (repel > 0) {
        // Steer away from other systems' veins nearby. The push points away from them and is as strong as Repel
        // when one is close, never stronger, so the veins still follow their own attractors.
        const R = gap + 2 * this.widest + 2 * D
        let rx = 0, ry = 0, closest = 0
        this.grid.near(xs[v], ys[v], R, xs, ys, (id, d2) => {
          if (SYS[id] === own || d2 <= 0) return
          const d = Math.sqrt(d2), f = 1 - d / R
          if (f > closest) closest = f
          rx += ((xs[v] - xs[id]) / d) * f; ry += ((ys[v] - ys[id]) / d) * f
        })
        const L = Math.hypot(rx, ry)
        if (L > 0) { const k = (repel * closest) / L; vx += rx * k; vy += ry * k }
      }
      const mag = Math.hypot(vx, vy)
      if (!(mag > 1e-12)) continue
      let hx = vx / mag, hy = vy / mag
      // A step that another system's vein blocks turns away from it and tries again, so veins pass round each other.
      // Only the first try uses up attractors when it's refused: the rest can still be reached the long way round.
      const tries = apart ? TRIES : 1
      for (let attempt = 0; attempt < tries; attempt++) {
        const px = xs[v] + hx * D, py = ys[v] + hy * D
        if (this.region && (!this.region.contains(px, py) || this.region.crosses(xs[v], ys[v], px, py))) { if (attempt === 0) refuse(list, px, py); break }
        if (clear > 0 && !this.region!.clearOf(xs[v], ys[v], px, py, clear)) { if (attempt === 0) refuse(list, px, py); break }
        if (crowd2 > 0) {
          // Only a vein of its own system crowds it: Join's trees must meet, and the gap keeps interwoven ones apart.
          let crowded = false
          this.grid.near(px, py, P.crowd * D, xs, ys, id => { if (id !== v && (T === 1 || SYS[id] === own)) { crowded = true; return true } })
          if (!crowded) for (let i = 0; i < newX.length; i++) {
            if (T > 1 && SYS[newParent[i]] !== own) continue
            const dx = newX[i] - px, dy = newY[i] - py
            if (dx * dx + dy * dy < crowd2) { crowded = true; break }
          }
          if (crowded) { if (attempt === 0) refuse(list, px, py); break }
        }
        let blocked = -1, bx = 0, by = 0
        if (apart) {
          blocked = this.blocker(xs[v], ys[v], px, py, own, gap)
          if (blocked >= 0) { bx = xs[blocked]; by = ys[blocked] }
          else for (let i = 0; i < newX.length; i++) {
            const q = newParent[i]
            if (SYS[q] === own) continue
            if (segmentDistance(xs[v], ys[v], px, py, xs[q], ys[q], newX[i], newY[i]) < gap + 2 * this.tip) { blocked = i; bx = newX[i]; by = newY[i]; break }
          }
        }
        if (blocked < 0) { newX.push(px); newY.push(py); newParent.push(v); break }
        if (attempt === tries - 1) break
        // Turn away from the blocking vein, more on each try.
        const ox = px - bx, oy = py - by, oL = Math.hypot(ox, oy) || 1, k = 0.75 * 2 ** attempt
        hx += (ox / oL) * k; hy += (oy / oL) * k
        const hL = Math.hypot(hx, hy) || 1
        hx /= hL; hy /= hL
      }
    }
    const from = this.xs.length
    for (let i = 0; i < newX.length; i++) this.addPoint(newX[i], newY[i], newParent[i], SYS[newParent[i]])

    // Loops: each resolved source becomes a junction joined to every vein that arrived, unless two arrivals are
    // close along the tree, which would close a tiny bulb.
    let joined = 0
    for (const { s, arrived } of resolved) {
      this.used[s] = USED; usedNow.push(s)
      joined += this.junction(s, arrived)
    }
    this.refreshNearest(from)
    const grew = this.xs.length - from
    this.step++
    this.idle = usedNow.length > 0 || linkedNow > 0 ? 0 : this.idle + 1

    // Join keeps going while tips still find the other tree, after the last attractor is used.
    const tipsBusy = this.joining && (linkedNow > 0 || grew > 0) && this.live - usedNow.length === 0
    if (this.live - usedNow.length === 0 && !tipsBusy) this.done = 'reached'
    else if (this.xs.length >= P.maxPoints) this.done = 'cap'
    else if (waiting === 0 && ((grew === 0 && usedNow.length === 0 && linkedNow === 0) || this.idle >= this.idleLimit)) {
      if (!open) for (const settled of this.settleLoops()) usedNow.push(settled)
      if (this.weaving) for (const taken of this.settleTaken()) usedNow.push(taken)
      this.done = this.live - usedNow.length === 0 ? 'reached' : inReach === 0 ? 'out-of-reach' : 'stalled'
    }
    // Join: when growth stops, loose tips join the other tree if it is near and the join keeps the rules.
    if (this.done && this.joining) linkedNow += this.settleLinks()
    this.live -= usedNow.length
    return { grew, joined, linked: linkedNow, used: usedNow }
  }

  // A junction at source s, joined to the veins that arrived there whose joins stay clear of the edges (and, when
  // interwoven, of the other systems' veins). Returns the number of joins made.
  private junction(s: number, all: number[]): number {
    const P = this.params
    let arrived = this.clearArrivals(s, all)
    if (this.weaving) arrived = arrived.filter(v => this.blocker(this.xs.data[v], this.ys.data[v], this.ax[s], this.ay[s], this.sysOf.data[v], Math.max(0, P.gap ?? 0)) < 0)
    if (arrived.length < 2) return 0
    const first = arrived[0]
    const others = arrived.slice(1).filter(v => this.treeGap(v, first, P.minLoop) > P.minLoop)
    if (!others.length) return 0
    const j = this.addPoint(this.ax[s], this.ay[s], first, this.sysOf.data[first])
    for (const v of others) this.join(v, j)
    return others.length
  }

  // Stuck with loops: a source that veins did reach joins them there and is used up. One no vein reached stays,
  // so the page can say it's out of reach, and a longer attraction distance can still grow to it. Only the kill
  // distance round each source is searched, so this stays quick. Returns the sources it used up.
  private settleLoops(): number[] {
    const P = this.params, out: number[] = []
    const from = this.xs.length
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE || this.appear[s] > this.step) continue
      if (!(Math.sqrt(this.best[s * this.T + this.asys[s]]) < P.kill)) continue
      const found = this.neighbourhood(s, 0, P.kill).map(([v]) => v)
      if (!found.length) continue
      this.used[s] = USED; out.push(s)
      this.junction(s, found)
    }
    if (this.xs.length > from) this.refreshNearest(from)
    return out
  }

  // Interweave, when growth stops: an attractor still live that is nearer another system's vein than any vein of its
  // own lies in that system's space, which its own veins can't enter without crossing; it's used up, so growth that
  // has filled the shape ends as reached. An attractor whose system has no vein yet stays. Returns those used up.
  private settleTaken(): number[] {
    const T = this.T, xs = this.xs.data, ys = this.ys.data, SYS = this.sysOf.data, out: number[] = []
    for (let s = 0; s < this.ax.length; s++) {
      if (this.used[s] !== LIVE || this.appear[s] > this.step) continue
      const t = this.asys[s], own = this.best[s * T + t]
      if (!Number.isFinite(own)) continue
      let taken = false
      this.grid.near(this.ax[s], this.ay[s], Math.sqrt(own), xs, ys, id => { if (SYS[id] !== t) { taken = true; return true } })
      if (taken) { this.used[s] = USED; out.push(s) }
    }
    return out
  }

  // Join, at the end: each loose tip within two kill distances of the other tree joins its nearest point there, if
  // the straight join stays inside the shape and clear of its edges, so near misses still connect. Returns the
  // number of joins.
  private settleLinks(): number {
    const reach = 2 * this.params.kill
    const xs = this.xs.data, ys = this.ys.data, SYS = this.sysOf.data
    let made = 0
    for (let v = 0; v < this.xs.length; v++) {
      if (!this.isTip(v)) continue
      const other = 1 - SYS[v]
      let u = -1, near = reach * reach
      this.grid.near(xs[v], ys[v], reach, xs, ys, (id, d2) => { if (SYS[id] === other && (d2 < near || (d2 === near && id < u))) { near = d2; u = id } })
      if (u < 0 || !this.joinable(v, u) || this.besideLink(v, u)) continue
      this.link(v, u)
      made++
    }
    return made
  }

  // The veins that arrived at source s whose join to it stays clear of the edges, when there's an edge clearance.
  private clearArrivals(s: number, arrived: number[]): number[] {
    const clear = this.params.clearance ?? 0
    if (!this.region || !(clear > 0)) return arrived
    return arrived.filter(v => this.region!.clearOf(this.xs.data[v], this.ys.data[v], this.ax[s], this.ay[s], clear))
  }

  // The relative neighbourhood of source s among the vein points of its own system it can see: v counts unless
  // some u is nearer the source than v and nearer v than the source is (Runions 2005, Eq. 2). Nearest first.
  // `within` limits the search to that distance instead of one set by the nearest vein point.
  private neighbourhood(s: number, nearest: number, within?: number): [number, number][] {
    const P = this.params, qx = this.ax[s], qy = this.ay[s], T = this.T, t = this.asys[s], SYS = this.sysOf.data
    const reach = within ?? Math.min(P.attraction > 0 ? P.attraction : Infinity, 2.5 * nearest + 2 * P.segment)
    const found: [number, number][] = []
    this.grid.near(qx, qy, within ?? Math.max(reach, nearest * 1.000001 + 1e-9), this.xs.data, this.ys.data, (id, d2) => { if (T === 1 || SYS[id] === t) found.push([id, Math.sqrt(d2)]) })
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
