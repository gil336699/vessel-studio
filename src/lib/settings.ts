// Every setting of a design, its default and the range it may take. Lengths are millimetres.
import type { Placement } from '../veins/attractors'
import type { Coupling, GrowthParams, PullMode } from '../veins/engine'
import type { WidthRule, WidthSettings } from '../veins/network'
import type { ShapeKind } from '../veins/shapes'
import type { Units } from './units'

export type Settings = {
  // Sheet and shape
  units: Units; width: number; height: number; dpi: number; margin: number
  shape: ShapeKind; invert: boolean
  // How far veins stay inside the shape's edges and holes; 0 lets them reach the outline, as in 1.0.
  clearance: number
  // Attractors
  count: number; placement: Placement; seed: number
  // Systems growing together: 1, 2 or 3, and how two couple. Interwoven systems keep `gap` apart and steer away from
  // each other by `repel`; Join's trees pull each other's tips by `tipPull`, and `trim` leaves out their dead ends.
  systems: number; coupling: Coupling; gap: number; repel: number; tipPull: number; trim: boolean
  // Growth. attraction 0 means no limit, as in Runions' leaves.
  segment: number; kill: number; attraction: number; loops: boolean
  inertia: number; wiggle: number; pull: number; pullMode: PullMode
  apart: boolean; leafGrowth: boolean; leafSteps: number; speed: number
  // Style
  widthRule: WidthRule; tipWidth: number; maxWidth: number; exponent: number
  // veinColor is system A's; B, C and the joins between Join's trees have their own.
  veinColor: string; veinColorB: string; veinColorC: string; linkColor: string; background: string; smooth: boolean; transparentPng: boolean
  // What the view shows, which is also what every export holds
  showVeins: boolean; showAttractors: boolean; showBoundary: boolean; showRoots: boolean
}

export const DEFAULTS: Settings = {
  units: 'mm', width: 210, height: 297, dpi: 300, margin: 12,
  shape: 'leaf', invert: false, clearance: 0,
  count: 4000, placement: 'even', seed: 1,
  systems: 1, coupling: 'join', gap: 0.6, repel: 0.3, tipPull: 0.6, trim: true,
  segment: 1, kill: 2, attraction: 0, loops: false,
  inertia: 0.25, wiggle: 0.1, pull: 0, pullMode: 'up',
  apart: true, leafGrowth: true, leafSteps: 260, speed: 3,
  widthRule: 'murray', tipWidth: 0.25, maxWidth: 3, exponent: 2.5,
  veinColor: '#2f4a1f', veinColorB: '#6b55b8', veinColorC: '#2e86c1', linkColor: '#d4a017', background: '#ffffff', smooth: true, transparentPng: false,
  showVeins: true, showAttractors: false, showBoundary: true, showRoots: true,
}

export const LIMITS = {
  width: [10, 3000], height: [10, 3000], dpi: [30, 1200],
  count: [100, 20000], seed: [1, 999_999],
  systems: [1, 3], gap: [0, 50], repel: [0, 1], tipPull: [0, 1],
  segment: [0.05, 50], kill: [0.05, 200], attraction: [0, 2000],
  inertia: [0, 0.95], wiggle: [0, 1.5], pull: [0, 1],
  leafSteps: [20, 5000], speed: [1, 40],
  tipWidth: [0.01, 20], maxWidth: [0.01, 60], exponent: [1.5, 4],
} as const

const CHOICES = {
  units: ['mm', 'in', 'pt', 'px'],
  shape: ['leaf', 'ellipse', 'rect', 'ring', 'tree', 'imported'],
  placement: ['even', 'random', 'grid', 'edge', 'picture'],
  coupling: ['interweave', 'join'],
  pullMode: ['up', 'down', 'left', 'right', 'out'],
  widthRule: ['murray', 'even'],
} as const

export const marginMax = (s: Pick<Settings, 'width' | 'height'>) => Math.min(s.width, s.height) / 4
export const clearanceMax = (s: Pick<Settings, 'width' | 'height'>) => Math.min(s.width, s.height) / 8

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v))

// Settings from a file or the last session: unknown keys are dropped, missing ones take their default and
// out-of-range numbers are brought into range.
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s: Settings = { ...DEFAULTS }
  const out = s as Record<string, unknown>
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = r[key], base = DEFAULTS[key]
    if (typeof base === 'number' && typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof base === 'boolean' && typeof value === 'boolean') out[key] = value
    else if (typeof base === 'string' && typeof value === 'string') out[key] = value
  }
  for (const [key, list] of Object.entries(CHOICES)) if (!(list as readonly string[]).includes(out[key] as string)) out[key] = DEFAULTS[key as keyof typeof CHOICES]
  for (const [key, range] of Object.entries(LIMITS)) out[key] = clamp(out[key] as number, range)
  s.count = Math.round(s.count); s.seed = Math.round(s.seed); s.leafSteps = Math.round(s.leafSteps); s.speed = Math.round(s.speed); s.systems = Math.round(s.systems)
  s.margin = clamp(s.margin, [0, marginMax(s)])
  s.clearance = clamp(s.clearance, [0, clearanceMax(s)])
  for (const key of ['veinColor', 'veinColorB', 'veinColorC', 'linkColor', 'background'] as const) if (!/^#[0-9a-f]{6}$/i.test(s[key])) s[key] = DEFAULTS[key]
  return s
}

// Join: two trees, an inlet and an outlet, that share the attractors and join where they meet. Three systems always
// interweave.
export const joining = (s: Pick<Settings, 'systems' | 'coupling'>) => s.systems === 2 && s.coupling === 'join'
export const interweaving = (s: Pick<Settings, 'systems' | 'coupling'>) => s.systems > 1 && !joining(s)

// The systems' names, for roots, colours and the layers of exports.
export const SYSTEM_NAMES = ['A', 'B', 'C']
export const systemColor = (s: Pick<Settings, 'veinColor' | 'veinColorB' | 'veinColorC'>, t: number) => [s.veinColor, s.veinColorB, s.veinColorC][t] ?? s.veinColor

// The engine's settings. Keep veins apart refuses new points closer than 0.45 of a segment to another vein. Join
// closes the network itself, where its trees meet, so it grows no loops.
export function growthParams(s: Settings): GrowthParams {
  const p: GrowthParams = {
    segment: s.segment, kill: s.kill, attraction: s.attraction, topology: s.loops && !joining(s) ? 'closed' : 'open',
    inertia: s.inertia, wiggle: s.wiggle, pull: s.pull, pullMode: s.pullMode,
    crowd: s.apart ? 0.45 : 0, clearance: s.clearance, leafSteps: s.leafGrowth ? s.leafSteps : 0,
    minLoop: 8, maxPoints: 400_000, seed: s.seed,
  }
  // Systems, and the widths they keep apart by.
  if (s.systems > 1) Object.assign(p, { systems: s.systems, coupling: s.coupling, gap: s.gap, repel: s.repel, tipPull: s.tipPull, widths: widthSettings(s) })
  return p
}

export const widthSettings = (s: Settings): WidthSettings => ({ rule: s.widthRule, tip: s.tipWidth, max: s.maxWidth, exponent: s.exponent })

// Presets set the growth and the look together. Lengths scale with the sheet, from a 200 mm reference, so a
// preset looks the same on a business card or a poster.
export type PresetName = 'leaf' | 'loops' | 'tree' | 'arterial' | 'neural' | 'capillary' | 'join' | 'interweave'
type PresetValues = Partial<Settings>
// roots: where a preset's roots go (see design.startRoots). Every preset sets how many systems grow.
export const PRESETS: { id: PresetName; label: string; tip: string; values: PresetValues; roots: 'shape' | 'base' | 'centre' | 'ends' | 'edge' }[] = [
  { id: 'leaf', label: 'Leaf', tip: 'Open veins in a leaf, growing outward from its base, main veins first.', roots: 'shape',
    values: { systems: 1, shape: 'leaf', loops: false, leafGrowth: true, count: 4000, placement: 'even', inertia: 0.25, wiggle: 0.1, pull: 0, attraction: 0, widthRule: 'murray', exponent: 2.5, veinColor: '#2f4a1f' } },
  { id: 'loops', label: 'Leaf with loops', tip: 'Closed veins: veins from several sides meet and join, like a real leaf’s fine net.', roots: 'shape',
    values: { systems: 1, shape: 'leaf', loops: true, leafGrowth: true, count: 4500, placement: 'even', inertia: 0.1, wiggle: 0.05, pull: 0, attraction: 0, widthRule: 'murray', exponent: 2, veinColor: '#4a3b1f' } },
  { id: 'tree', label: 'Tree', tip: 'A trunk that climbs to its crown and branches there, pulled upward, with more twigs near the crown’s edge.', roots: 'shape',
    values: { systems: 1, shape: 'tree', loops: false, leafGrowth: false, count: 2500, placement: 'edge', inertia: 0.3, wiggle: 0.15, pull: 0.35, pullMode: 'up', attraction: 0, widthRule: 'murray', exponent: 2.2, veinColor: '#3b2f25' } },
  // Gil's BioVessel Pro presets: inertia, wiggle and thickness kept, density turned into a count.
  { id: 'arterial', label: 'Arterial', tip: 'Smooth, steady vessels that keep their heading, like arteries.', roots: 'centre',
    values: { systems: 1, shape: 'ellipse', loops: false, leafGrowth: false, count: 3500, placement: 'even', inertia: 0.8, wiggle: 0.1, pull: 0, attraction: 0, widthRule: 'murray', exponent: 3, veinColor: '#b3261e' } },
  { id: 'neural', label: 'Neural', tip: 'Fine, wandering branches that change direction often, like nerves.', roots: 'centre',
    values: { systems: 1, shape: 'ellipse', loops: false, leafGrowth: false, count: 6000, placement: 'random', inertia: 0.2, wiggle: 0.8, pull: 0, attraction: 0, widthRule: 'murray', exponent: 3, veinColor: '#5b3fa8' } },
  { id: 'capillary', label: 'Capillary', tip: 'A dense, even bed of small vessels that join into loops.', roots: 'centre',
    values: { systems: 1, shape: 'ellipse', loops: true, leafGrowth: false, count: 5000, placement: 'even', inertia: 0.4, wiggle: 0.3, pull: 0, attraction: 0, widthRule: 'murray', exponent: 3, veinColor: '#c2185b' } },
  // Two systems, as Vessel Studio 3D grows them.
  { id: 'join', label: 'Inlet to outlet', tip: 'An inlet tree and an outlet tree grow from opposite ends and join where they meet, so flow can pass from one to the other, as through a microfluidic chip.', roots: 'ends',
    values: { systems: 2, coupling: 'join', shape: 'ellipse', loops: false, leafGrowth: false, count: 2000, placement: 'even', inertia: 0.3, wiggle: 0.08, pull: 0, attraction: 0, tipPull: 0.6, trim: true, widthRule: 'murray', exponent: 3, veinColor: '#c0392b', veinColorB: '#6b55b8', linkColor: '#d4a017' } },
  { id: 'interweave', label: 'Two interwoven', tip: 'Two separate systems that fill the same shape and never touch, like arteries and veins side by side; each exports on its own layer.', roots: 'edge',
    values: { systems: 2, coupling: 'interweave', shape: 'ellipse', loops: false, leafGrowth: false, count: 3000, placement: 'even', inertia: 0.3, wiggle: 0.08, pull: 0, attraction: 0, repel: 0.3, widthRule: 'murray', exponent: 2.5, veinColor: '#c0392b', veinColorB: '#6b55b8' } },
]

// A preset's settings for this sheet: its lengths follow the sheet's size, and an imported shape is kept.
export function applyPreset(s: Settings, name: PresetName): Settings {
  const preset = PRESETS.find(p => p.id === name)
  if (!preset) return s
  const k = Math.min(s.width, s.height) / 200
  const scaled: Partial<Settings> = { segment: round(1.0 * k), kill: round(2.0 * k), tipWidth: round(0.22 * k, 3), maxWidth: round(2.6 * k, 2), gap: round(0.6 * k, 2) }
  if (name === 'loops' || name === 'capillary') scaled.kill = round(1.2 * k)
  if (name === 'tree') { scaled.kill = round(3 * k); scaled.maxWidth = round(5 * k, 2) }
  // A shape the user brought in stays: a preset sets how veins grow and look, not what they grow in.
  const kept: Partial<Settings> = s.shape === 'imported' ? { shape: 'imported' } : {}
  return sanitizeSettings({ ...s, ...preset.values, ...scaled, ...kept })
}

const round = (v: number, digits = 2) => Math.max(10 ** -digits, Number(v.toFixed(digits)))
