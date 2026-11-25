// Project files (.vessel.json): the settings, the shape, the roots, the attractors and the veins grown so far, at
// full precision, so a reopened design carries on growing exactly as if it had never stopped. Files carry a schema
// name and version; a newer app version must still open version 1 files, filling in new settings with defaults.
// Version 2 (1.5.0) adds two or three systems: a root's system as a third number, and each vein point's system and
// Join's joins between the trees in the growth. A design of one system is still written as version 1, so older
// versions of the app open it; one of two or three is version 2, which they say is from a newer version.
import type { Root } from '../veins/engine'
import type { Vec } from '../veins/geometry'
import { placementKey, rootAt, startGrowth, type Design, type Growth, type Imported, type RootPlacement } from './design'
import { sanitizeSettings } from './settings'

export const SCHEMA = 'vessel-studio'
export const VERSION = 2
export const EXTENSION = '.vessel.json'

export class ProjectError extends Error {}

type File = {
  schema: string; version: number; app?: string
  settings: unknown; imported: Imported | null; roots: number[][]; rootsBy?: RootPlacement; attractors: number[]; placedFor?: string
  growth: { step: number; rng: number; idle: number; done: Growth['done']; x: number[]; y: number[]; parent: number[]; sys?: number[]; joins: number[]; links?: number[]; used: number[] }
}

export function projectJson(d: Design, app: string): string {
  const used: number[] = []
  d.growth.used.forEach((u, i) => { if (u) used.push(i) })
  const g = d.growth
  const systems = d.settings.systems > 1 || d.roots.some(r => (r[2] ?? 0) > 0) || g.sys.some(t => t > 0) || g.links.length > 0
  const file: File = {
    schema: SCHEMA, version: systems ? 2 : 1, app,
    settings: d.settings, imported: d.imported, roots: d.roots.map(r => (r[2] ? [r[0], r[1], r[2]] : [r[0], r[1]])), rootsBy: d.rootsBy, attractors: Array.from(d.attractors), placedFor: d.placedFor,
    growth: { step: g.step, rng: g.rng, idle: g.idle, done: g.done, x: Array.from(g.x), y: Array.from(g.y), parent: Array.from(g.parent), ...(systems ? { sys: Array.from(g.sys) } : {}), joins: Array.from(g.joins), ...(systems ? { links: Array.from(g.links) } : {}), used },
  }
  return JSON.stringify(file)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nums = (v: unknown, what: string): number[] => {
  if (!Array.isArray(v) || !v.every(isNum)) throw new ProjectError(`This project file is damaged: its ${what} aren't a list of numbers.`)
  return v
}
// Coordinates are millimetres on the sheet; anything far beyond the largest sheet (3 m) is damage, and would slow
// growth to a crawl.
export const FAR = 100_000
const near = (v: number[], what: string): number[] => {
  if (v.some(x => Math.abs(x) > FAR)) throw new ProjectError(`This project file is damaged: its ${what} lie far outside any sheet.`)
  return v
}
const point = (p: unknown, what: string): Vec => {
  if (!Array.isArray(p) || p.length !== 2 || !p.every(isNum) || p.some(x => Math.abs(x) > FAR)) throw new ProjectError(`This project file is damaged: ${what} isn’t a point on the sheet.`)
  return [p[0], p[1]]
}
// A system: A, B or C, as 0, 1 or 2.
const isSystem = (t: unknown): t is number => isNum(t) && Number.isInteger(t) && t >= 0 && t <= 2
// A root: a point, and from version 2 the system it starts as a third number.
const rootOf = (r: unknown): Root => {
  if (Array.isArray(r) && r.length === 3) {
    if (!isSystem(r[2])) throw new ProjectError('This project file is damaged: a root starts a system that isn’t A, B or C.')
    return rootAt(point(r.slice(0, 2), 'a root'), r[2])
  }
  return point(r, 'a root')
}
const DONE = new Set(['reached', 'stalled', 'out-of-reach', 'cap', 'empty'])
const PLACEMENTS = new Set<string>(['shape', 'base', 'centre', 'row', 'edge', 'ends'])

// Reads a project file. Anything unreadable throws a ProjectError with a plain message, and the current
// design is kept by the caller.
export function parseProject(text: string): Design {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new ProjectError('This file isn’t a Vessel Studio project: it isn’t JSON.') }
  const f = raw as Partial<File> | null
  if (!f || typeof f !== 'object' || f.schema !== SCHEMA) throw new ProjectError('This file isn’t a Vessel Studio project.')
  if (!isNum(f.version) || f.version < 1) throw new ProjectError('This project file has no version, so it can’t be read.')
  if (f.version > VERSION) throw new ProjectError(`This project was saved by a newer Vessel Studio (file version ${f.version}). Reload the page to get the newest version, then open it again.`)
  const v2 = f.version >= 2
  const settings = sanitizeSettings(f.settings)
  const attractors = Float64Array.from(near(nums(f.attractors, 'attractors'), 'attractors'))
  if (attractors.length % 2) throw new ProjectError('This project file is damaged: an attractor is missing a coordinate.')
  const k = attractors.length / 2
  if (!Array.isArray(f.roots)) throw new ProjectError('This project file is damaged: its roots are missing.')
  const roots: Root[] = f.roots.map(r => (v2 ? rootOf(r) : point(r, 'a root')))
  let imported: Imported | null = null
  if (f.imported) {
    const im = f.imported
    if (!Array.isArray(im.rings) || !isNum(im.width) || !isNum(im.height)) throw new ProjectError('This project file is damaged: its imported shape can’t be read.')
    if (!(im.width > 0 && im.height > 0)) throw new ProjectError('This project file is damaged: its imported shape has no size.')
    const rings = im.rings.map(ring => { if (!Array.isArray(ring)) throw new ProjectError('This project file is damaged: an outline isn’t a list of points.'); return ring.map(p => point(p, 'a point of the imported shape')) })
      .filter(ring => ring.length >= 3)
    if (!rings.length) throw new ProjectError('This project file is damaged: its imported shape has no outline.')
    imported = { name: String(im.name ?? 'shape.svg'), sized: im.sized === 'css' || im.sized === 'illustrator' || im.sized === 'points' ? im.sized : 'file', width: im.width, height: im.height, rings }
  }
  if (settings.shape === 'imported' && !imported) throw new ProjectError('This project uses an imported shape, but the shape isn’t in the file.')
  const g = f.growth
  let growth: Growth
  if (!g) growth = startGrowth(roots, k, settings.seed, settings.systems)
  else {
    const x = near(nums(g.x, 'vein points'), 'vein points'), y = near(nums(g.y, 'vein points'), 'vein points'), parent = nums(g.parent, 'vein points'), joins = nums(g.joins, 'loop joins'), used = nums(g.used, 'used attractors')
    const n = x.length
    if (y.length !== n || parent.length !== n) throw new ProjectError('This project file is damaged: its vein points don’t line up.')
    for (let i = 0; i < n; i++) if (!Number.isInteger(parent[i]) || parent[i] < -1 || parent[i] >= i) throw new ProjectError('This project file is damaged: a vein point grows from one that comes after it.')
    if (joins.length % 2 || joins.some(j => !Number.isInteger(j) || j < 0 || j >= n)) throw new ProjectError('This project file is damaged: a loop joins a vein point that isn’t there.')
    // Version 2: each point's system, and the joins between Join's trees.
    const sys = v2 && g.sys !== undefined ? nums(g.sys, 'vein systems') : new Array<number>(n).fill(0)
    if (sys.length !== n || !sys.every(isSystem)) throw new ProjectError('This project file is damaged: its vein points’ systems don’t line up.')
    const links = v2 && g.links !== undefined ? nums(g.links, 'joins between trees') : []
    if (links.length % 2 || links.some(j => !Number.isInteger(j) || j < 0 || j >= n)) throw new ProjectError('This project file is damaged: a join between trees joins a vein point that isn’t there.')
    const usedFlags = new Uint8Array(k)
    for (const i of used) { if (!Number.isInteger(i) || i < 0 || i >= k) throw new ProjectError('This project file is damaged: it uses an attractor that isn’t there.'); usedFlags[i] = 1 }
    if (!isNum(g.step) || !isNum(g.rng)) throw new ProjectError('This project file is damaged: its growth step is missing.')
    growth = { step: Math.max(0, Math.round(g.step)), rng: g.rng >>> 0, idle: isNum(g.idle) ? Math.max(0, Math.round(g.idle)) : 0, done: typeof g.done === 'string' && DONE.has(g.done) ? g.done : null,
      x: Float64Array.from(x), y: Float64Array.from(y), parent: Int32Array.from(parent), sys: Int32Array.from(sys), joins: Int32Array.from(joins), links: Int32Array.from(links), used: usedFlags }
  }
  // The saved attractors belong to the saved settings, so ordinary edits after opening keep them and the veins.
  // How the roots were placed; files from before 1.4.0 don't say, so their roots are treated as placed by hand.
  const rootsBy = typeof f.rootsBy === 'string' && PLACEMENTS.has(f.rootsBy) ? f.rootsBy : undefined
  return { settings, imported, roots, rootsBy, attractors, placedFor: placementKey(settings, imported), growth }
}
