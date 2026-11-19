// Project files (.vessel.json): the settings, the shape, the roots, the attractors and the veins grown so far, at
// full precision, so a reopened design carries on growing exactly as if it had never stopped. Files carry a schema
// name and version; a newer app version must still open version 1 files, filling in new settings with defaults.
import type { Vec } from '../veins/geometry'
import { placementKey, startGrowth, type Design, type Growth, type Imported } from './design'
import { sanitizeSettings } from './settings'

export const SCHEMA = 'vessel-studio'
export const VERSION = 1
export const EXTENSION = '.vessel.json'

export class ProjectError extends Error {}

type File = {
  schema: string; version: number; app?: string
  settings: unknown; imported: Imported | null; roots: number[][]; attractors: number[]; placedFor?: string
  growth: { step: number; rng: number; idle: number; done: Growth['done']; x: number[]; y: number[]; parent: number[]; joins: number[]; used: number[] }
}

export function projectJson(d: Design, app: string): string {
  const used: number[] = []
  d.growth.used.forEach((u, i) => { if (u) used.push(i) })
  const file: File = {
    schema: SCHEMA, version: VERSION, app,
    settings: d.settings, imported: d.imported, roots: d.roots, attractors: Array.from(d.attractors), placedFor: d.placedFor,
    growth: { step: d.growth.step, rng: d.growth.rng, idle: d.growth.idle, done: d.growth.done, x: Array.from(d.growth.x), y: Array.from(d.growth.y), parent: Array.from(d.growth.parent), joins: Array.from(d.growth.joins), used },
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
const DONE = new Set(['reached', 'stalled', 'out-of-reach', 'cap', 'empty'])

// Reads a project file. Anything unreadable throws a ProjectError with a plain message, and the current
// design is kept by the caller.
export function parseProject(text: string): Design {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new ProjectError('This file isn’t a Vessel Studio project: it isn’t JSON.') }
  const f = raw as Partial<File> | null
  if (!f || typeof f !== 'object' || f.schema !== SCHEMA) throw new ProjectError('This file isn’t a Vessel Studio project.')
  if (!isNum(f.version) || f.version < 1) throw new ProjectError('This project file has no version, so it can’t be read.')
  if (f.version > VERSION) throw new ProjectError(`This project was saved by a newer Vessel Studio (file version ${f.version}). Reload the page to get the newest version, then open it again.`)
  const settings = sanitizeSettings(f.settings)
  const attractors = Float64Array.from(near(nums(f.attractors, 'attractors'), 'attractors'))
  if (attractors.length % 2) throw new ProjectError('This project file is damaged: an attractor is missing a coordinate.')
  const k = attractors.length / 2
  if (!Array.isArray(f.roots)) throw new ProjectError('This project file is damaged: its roots are missing.')
  const roots: Vec[] = f.roots.map(r => point(r, 'a root'))
  let imported: Imported | null = null
  if (f.imported) {
    const im = f.imported
    if (!Array.isArray(im.rings) || !isNum(im.width) || !isNum(im.height)) throw new ProjectError('This project file is damaged: its imported shape can’t be read.')
    if (!(im.width > 0 && im.height > 0)) throw new ProjectError('This project file is damaged: its imported shape has no size.')
    const rings = im.rings.map(ring => { if (!Array.isArray(ring)) throw new ProjectError('This project file is damaged: an outline isn’t a list of points.'); return ring.map(p => point(p, 'a point of the imported shape')) })
      .filter(ring => ring.length >= 3)
    if (!rings.length) throw new ProjectError('This project file is damaged: its imported shape has no outline.')
    imported = { name: String(im.name ?? 'shape.svg'), sized: im.sized === 'css' || im.sized === 'illustrator' ? im.sized : 'file', width: im.width, height: im.height, rings }
  }
  if (settings.shape === 'imported' && !imported) throw new ProjectError('This project uses an imported shape, but the shape isn’t in the file.')
  const g = f.growth
  let growth: Growth
  if (!g) growth = startGrowth(roots, k, settings.seed)
  else {
    const x = near(nums(g.x, 'vein points'), 'vein points'), y = near(nums(g.y, 'vein points'), 'vein points'), parent = nums(g.parent, 'vein points'), joins = nums(g.joins, 'loop joins'), used = nums(g.used, 'used attractors')
    const n = x.length
    if (y.length !== n || parent.length !== n) throw new ProjectError('This project file is damaged: its vein points don’t line up.')
    for (let i = 0; i < n; i++) if (!Number.isInteger(parent[i]) || parent[i] < -1 || parent[i] >= i) throw new ProjectError('This project file is damaged: a vein point grows from one that comes after it.')
    if (joins.length % 2 || joins.some(j => !Number.isInteger(j) || j < 0 || j >= n)) throw new ProjectError('This project file is damaged: a loop joins a vein point that isn’t there.')
    const usedFlags = new Uint8Array(k)
    for (const i of used) { if (!Number.isInteger(i) || i < 0 || i >= k) throw new ProjectError('This project file is damaged: it uses an attractor that isn’t there.'); usedFlags[i] = 1 }
    if (!isNum(g.step) || !isNum(g.rng)) throw new ProjectError('This project file is damaged: its growth step is missing.')
    growth = { step: Math.max(0, Math.round(g.step)), rng: g.rng >>> 0, idle: isNum(g.idle) ? Math.max(0, Math.round(g.idle)) : 0, done: typeof g.done === 'string' && DONE.has(g.done) ? g.done : null,
      x: Float64Array.from(x), y: Float64Array.from(y), parent: Int32Array.from(parent), joins: Int32Array.from(joins), used: usedFlags }
  }
  // The saved attractors belong to the saved settings, so ordinary edits after opening keep them and the veins.
  return { settings, imported, roots, attractors, placedFor: placementKey(settings, imported), growth }
}
