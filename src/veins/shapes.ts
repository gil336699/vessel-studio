// Ready-made shapes, in sheet millimetres: a rectangle, an ellipse, a ring and a leaf, each inside the sheet's
// margin. Inverting puts the shape in a sheet-sized rectangle as a hole, so veins grow round it instead.
import { ellipseRing, rectRing, type Ring, type Vec } from './geometry'

export type ShapeKind = 'leaf' | 'ellipse' | 'rect' | 'ring' | 'imported'

const LEAF_STEPS = 96

// An ovate leaf with a pointed tip, widest about 40 % of the way from its base, its base at the bottom middle.
// Half-width along the midrib follows sin(π t^p): rounded at the base, straight-sided into the tip.
export function leafRing(x0: number, y0: number, x1: number, y1: number): Ring {
  const cx = (x0 + x1) / 2, half = (x1 - x0) / 2, length = y1 - y0
  const p = Math.log(0.5) / Math.log(0.4)
  const right: Vec[] = []
  for (let i = 1; i < LEAF_STEPS; i++) {
    const t = i / LEAF_STEPS
    const w = half * Math.sin(Math.PI * t ** p)
    right.push([cx + w, y1 - t * length])
  }
  const left = right.map(([x, y]): Vec => [2 * cx - x, y]).reverse()
  return [[cx, y1], ...right, [cx, y0], ...left]
}

export function presetRings(kind: Exclude<ShapeKind, 'imported'>, width: number, height: number, margin: number): Ring[] {
  const m = Math.max(0, Math.min(margin, Math.min(width, height) / 2 - 1))
  const x0 = m, y0 = m, x1 = width - m, y1 = height - m
  const cx = width / 2, cy = height / 2
  switch (kind) {
    case 'rect': return [rectRing(x0, y0, x1, y1)]
    case 'ellipse': return [ellipseRing(cx, cy, (x1 - x0) / 2, (y1 - y0) / 2)]
    case 'ring': return [ellipseRing(cx, cy, (x1 - x0) / 2, (y1 - y0) / 2), ellipseRing(cx, cy, ((x1 - x0) / 2) * 0.36, ((y1 - y0) / 2) * 0.36).reverse()]
    case 'leaf': {
      // A leaf about 0.62 times as wide as it is long, as large as the sheet allows.
      const w = Math.min(x1 - x0, 0.62 * (y1 - y0))
      return [leafRing(cx - w / 2, y0, cx + w / 2, y1)]
    }
  }
}

// The sheet as an outer ring with the shape's rings inside it as holes.
export function invertRings(rings: Ring[], width: number, height: number): Ring[] {
  return [rectRing(0, 0, width, height), ...rings]
}

// Where each shape's veins start by default: a leaf's base, the bottom middle of a rectangle, the centre of an
// ellipse, the bottom of a ring's band.
export function defaultRoots(kind: ShapeKind, width: number, height: number, margin: number, inverted: boolean): Vec[] {
  const m = Math.max(0, Math.min(margin, Math.min(width, height) / 2 - 1))
  if (inverted) return [[width / 2, height - Math.max(1, m / 2)]]
  switch (kind) {
    case 'leaf': return [[width / 2, height - m - Math.max(1, (height - 2 * m) * 0.01)]]
    case 'rect': return [[width / 2, height - m - 1]]
    case 'ring': return [[width / 2, height / 2 + ((height - 2 * m) / 2) * 0.68]]
    default: return [[width / 2, height / 2]]
  }
}
