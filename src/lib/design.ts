// A design: the settings, the shape (a preset or an imported outline), the roots and the attractors, plus the
// growth so far. Everything here is plain data, so it can go into a project file, the worker and undo.
import { placeAttractors, type DensityMap } from '../veins/attractors'
import { boxOf, clipRingToBox, hasArea, signedArea, type Box } from '../veins/geometry'
import type { EngineState } from '../veins/engine'
import type { Ring, Vec } from '../veins/geometry'
import { Rng } from '../veins/random'
import { partAt, partTest, Region } from '../veins/region'
import { ringDepths } from '../veins/strokes'
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
  // How the roots were placed, so they follow a changed sheet, margin or clearance as placed afresh; missing for
  // roots placed by hand, which are moved in only as far as needed.
  rootsBy?: RootPlacement
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
// page. It's never stretched: when the sheet's proportions differ from the page's, as when a typed width meets
// the smallest sheet, it's scaled to fit and centred.
export function shapeRings(s: Settings, imported: Imported | null): Ring[] {
  let rings: Ring[]
  if (s.shape === 'imported') {
    const { k, dx, dy } = importedFit(s, imported)
    // Only what's on the sheet: a drawing that runs past its page, as with a bleed, is trimmed to the sheet.
    const sheet: Box = [0, 0, s.width, s.height]
    rings = (imported?.rings ?? []).map(ring => clipRingToBox(k === 1 && dx === 0 && dy === 0 ? ring : ring.map(([x, y]): Vec => [x * k + dx, y * k + dy]), sheet))
      .filter(hasArea)
  } else rings = presetRings(s.shape, s.width, s.height, s.margin)
  return s.invert ? invertRings(rings, s.width, s.height) : rings
}

// How an imported page sits on the sheet: one scale and an offset that centres it.
export function importedFit(s: Pick<Settings, 'width' | 'height'>, imported: Imported | null): { k: number; dx: number; dy: number } {
  if (!imported) return { k: 1, dx: 0, dy: 0 }
  const k = Math.min(s.width / imported.width, s.height / imported.height)
  return { k, dx: (s.width - imported.width * k) / 2, dy: (s.height - imported.height * k) / 2 }
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
  // An imported drawing or the space round a shape can come in separate parts, such as the letters of a word or
  // the hole of a ring grown outside. No vein can cross between them, so each part gets its own root: at its
  // base, or its centre, as asked.
  if ((s.shape === 'imported' || s.invert) && (placement === 'shape' || placement === 'base' || placement === 'centre')) {
    const first = placement === 'shape' && s.invert ? defaultRoots(s.shape, s.width, s.height, s.margin, true)[0] : null
    // One root a part, so no two can be too close: they're in parts no vein crosses between.
    const roots = partRoots(region, inset, placement === 'centre' ? 'centre' : 'base', first)
    return [...roots, ...areaRoots(region, inset, roots)]
  }
  switch (placement) {
    case 'base': wanted = [[cx, y1]]; break
    case 'centre': wanted = [[cx, cy]]; break
    case 'row': {
      const parts = region.parts()
      if ((s.shape === 'imported' || s.invert) && parts.length > 1) return spaced(partRows(region, parts.slice(0, MAX_PART_ROOTS), inset, s.segment), 2 * s.segment)
      const n = Math.max(3, Math.min(24, Math.round((x1 - x0) / Math.max(4 * s.segment, (x1 - x0) / 24))))
      // Along the bottom, each moved up until it's inside.
      wanted = Array.from({ length: n }, (_, i): Vec => [x0 + ((i + 0.5) / n) * (x1 - x0), y1])
      wanted = wanted.map(([x]) => lowestInside(region, x, inset)).filter((p): p is Vec => p !== null)
      return spaced(wanted, 2 * s.segment)
    }
    case 'edge': {
      // Round the outline of every part, shared out by length: each letter of a word gets its share, and each stays
      // in its own part as it's moved in. A drawing of very many parts roots its largest.
      const outlines = region.parts().slice(0, MAX_PART_ROOTS)
      const lengths = outlines.map(ring => ring.reduce((sum, p, i) => sum + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0))
      const per = lengths.reduce((a, b) => a + b, 0)
      const n = Math.max(6, Math.min(48, Math.round(per / Math.max(6 * s.segment, per / 48))))
      if (outlines.length > 1) {
        const parts = region.parts()
        return spaced(outlines.flatMap((ring, i) => {
          const within = partTest(parts, parts.indexOf(ring)), reach = boxSize(ring)
          return pointsAlong(ring, Math.max(1, Math.round((n * lengths[i]) / per))).map(([x, y]) => region.nearestInside(x, y, inset, within, reach))
        }).filter((p): p is Vec => p !== null), 2 * s.segment)
      }
      wanted = outlines.flatMap((ring, i) => pointsAlong(ring, Math.max(1, Math.round((n * lengths[i]) / per))))
      break
    }
    default:
      wanted = defaultRoots(s.shape, s.width, s.height, s.margin, s.invert)
  }
  return spaced(wanted.map(([x, y]) => region.nearestInside(x, y, inset)).filter((p): p is Vec => p !== null), 2 * s.segment)
}

// Areas no vein can cross between can lie within one outline: the corners left when a shape nearly fills its page
// and is grown outside it. They're found on a grid of points clear of the edges, linked where nothing is in the
// way, and each area big enough to grow in that has no root gets one, at its lowest point nearest its middle.
function areaRoots(region: Region, inset: number, roots: Vec[]): Vec[] {
  const [x0, y0, x1, y1] = region.box
  const c = Math.max(x1 - x0, y1 - y0) / 160
  if (!(c > 0)) return []
  const nx = Math.max(1, Math.ceil((x1 - x0) / c)), ny = Math.max(1, Math.ceil((y1 - y0) / c))
  const at = (i: number, j: number): Vec => [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c]
  const open = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const [x, y] = at(i, j)
    if (region.contains(x, y) && !region.nearEdge(x, y, inset)) open[j * nx + i] = 1
  }
  const label = new Int32Array(nx * ny).fill(-1)
  const areas: number[][] = []
  for (let start = 0; start < nx * ny; start++) {
    if (!open[start] || label[start] >= 0) continue
    const cells = [start]
    label[start] = areas.length
    for (let q = 0; q < cells.length; q++) {
      const cell = cells[q], i = cell % nx, j = (cell - i) / nx, [x, y] = at(i, j)
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i2 = i + di, j2 = j + dj, next = j2 * nx + i2
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny || !open[next] || label[next] >= 0) continue
        const [x2, y2] = at(i2, j2)
        if (region.crosses(x, y, x2, y2)) continue
        label[next] = areas.length
        cells.push(next)
      }
    }
    areas.push(cells)
  }
  // Which areas a root is already in: its own cell, or one next to it, as a root can sit nearer an edge than a cell's middle.
  const held = new Set<number>()
  for (const [x, y] of roots) {
    const i = Math.floor((x - x0) / c), j = Math.floor((y - y0) / c)
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i2 = i + di, j2 = j + dj
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny) continue
      const k = label[j2 * nx + i2]
      if (k >= 0 && !region.crosses(x, y, ...at(i2, j2))) held.add(k)
    }
  }
  const out: Vec[] = []
  const order = areas.map((cells, k) => k).sort((a, b) => areas[b].length - areas[a].length)
  for (const k of order) {
    if (held.has(k) || areas[k].length < 4 || roots.length + out.length >= MAX_PART_ROOTS) continue
    const cells = areas[k]
    const rows = cells.map(cell => Math.floor(cell / nx))
    const bottom = Math.max(...rows)
    const xs = cells.map(cell => cell % nx), mid = (Math.min(...xs) + Math.max(...xs)) / 2
    const pick = cells.filter((cell, n) => rows[n] === bottom).sort((a, b) => Math.abs((a % nx) - mid) - Math.abs((b % nx) - mid))[0]
    out.push(at(pick % nx, bottom))
  }
  return out
}

// The most parts that get a root each; a drawing with more, such as a page of small text, roots its largest.
export const MAX_PART_ROOTS = 500

// A root for each part of the shape, at the bottom middle or the centre of the part's outline, moved inside that
// part; the first part's is at `start` instead when given. Largest parts first.
function partRoots(region: Region, inset: number, where: 'base' | 'centre', start: Vec | null): Vec[] {
  const out: Vec[] = []
  const parts = region.parts()
  for (const [k, ring] of parts.slice(0, MAX_PART_ROOTS).entries()) {
    const [x0, y0, x1, y1] = boxOf([ring])
    const inPart = partTest(parts, k)
    const aim: Vec = k === 0 && start ? start : [(x0 + x1) / 2, where === 'centre' ? (y0 + y1) / 2 : y1]
    // The nearest point to aim at in this part, not in one beside it.
    const near = region.nearestInside(aim[0], aim[1], inset, inPart, boxSize(ring) + Math.hypot(aim[0] - (x0 + x1) / 2, aim[1] - (y0 + y1) / 2))
    if (near) { out.push(near); continue }
    // Nothing near the base inside this part: look up through the part, nearest the middle first.
    const cx = (x0 + x1) / 2
    const xs = Array.from({ length: 33 }, (_, i) => x0 + (i / 32) * (x1 - x0)).sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx))
    search: for (let r = 0; r < 33; r++) {
      const y = y1 - (r / 32) * (y1 - y0)
      for (const x of xs) if (inPart(x, y) && region.contains(x, y) && !region.nearEdge(x, y, inset)) { out.push([x, y]); break search }
    }
  }
  return out
}

// A row of roots along the bottom of each part, shared out by width, for parallel veins in every letter of a word.
function partRows(region: Region, parts: Ring[], inset: number, segment: number): Vec[] {
  const all = region.parts()
  const boxes = parts.map(r => boxOf([r]))
  const widths = boxes.map(b => b[2] - b[0]), total = widths.reduce((a, b) => a + b, 0)
  const [x0, , x1] = region.box
  const n = Math.max(3, Math.min(24, Math.round((x1 - x0) / Math.max(4 * segment, (x1 - x0) / 24))))
  return parts.flatMap((ring, k) => {
    const [bx0, , bx1] = boxes[k], within = partTest(all, all.indexOf(ring))
    const m = Math.max(1, Math.round((n * widths[k]) / Math.max(1e-9, total)))
    const row = Array.from({ length: m }, (_, i) => lowestInside(region, bx0 + ((i + 0.5) / m) * (bx1 - bx0), inset, within, boxes[k]))
      .filter((p): p is Vec => p !== null)
    if (row.length) return row
    // Too thin where the row crosses it: one root, as near the middle of its base as fits.
    const one = region.nearestInside((bx0 + bx1) / 2, boxes[k][3], inset, within, boxSize(ring))
    return one ? [one] : []
  })
}

// The separate parts of a shape, as their outlines, largest first: rings that aren't holes. The same as a Region's
// parts(), without building one.
export function partsOf(rings: Ring[]): Ring[] {
  const depths = ringDepths(rings)
  return rings.filter((_, i) => depths[i] % 2 === 0).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
}

// How many of the shape's parts (the largest that get roots) have no root in them, so can't grow.
export function unrootedParts(parts: Ring[], roots: Vec[]): number {
  if (parts.length < 2) return 0
  const held = new Set(roots.map(([x, y]) => partAt(parts, x, y)))
  return parts.slice(0, MAX_PART_ROOTS).filter((_, i) => !held.has(i)).length
}

const boxSize = (ring: Ring) => { const [x0, y0, x1, y1] = boxOf([ring]); return Math.hypot(x1 - x0, y1 - y0) }

// The lowest point inside the shape straight above (x, bottom), or null; within a part when asked, from the
// bottom of its box.
function lowestInside(region: Region, x: number, inset: number, within?: (x: number, y: number) => boolean, box?: Box): Vec | null {
  const [, y0, , y1] = box ?? region.box
  const step = Math.max(inset, (y1 - y0) / 400)
  for (let y = y1 - inset; y > y0; y -= step) if (region.contains(x, y) && region.edgeDistance(x, y, inset) >= inset && (!within || within(x, y))) return [x, y]
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
  return { settings: s, imported, roots: start, rootsBy: roots ? undefined : 'shape', attractors: placed.points, placedFor: placementKey(s, imported), growth: startGrowth(start, placed.points.length / 2, s.seed) }
}

// The design after a settings change. When the shape, the sheet or how attractors are placed changes, or a new
// outline or picture arrives (`replace`), the attractors are placed again and the veins start over from the roots;
// otherwise the veins stay and only the settings change. noPicture: Placement is Picture but no picture is
// loaded (it isn't saved in projects), so the attractors were placed evenly instead.
export type Planned = { next: Design; restarts: boolean; short: boolean; noPicture: boolean }

// Whether a change would place the attractors again and start the veins over: planChange's `restarts`, without
// placing anything, so the page can ask first and place once.
export type ChangeOptions = { roots?: Vec[]; rootsBy?: RootPlacement; replace?: boolean }

export function changeRestarts(cur: Design, patch: Partial<Settings>, imported: Imported | null, opts: ChangeOptions = {}): boolean {
  const settings = sanitizeSettings({ ...cur.settings, ...patch })
  return Boolean(opts.replace) || imported !== cur.imported || placementKey(settings, imported) !== cur.placedFor || Boolean(opts.roots)
}

export function planChange(cur: Design, patch: Partial<Settings>, imported: Imported | null, picture: PictureData | null, opts: ChangeOptions = {}): Planned {
  const settings = sanitizeSettings({ ...cur.settings, ...patch })
  const key = placementKey(settings, imported)
  const newOutline = imported !== cur.imported
  const replace = Boolean(opts.replace) || newOutline || key !== cur.placedFor
  if (!changeRestarts(cur, patch, imported, opts)) return { next: { ...cur, settings, imported }, restarts: false, short: false, noPicture: false }
  const region = regionOf(settings, imported)
  const reshaped = (['width', 'height', 'margin', 'shape', 'invert'] as const).some(k => settings[k] !== cur.settings[k]) || newOutline
  const newShape = settings.shape !== cur.settings.shape || settings.invert !== cur.settings.invert || newOutline
  const was = importedFit(cur.settings, imported), now = importedFit(settings, imported)
  const scaled = cur.roots.map(([x, y]): Vec => settings.shape === 'imported' && cur.settings.shape === 'imported' && !newOutline
    ? [((x - was.dx) / was.k) * now.k + now.dx, ((y - was.dy) / was.k) * now.k + now.dy]
    : [(x * settings.width) / cur.settings.width, (y * settings.height) / cur.settings.height])
  // Roots placed by a rule are placed again by it for the changed shape, so a margin taken up and back puts them
  // back where they were; roots placed by hand are moved in only as far as needed, each within its own part.
  const by = opts.roots ? opts.rootsBy : cur.rootsBy ?? (newShape ? 'shape' : undefined)
  const moved = newShape || reshaped || settings.clearance !== cur.settings.clearance
  const start = opts.roots ?? (by ? (moved ? startRoots(settings, region, by) : cur.roots) : rootsFor(settings, region, reshaped ? scaled : cur.roots))
  const placed = replace ? placeFor(settings, region, picture ? fitPicture(picture, settings.width, settings.height) : null) : { points: cur.attractors, short: false }
  return {
    next: { settings, imported, roots: start, rootsBy: by, attractors: placed.points, placedFor: key, growth: startGrowth(start, placed.points.length / 2, settings.seed) },
    restarts: true, short: placed.short, noPicture: replace && settings.placement === 'picture' && !picture,
  }
}

// Settings the worker uses while it grows; they apply live.
export const GROWTH_KEYS: (keyof Settings)[] = ['segment', 'kill', 'attraction', 'loops', 'inertia', 'wiggle', 'pull', 'pullMode', 'apart', 'leafGrowth', 'leafSteps']

// Roots still inside a changed shape, moved in if needed; the shape's own start if none are left. Each stays in
// the part it was in, so a root moved in from a thin letter doesn't jump to another letter.
export function rootsFor(s: Settings, region: Region, roots: Vec[]): Vec[] {
  const inset = rootInset(s)
  const parts = region.parts()
  const kept = roots.map(([x, y]) => {
    const k = parts.length > 1 ? partAt(parts, x, y) : -1
    return k < 0 ? region.nearestInside(x, y, inset) : region.nearestInside(x, y, inset, partTest(parts, k), boxSize(parts[k]))
  }).filter((p): p is Vec => p !== null)
  return kept.length ? kept : startRoots(s, region)
}

// A project saved before 1.3.0 can hold attractors and roots off the sheet, as an imported shape wasn't trimmed to
// the sheet then. Before growth they're placed again, on the sheet; once veins have grown, the attractors off it
// count as used, since no vein can reach them. off: how many attractors were off the sheet.
export function fitToSheet(d: Design): { design: Design; off: number } {
  if (d.settings.shape !== 'imported') return { design: d, off: 0 }
  const region = regionOf(d.settings, d.imported)
  const a = d.attractors
  let off = 0
  for (let i = 0; i < a.length; i += 2) if (!region.contains(a[i], a[i + 1])) off++
  if (!off && d.roots.every(([x, y]) => region.contains(x, y))) return { design: d, off: 0 }
  if (!hasGrown(d)) {
    const placed = placeFor(d.settings, region, null)
    const roots = d.rootsBy ? startRoots(d.settings, region, d.rootsBy) : rootsFor(d.settings, region, d.roots)
    return { design: { ...d, roots, attractors: placed.points, growth: startGrowth(roots, placed.points.length / 2, d.settings.seed) }, off }
  }
  const used = d.growth.used.slice()
  for (let i = 0; i < a.length; i += 2) if (!region.contains(a[i], a[i + 1])) used[i / 2] = 1
  return { design: { ...d, growth: { ...d.growth, used } }, off }
}
