// Where the attractors go: the points veins grow toward. The count is exact. Even uses Mitchell's best
// candidate (blue noise, like Runions' dart throwing, but with an exact count); Random is plain uniform; Grid is a
// jittered square grid, the look of Gil's BioVessel page; Edge crowds them near the outline (Runions 2007,
// Fig. 7); Picture puts more where a picture is darker. The same seed always gives the same points.
import type { Box } from './geometry'
import { Rng } from './random'
import type { Region } from './region'

export type Placement = 'even' | 'random' | 'grid' | 'edge' | 'picture'

// A picture's darkness, 0 (white) to 1 (black), row by row, and the sheet rectangle (mm) it covers.
export type DensityMap = { width: number; height: number; dark: Float32Array; box: Box }

const CANDIDATES = 12
const FLOOR = 0.02

export function darknessAt(map: DensityMap, x: number, y: number): number {
  const [x0, y0, x1, y1] = map.box
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0
  const i = Math.min(map.width - 1, Math.max(0, Math.floor(((x - x0) / (x1 - x0)) * map.width)))
  const j = Math.min(map.height - 1, Math.max(0, Math.floor(((y - y0) / (y1 - y0)) * map.height)))
  return map.dark[j * map.width + i]
}

export type Placed = { points: Float64Array; short: boolean }

// clearance: no attractor closer than this to an edge, so veins can reach them all without coming nearer.
export function placeAttractors(region: Region, count: number, placement: Placement, seed: number, picture?: DensityMap | null, clearance = 0): Placed {
  const n = Math.max(0, Math.floor(count))
  if (n === 0 || region.empty || region.area <= 0) return { points: new Float64Array(0), short: n > 0 }
  const rng = new Rng(seed)
  const fits = clearance > 0
    ? (x: number, y: number) => region.contains(x, y) && !region.nearEdge(x, y, clearance)
    : (x: number, y: number) => region.contains(x, y)
  if (placement === 'grid') return gridPoints(region, n, rng, fits)
  const [x0, y0, x1, y1] = region.box
  const w = x1 - x0, h = y1 - y0
  const size = Math.min(w, h)
  // How likely a point is kept where it lands, 0–1. Even and Random keep every inside point.
  const edgeWidth = 0.07 * size
  const density = placement === 'edge'
    ? (x: number, y: number) => 0.1 + 0.9 * Math.exp(-region.edgeDistance(x, y, 4 * edgeWidth) / edgeWidth)
    : placement === 'picture' && picture
      ? (x: number, y: number) => Math.max(FLOOR, darknessAt(picture, x, y))
      : null
  const spacing = Math.sqrt(region.area / n)
  const cell = spacing
  const grid = new Map<number, number[]>()
  const keyOf = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768)
  const xs: number[] = [], ys: number[] = []
  const reach = 2 * spacing
  // Distance to the nearest point placed so far, up to `reach`.
  const nearest = (x: number, y: number): number => {
    let best = reach * reach
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell)
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      const list = grid.get(keyOf(i, j))
      if (!list) continue
      for (const p of list) { const dx = xs[p] - x, dy = ys[p] - y, d = dx * dx + dy * dy; if (d < best) best = d }
    }
    return Math.sqrt(best)
  }
  // One random point inside the shape that passes the density test, with its density, or null after many
  // misses. The density is worked out once here, as it's the slow part.
  const sample = (): [number, number, number] | null => {
    for (let tries = 0; tries < 400; tries++) {
      const x = x0 + rng.next() * w, y = y0 + rng.next() * h
      if (!fits(x, y)) continue
      const d = density ? density(x, y) : 1
      if (density && rng.next() >= d) continue
      return [x, y, d]
    }
    return null
  }
  const k = placement === 'random' ? 1 : CANDIDATES
  // A point whose samples all missed the shape is tried again; only many misses in a row mean there's no room
  // left, as in a very pale picture.
  for (let misses = 0; xs.length < n && misses < 60;) {
    let best: [number, number, number] | null = null, score = -1
    for (let c = 0; c < k; c++) {
      const q = sample()
      if (!q) continue
      if (k === 1) { best = q; break }
      // Distances are measured in local spacing units, so denser areas stay denser.
      const s = nearest(q[0], q[1]) * (density ? Math.sqrt(q[2]) : 1)
      if (s > score) { score = s; best = q }
    }
    if (!best) { misses++; continue }
    misses = 0
    xs.push(best[0]); ys.push(best[1])
    const key = keyOf(Math.floor((best[0] - x0) / cell), Math.floor((best[1] - y0) / cell))
    const list = grid.get(key)
    if (list) list.push(xs.length - 1); else grid.set(key, [xs.length - 1])
  }
  const points = new Float64Array(xs.length * 2)
  for (let i = 0; i < xs.length; i++) { points[i * 2] = xs[i]; points[i * 2 + 1] = ys[i] }
  return { points, short: xs.length < n }
}

// A square grid with the spacing that fits `n` points in the shape, each point moved up to half a cell at random.
// Grid points outside the shape are dropped; if that leaves too few, the grid is refined until there are enough,
// then trimmed to exactly n in a random order.
function gridPoints(region: Region, n: number, rng: Rng, fits: (x: number, y: number) => boolean): Placed {
  const [x0, y0, x1, y1] = region.box
  let a = Math.sqrt(region.area / n)
  for (let attempt = 0; attempt < 16; attempt++) {
    const pts: number[] = []
    for (let y = y0 + a / 2; y < y1; y += a) for (let x = x0 + a / 2; x < x1; x += a) {
      const px = x + (rng.next() - 0.5) * a, py = y + (rng.next() - 0.5) * a
      if (fits(px, py)) pts.push(px, py)
    }
    if (pts.length / 2 >= n || attempt === 15) {
      const count = pts.length / 2
      // Fisher–Yates, then keep the first n.
      const order = Array.from({ length: count }, (_, i) => i)
      for (let i = count - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
      const keep = order.slice(0, Math.min(n, count)).sort((p, q) => p - q)
      const points = new Float64Array(keep.length * 2)
      keep.forEach((o, i) => { points[i * 2] = pts[o * 2]; points[i * 2 + 1] = pts[o * 2 + 1] })
      return { points, short: keep.length < n }
    }
    a *= 0.9
  }
  return { points: new Float64Array(0), short: true }
}
