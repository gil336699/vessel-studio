// The shape veins grow inside: one or more closed outlines, read even-odd, so a ring inside another is a hole
// (an obstacle veins grow round). Built once per shape. Inside tests use horizontal bands of edges, and
// crossing tests walk a grid of edges along the segment, so an imported outline with thousands of points
// stays fast.
import { boxesOverlap, boxOf, isConvex, signedArea, toSegment, type Box, type Ring, type Vec } from './geometry'
import { ringInside } from './strokes'

export class Region {
  readonly rings: Ring[]
  readonly box: Box
  readonly area: number
  // One convex outline: any two inside points see each other, so line-of-sight tests can be skipped.
  readonly convex: boolean
  readonly edgeCount: number
  private ex0: Float64Array
  private ey0: Float64Array
  private ex1: Float64Array
  private ey1: Float64Array
  // Edges by horizontal band, for inside tests.
  private bandY0 = 0
  private bandH = 1
  private bandStart: Int32Array
  private bandItems: Int32Array
  // Edges by grid cell, for crossing and distance tests.
  private gx0 = 0
  private gy0 = 0
  private cell = 1
  private nx = 1
  private ny = 1
  private cellStart: Int32Array
  private cellItems: Int32Array
  private stamp: Int32Array
  private query = 0

  constructor(rings: Ring[]) {
    this.rings = rings.filter(r => r.length >= 3)
    this.box = this.rings.length ? boxOf(this.rings) : [0, 0, 0, 0]
    // Even-odd: a ring inside an odd number of other rings is a hole, so its area counts against the total.
    // Rings whose boxes don't meet can't be nested, which skips most pairs in a drawing of many outlines.
    const boxes = this.rings.map(r => boxOf([r]))
    this.area = Math.max(0, this.rings.reduce((sum, ring, i) => {
      const depth = this.rings.reduce((k, other, j) => k + (j !== i && boxesOverlap(boxes[i], boxes[j]) && ringInside(ring, other) ? 1 : 0), 0)
      return sum + (depth % 2 ? -1 : 1) * Math.abs(signedArea(ring))
    }, 0))
    this.convex = this.rings.length === 1 && isConvex(this.rings[0])
    const edges: number[] = []
    for (const ring of this.rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      if (a[0] === b[0] && a[1] === b[1]) continue
      edges.push(a[0], a[1], b[0], b[1])
    }
    const n = edges.length / 4
    this.edgeCount = n
    this.ex0 = new Float64Array(n); this.ey0 = new Float64Array(n); this.ex1 = new Float64Array(n); this.ey1 = new Float64Array(n)
    for (let i = 0; i < n; i++) { this.ex0[i] = edges[i * 4]; this.ey0[i] = edges[i * 4 + 1]; this.ex1[i] = edges[i * 4 + 2]; this.ey1[i] = edges[i * 4 + 3] }
    this.stamp = new Int32Array(n)

    const [x0, y0, x1, y1] = this.box
    const w = Math.max(1e-9, x1 - x0), h = Math.max(1e-9, y1 - y0)
    // Bands: about one edge per band, at most 2,048.
    const bands = Math.max(1, Math.min(2048, n))
    this.bandY0 = y0; this.bandH = h / bands
    const bandCount = new Int32Array(bands + 1)
    const bandOf = (y: number) => Math.min(bands - 1, Math.max(0, Math.floor((y - this.bandY0) / this.bandH)))
    for (let i = 0; i < n; i++) {
      const b0 = bandOf(Math.min(this.ey0[i], this.ey1[i])), b1 = bandOf(Math.max(this.ey0[i], this.ey1[i]))
      for (let b = b0; b <= b1; b++) bandCount[b + 1]++
    }
    for (let b = 0; b < bands; b++) bandCount[b + 1] += bandCount[b]
    this.bandStart = bandCount.slice()
    this.bandItems = new Int32Array(bandCount[bands])
    const fill = bandCount.slice()
    for (let i = 0; i < n; i++) {
      const b0 = bandOf(Math.min(this.ey0[i], this.ey1[i])), b1 = bandOf(Math.max(this.ey0[i], this.ey1[i]))
      for (let b = b0; b <= b1; b++) this.bandItems[fill[b]++] = i
    }

    // Grid: about one edge per cell, cells no smaller than 1/512 of the shape.
    this.cell = Math.max(Math.max(w, h) / 512, Math.sqrt((w * h) / Math.max(16, n)))
    this.gx0 = x0 - this.cell * 0.5; this.gy0 = y0 - this.cell * 0.5
    this.nx = Math.max(1, Math.ceil(w / this.cell) + 1); this.ny = Math.max(1, Math.ceil(h / this.cell) + 1)
    const cells = this.nx * this.ny
    const count = new Int32Array(cells + 1)
    const each = (i: number, fn: (c: number) => void) => {
      const cx0 = this.cx(Math.min(this.ex0[i], this.ex1[i])), cx1 = this.cx(Math.max(this.ex0[i], this.ex1[i]))
      const cy0 = this.cy(Math.min(this.ey0[i], this.ey1[i])), cy1 = this.cy(Math.max(this.ey0[i], this.ey1[i]))
      for (let j = cy0; j <= cy1; j++) for (let k = cx0; k <= cx1; k++) fn(j * this.nx + k)
    }
    for (let i = 0; i < n; i++) each(i, c => { count[c + 1]++ })
    for (let c = 0; c < cells; c++) count[c + 1] += count[c]
    this.cellStart = count.slice()
    this.cellItems = new Int32Array(count[cells])
    const at = count.slice()
    for (let i = 0; i < n; i++) each(i, c => { this.cellItems[at[c]++] = i })
  }

  private cx(x: number) { return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.gx0) / this.cell))) }
  private cy(y: number) { return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.gy0) / this.cell))) }

  get empty(): boolean { return this.edgeCount === 0 }

  // Even-odd: inside when a ray to the right crosses an odd number of edges.
  contains(x: number, y: number): boolean {
    const [bx0, by0, bx1, by1] = this.box
    if (this.edgeCount === 0 || x < bx0 || x > bx1 || y < by0 || y > by1) return false
    const band = Math.min(this.bandStart.length - 2, Math.max(0, Math.floor((y - this.bandY0) / this.bandH)))
    let inside = false
    for (let k = this.bandStart[band]; k < this.bandStart[band + 1]; k++) {
      const i = this.bandItems[k]
      const yi = this.ey0[i], yj = this.ey1[i]
      if ((yi > y) !== (yj > y)) {
        const xi = this.ex0[i], xj = this.ex1[i]
        if (x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside
      }
    }
    return inside
  }

  // Whether the segment from a to b meets any edge. Walks the grid cells the segment passes through.
  crosses(ax: number, ay: number, bx: number, by: number): boolean {
    if (this.edgeCount === 0) return false
    const q = ++this.query
    let hit = false
    this.walk(ax, ay, bx, by, c => {
      for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
        const i = this.cellItems[k]
        if (this.stamp[i] === q) continue
        this.stamp[i] = q
        if (segmentMeets(ax, ay, bx, by, this.ex0[i], this.ey0[i], this.ex1[i], this.ey1[i])) { hit = true; return true }
      }
      return false
    })
    return hit
  }

  // Line of sight between two inside points: true when no edge is in the way.
  sees(ax: number, ay: number, bx: number, by: number): boolean {
    return this.convex || !this.crosses(ax, ay, bx, by)
  }

  // Distance to the nearest edge, or maxR when none is that close.
  edgeDistance(x: number, y: number, maxR: number): number {
    if (this.edgeCount === 0) return maxR
    let best = maxR
    const c0 = this.cx(x - maxR), c1 = this.cx(x + maxR), r0 = this.cy(y - maxR), r1 = this.cy(y + maxR)
    const q = ++this.query
    for (let j = r0; j <= r1; j++) for (let k = c0; k <= c1; k++) {
      const c = j * this.nx + k
      for (let m = this.cellStart[c]; m < this.cellStart[c + 1]; m++) {
        const i = this.cellItems[m]
        if (this.stamp[i] === q) continue
        this.stamp[i] = q
        const d = toSegment(x, y, this.ex0[i], this.ey0[i], this.ex1[i], this.ey1[i]).d
        if (d < best) best = d
      }
    }
    return best
  }

  // Whether the whole segment from a to b stays at least r from every edge: the edge clearance. Searches the grid
  // cells round the segment and measures exact segment-to-edge distances, so a vein can't cut close past a corner.
  clearOf(ax: number, ay: number, bx: number, by: number, r: number): boolean {
    if (this.edgeCount === 0 || !(r > 0)) return true
    const c0 = this.cx(Math.min(ax, bx) - r), c1 = this.cx(Math.max(ax, bx) + r)
    const r0 = this.cy(Math.min(ay, by) - r), r1 = this.cy(Math.max(ay, by) + r)
    const q = ++this.query
    for (let j = r0; j <= r1; j++) for (let k = c0; k <= c1; k++) {
      const c = j * this.nx + k
      for (let m = this.cellStart[c]; m < this.cellStart[c + 1]; m++) {
        const i = this.cellItems[m]
        if (this.stamp[i] === q) continue
        this.stamp[i] = q
        if (segmentDistance(ax, ay, bx, by, this.ex0[i], this.ey0[i], this.ex1[i], this.ey1[i]) < r) return false
      }
    }
    return true
  }

  // The point itself when it's inside, otherwise the nearest point a little way inside the edge. Used for roots,
  // which must start inside so their first step doesn't cross the edge.
  nearestInside(x: number, y: number, inset: number): Vec | null {
    if (this.contains(x, y) && this.edgeDistance(x, y, inset) >= inset) return [x, y]
    let best: { d: number; x: number; y: number; i: number } | null = null
    for (let i = 0; i < this.edgeCount; i++) {
      const s = toSegment(x, y, this.ex0[i], this.ey0[i], this.ex1[i], this.ey1[i])
      if (!best || s.d < best.d) best = { ...s, i }
    }
    if (!best) return null
    // Step in from the nearest edge point, further each try, until the point is inside and clear of every edge.
    const ex = this.ex1[best.i] - this.ex0[best.i], ey = this.ey1[best.i] - this.ey0[best.i], L = Math.hypot(ex, ey) || 1
    for (const k of [1, 1.5, 2, 4, 8, 16]) for (const side of [1, -1]) {
      const px = best.x + (-ey / L) * side * inset * k, py = best.y + (ex / L) * side * inset * k
      if (this.contains(px, py) && this.edgeDistance(px, py, inset) >= inset * 0.999) return [px, py]
    }
    return null
  }

  // Grid cells along a segment, in order (Amanatides and Woo). visit returns true to stop.
  private walk(ax: number, ay: number, bx: number, by: number, visit: (cell: number) => boolean) {
    let i = this.cx(ax), j = this.cy(ay)
    const iEnd = this.cx(bx), jEnd = this.cy(by)
    const dx = bx - ax, dy = by - ay
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1
    const fx = (ax - this.gx0) / this.cell, fy = (ay - this.gy0) / this.cell
    let tMaxX = dx !== 0 ? ((stepX > 0 ? Math.floor(fx) + 1 - fx : fx - Math.floor(fx)) * this.cell) / Math.abs(dx) : Infinity
    let tMaxY = dy !== 0 ? ((stepY > 0 ? Math.floor(fy) + 1 - fy : fy - Math.floor(fy)) * this.cell) / Math.abs(dy) : Infinity
    const tDeltaX = dx !== 0 ? this.cell / Math.abs(dx) : Infinity, tDeltaY = dy !== 0 ? this.cell / Math.abs(dy) : Infinity
    for (let guard = 0; guard < this.nx + this.ny + 4; guard++) {
      if (visit(j * this.nx + i)) return
      if (i === iEnd && j === jEnd) return
      if (tMaxX < tMaxY) { tMaxX += tDeltaX; i += stepX; if (i < 0 || i >= this.nx) return }
      else { tMaxY += tDeltaY; j += stepY; if (j < 0 || j >= this.ny) return }
    }
  }
}

// The shortest distance between segments ab and cd: 0 when they meet, otherwise from an end of one to the other.
function segmentDistance(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (segmentMeets(ax, ay, bx, by, cx, cy, dx, dy)) return 0
  return Math.min(toSegment(ax, ay, cx, cy, dx, dy).d, toSegment(bx, by, cx, cy, dx, dy).d, toSegment(cx, cy, ax, ay, bx, by).d, toSegment(dx, dy, ax, ay, bx, by).d)
}

// Whether segments ab and cd meet: cross, touch, or overlap. Cautious on purpose (see geometry.segmentsCross).
function segmentMeets(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) return false
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  if ((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) return false
  if (d1 === 0 && d2 === 0) {
    const useX = Math.abs(bx - ax) >= Math.abs(by - ay)
    const t = (v: number, a: number, b: number) => (b - a !== 0 ? (v - a) / (b - a) : 0)
    const s0 = useX ? t(cx, ax, bx) : t(cy, ay, by), s1 = useX ? t(dx, ax, bx) : t(dy, ay, by)
    return Math.max(Math.min(s0, s1), 0) <= Math.min(Math.max(s0, s1), 1)
  }
  return true
}
