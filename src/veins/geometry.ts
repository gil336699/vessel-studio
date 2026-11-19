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

// Whether segments ab and cd meet: cross, touch, or overlap along a line. It is cautious on purpose: a growth
// step that touches the edge, passes exactly through a corner of it, or slides along it counts as leaving.
export function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) return false
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  if ((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) return false
  // Collinear or touching: count it only when the segments overlap with some length, which a growth step
  // sliding along an edge would do.
  if (d1 === 0 && d2 === 0) {
    const t = (v: number, a: number, b: number) => (b - a !== 0 ? (v - a) / (b - a) : 0)
    const useX = Math.abs(bx - ax) >= Math.abs(by - ay)
    const s0 = useX ? t(cx, ax, bx) : t(cy, ay, by), s1 = useX ? t(dx, ax, bx) : t(dy, ay, by)
    return Math.max(Math.min(s0, s1), 0) < Math.min(Math.max(s0, s1), 1)
  }
  return d1 !== d2 && d3 !== d4
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
