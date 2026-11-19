// A design: the settings, the shape (a preset or an imported outline), the roots and the attractors, plus the
// growth so far. Everything here is plain data, so it can go into a project file, the worker and undo.
import { placeAttractors, type DensityMap } from '../veins/attractors'
import type { EngineState } from '../veins/engine'
import type { Ring, Vec } from '../veins/geometry'
import { Rng } from '../veins/random'
import { Region } from '../veins/region'
import { defaultRoots, invertRings, presetRings } from '../veins/shapes'
import { fitPicture, type PictureData } from './picture'
import { sanitizeSettings, type Settings } from './settings'
import type { SizedBy } from './svgImport'

// An outline read from an SVG, in millimetres on its file's page, which becomes the sheet.
export type Imported = { name: string; sized: SizedBy; width: number; height: number; rings: Ring[] }

// The veins grown so far, exactly as the engine holds them (see veins/engine.ts, EngineState).
export type Growth = { step: number; rng: number; idle: number; done: EngineState['done']; x: Float64Array; y: Float64Array; parent: Int32Array; joins: Int32Array; used: Uint8Array }

export type Design = {
  settings: Settings
  imported: Imported | null
  roots: Vec[] // where growth starts; Reset goes back to these
  attractors: Float64Array
  // How the attractors were placed, so a change to any of these places them again.
  placedFor: string
  growth: Growth
}

// Growth that hasn't started: just the roots.
export function startGrowth(roots: Vec[], attractorCount: number, seed: number): Growth {
  return {
    step: 0, rng: new Rng(seed).state, idle: 0, done: null,
    x: Float64Array.from(roots.map(r => r[0])), y: Float64Array.from(roots.map(r => r[1])), parent: new Int32Array(roots.length).fill(-1),
    joins: new Int32Array(0), used: new Uint8Array(attractorCount),
  }
}

export const hasGrown = (d: Design) => d.growth.step > 0 || d.growth.x.length > d.roots.length

export function engineState(g: Growth): EngineState {
  return { step: g.step, rng: g.rng, idle: g.idle, done: g.done, x: g.x, y: g.y, parent: g.parent, joins: g.joins, used: g.used }
}

// The shape's outlines in sheet millimetres. An imported outline scales with the sheet, keeping its place on the
// page, as the sheet's width and height follow each other for imported shapes.
export function shapeRings(s: Settings, imported: Imported | null): Ring[] {
  let rings: Ring[]
  if (s.shape === 'imported') {
    const kx = imported ? s.width / imported.width : 1, ky = imported ? s.height / imported.height : 1
    rings = (imported?.rings ?? []).map(ring => (kx === 1 && ky === 1 ? ring : ring.map(([x, y]): Vec => [x * kx, y * ky])))
  } else rings = presetRings(s.shape, s.width, s.height, s.margin)
  return s.invert ? invertRings(rings, s.width, s.height) : rings
}

// A short fingerprint of an imported outline's points, so an edited file with the same name still counts as new.
export function outlineFingerprint(imported: Imported | null): string {
  if (!imported) return ''
  let h = 2166136261, n = 0
  for (const ring of imported.rings) for (const p of ring) for (const v of p) { h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619); n++ }
  return `${imported.rings.length}.${n}.${(h >>> 0).toString(36)}`
}

// Settings that decide where attractors go. A picture isn't part of it: choosing one places them again on its own.
export function placementKey(s: Settings, imported: Imported | null): string {
  return JSON.stringify([s.width, s.height, s.margin, s.shape, s.invert, s.count, s.placement, s.seed, s.shape === 'imported' ? outlineFingerprint(imported) : '', s.clearance])
}

export function placeFor(s: Settings, region: Region, picture: DensityMap | null): { points: Float64Array; short: boolean } {
  return placeAttractors(region, s.count, s.placement === 'picture' && !picture ? 'even' : s.placement, s.seed, picture, s.clearance)
}

// How far inside the edges roots start: half a segment, so the first step can't cross an edge, and a little more
// than the edge clearance, so their first step isn't refused.
export const rootInset = (s: Pick<Settings, 'segment' | 'clearance'>): number => Math.max(0.01, s.segment * 0.5, s.clearance > 0 ? s.clearance * 1.01 : 0)

// Where roots go: the shape's own start (a leaf's base, an ellipse's centre), the bottom middle, the centre,
// a row along the bottom (parallel veins, as in grass), or spaced round the edge (veins growing inward).
export type RootPlacement = 'shape' | 'base' | 'centre' | 'row' | 'edge'

// The shape's own start points, moved inside it if needed.
export function startRoots(s: Settings, region: Region, placement: RootPlacement = 'shape'): Vec[] {
  const inset = rootInset(s)
  const [x0, y0, x1, y1] = region.box
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  let wanted: Vec[]
  switch (placement) {
    case 'base': wanted = [[cx, y1]]; break
    case 'centre': wanted = [[cx, cy]]; break
    case 'row': {
      const n = Math.max(3, Math.min(24, Math.round((x1 - x0) / Math.max(4 * s.segment, (x1 - x0) / 24))))
      // Along the bottom, each moved up until it's inside.
      wanted = Array.from({ length: n }, (_, i): Vec => [x0 + ((i + 0.5) / n) * (x1 - x0), y1])
      wanted = wanted.map(([x]) => lowestInside(region, x, inset)).filter((p): p is Vec => p !== null)
      return spaced(wanted, 2 * s.segment)
    }
    case 'edge': {
      const ring = region.rings[0] ?? []
      const per = ring.reduce((sum, p, i) => sum + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0)
      const n = Math.max(6, Math.min(48, Math.round(per / Math.max(6 * s.segment, per / 48))))
      wanted = pointsAlong(ring, n)
      break
    }
    default: wanted = s.shape === 'imported' ? [[cx, y1]] : defaultRoots(s.shape, s.width, s.height, s.margin, s.invert)
  }
  return spaced(wanted.map(([x, y]) => region.nearestInside(x, y, inset)).filter((p): p is Vec => p !== null), 2 * s.segment)
}

// The lowest point inside the shape straight above (x, bottom), or null.
function lowestInside(region: Region, x: number, inset: number): Vec | null {
  const [, y0, , y1] = region.box
  const step = Math.max(inset, (y1 - y0) / 400)
  for (let y = y1 - inset; y > y0; y -= step) if (region.contains(x, y) && region.edgeDistance(x, y, inset) >= inset) return [x, y]
  return null
}

function pointsAlong(ring: Vec[], n: number): Vec[] {
  if (ring.length < 2) return []
  const lengths = ring.map((p, i) => Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]))
  const total = lengths.reduce((a, b) => a + b, 0)
  const out: Vec[] = []
  let i = 0, walked = 0
  for (let k = 0; k < n; k++) {
    const target = ((k + 0.5) / n) * total
    while (walked + lengths[i] < target && i < ring.length - 1) { walked += lengths[i]; i++ }
    const a = ring[i], b = ring[(i + 1) % ring.length], t = lengths[i] > 0 ? (target - walked) / lengths[i] : 0
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

// Drops roots closer than `gap` to one kept before them.
function spaced(points: Vec[], gap: number): Vec[] {
  const out: Vec[] = []
  for (const p of points) if (out.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= gap)) out.push(p)
  return out
}

export function regionOf(s: Settings, imported: Imported | null): Region {
  return new Region(shapeRings(s, imported))
}

// A fresh design for these settings: the shape's roots, attractors placed, nothing grown.
export function freshDesign(s: Settings, imported: Imported | null, picture: DensityMap | null, roots?: Vec[]): Design {
  const region = regionOf(s, imported)
  const placed = placeFor(s, region, picture)
  const start = roots ?? startRoots(s, region)
  return { settings: s, imported, roots: start, attractors: placed.points, placedFor: placementKey(s, imported), growth: startGrowth(start, placed.points.length / 2, s.seed) }
}

// The design after a settings change. When the shape, the sheet or how attractors are placed changes, or a new
// outline or picture arrives (`replace`), the attractors are placed again and the veins start over from the roots;
// otherwise the veins stay and only the settings change. noPicture: Placement is Picture but no picture is
// loaded (it isn't saved in projects), so the attractors were placed evenly instead.
export type Planned = { next: Design; restarts: boolean; short: boolean; noPicture: boolean }

export function planChange(cur: Design, patch: Partial<Settings>, imported: Imported | null, picture: PictureData | null, opts: { roots?: Vec[]; replace?: boolean } = {}): Planned {
  const settings = sanitizeSettings({ ...cur.settings, ...patch })
  const key = placementKey(settings, imported)
  const newOutline = imported !== cur.imported
  const replace = Boolean(opts.replace) || newOutline || key !== cur.placedFor
  if (!replace && !opts.roots) return { next: { ...cur, settings, imported }, restarts: false, short: false, noPicture: false }
  const region = regionOf(settings, imported)
  const reshaped = (['width', 'height', 'margin', 'shape', 'invert'] as const).some(k => settings[k] !== cur.settings[k]) || newOutline
  const newShape = settings.shape !== cur.settings.shape || settings.invert !== cur.settings.invert || newOutline
  const scaled = cur.roots.map(([x, y]): Vec => [(x * settings.width) / cur.settings.width, (y * settings.height) / cur.settings.height])
  const start = opts.roots ?? (newShape ? startRoots(settings, region) : rootsFor(settings, region, reshaped ? scaled : cur.roots))
  const placed = replace ? placeFor(settings, region, picture ? fitPicture(picture, settings.width, settings.height) : null) : { points: cur.attractors, short: false }
  return {
    next: { settings, imported, roots: start, attractors: placed.points, placedFor: key, growth: startGrowth(start, placed.points.length / 2, settings.seed) },
    restarts: true, short: placed.short, noPicture: replace && settings.placement === 'picture' && !picture,
  }
}

// Settings that decide the shape or where attractors go; changing one starts the growth again.
export const PLACEMENT_KEYS: (keyof Settings)[] = ['width', 'height', 'margin', 'shape', 'invert', 'clearance', 'count', 'placement', 'seed']
// Settings the worker uses while it grows; they apply live.
export const GROWTH_KEYS: (keyof Settings)[] = ['segment', 'kill', 'attraction', 'loops', 'inertia', 'wiggle', 'pull', 'pullMode', 'apart', 'leafGrowth', 'leafSteps']

// Roots still inside a changed shape, moved in if needed; the shape's own start if none are left.
export function rootsFor(s: Settings, region: Region, roots: Vec[]): Vec[] {
  const inset = rootInset(s)
  const kept = roots.map(([x, y]) => region.nearestInside(x, y, inset)).filter((p): p is Vec => p !== null)
  return kept.length ? kept : startRoots(s, region)
}
