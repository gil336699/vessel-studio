// Plain 2D geometry for the engine and the file formats. Lengths are millimetres, with the sheet's top-left
// corner at 0, 0 and y pointing down, as in SVG.
export type Vec = [number, number]
// A closed outline. The last point joins the first; it isn't repeated.
export type Ring = Vec[]

export function signedArea(ring: Ring): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  return a / 2
}

export type Box = [number, number, number, number] // x0, y0, x1, y1

// A ring clipped to a box (Sutherland–Hodgman), so only what lies on the box is left. For an even-odd shape,
// clipping each ring to the box leaves exactly the shape within it. A ring already inside comes back as it was.
export function clipRingToBox(ring: Ring, [x0, y0, x1, y1]: Box): Ring {
  if (ring.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1)) return ring
  const side = (keep: (p: Vec) => boolean, cut: (a: Vec, b: Vec) => Vec) => (pts: Ring): Ring => {
    const out: Ring = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i]
      if (keep(b)) { if (!keep(a)) out.push(cut(a, b)); out.push(b) } else if (keep(a)) out.push(cut(a, b))
    }
    return out
  }
  const atX = (x: number) => (a: Vec, b: Vec): Vec => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
  const atY = (y: number) => (a: Vec, b: Vec): Vec => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y]
  let out = side(p => p[0] >= x0, atX(x0))(ring)
  out = side(p => p[0] <= x1, atX(x1))(out)
  out = side(p => p[1] >= y0, atY(y0))(out)
  out = side(p => p[1] <= y1, atY(y1))(out)
  return out
}

// Even-odd inside test against one ring.
export function pointInRing(ring: Ring, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) inside = !inside
  }
  return inside
}

export const boxesOverlap = (a: Box, b: Box): boolean => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

// Calls visit(i, j), i < j, for every two boxes that overlap, until it returns true. The boxes are sorted by
// their left edges and swept left to right, so a drawing of thousands of small outlines never compares two that
// are far apart. pad: how far each box reaches beyond its edges.
export function eachOverlap(boxes: Box[], visit: (i: number, j: number) => boolean | void, pad: (i: number) => number = () => 0): void {
  const n = boxes.length
  const reach = Array.from({ length: n }, (_, i) => pad(i))
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => boxes[a][0] - reach[a] - (boxes[b][0] - reach[b]) || a - b)
  let active: number[] = []
  for (const i of order) {
    const [x0, y0, x1, y1] = boxes[i], p = reach[i]
    active = active.filter(j => boxes[j][2] + reach[j] >= x0 - p)
    for (const j of active) {
      const b = boxes[j], q = reach[j]
      if (b[1] - q <= y1 + p && y0 - p <= b[3] + q && b[0] - q <= x1 + p && (i < j ? visit(i, j) : visit(j, i))) return
    }
    active.push(i)
  }
}

// Whether a ring encloses any area. A bow tie or a figure of eight drawn as one path winds its two halves opposite
// ways, so its signed area adds up to nothing: for a ring like that, points inside it are looked for instead.
export function hasArea(ring: Ring): boolean {
  if (ring.length < 3) return false
  if (Math.abs(signedArea(ring)) > 1e-9) return true
  const [x0, y0, x1, y1] = boxOf([ring])
  if (!(x1 - x0 > 1e-9 && y1 - y0 > 1e-9)) return false
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (pointInRing(ring, x0 + ((i + 0.5) / 32) * (x1 - x0), y0 + ((j + 0.5) / 32) * (y1 - y0))) return true
  return false
}

export function boxOf(rings: Ring[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const ring of rings) for (const [x, y] of ring) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

// Distance from p to segment ab, and the nearest point.
export function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; x: number; y: number } {
  const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / L2)) : 0
  const x = ax + ex * t, y = ay + ey * t
  return { d: Math.hypot(px - x, py - y), x, y }
}

export function ellipseRing(cx: number, cy: number, rx: number, ry: number, segments = 160): Ring {
  const out: Ring = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)])
  }
  return out
}

export function rectRing(x0: number, y0: number, x1: number, y1: number): Ring {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

// Whether a single ring is convex, which lets the engine skip line-of-sight tests: every turn goes the same
// way and they add up to one full turn. A star drawn point to point turns the same way at every corner too, but
// twice round, so it isn't convex.
export function isConvex(ring: Ring): boolean {
  let sign = 0, turning = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], c = ring[(i + 2) % ring.length]
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1]
    const z = ux * vy - uy * vx
    turning += Math.atan2(z, ux * vx + uy * vy)
    if (Math.abs(z) < 1e-12) continue
    const s = Math.sign(z)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return Math.abs(Math.abs(turning) - 2 * Math.PI) < 1e-6
}
