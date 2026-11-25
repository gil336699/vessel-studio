// What the view shows, ready to draw or export: the shape, the veins as paths between forks with their
// widths, the attractors still in play and the roots. The screen, the PNG, the SVG and the DXF all draw this,
// so they always match. With two or three systems each vein knows its system, Join's joins between its trees are
// veins of their own, Trim dead ends leaves out the veins that never met the other tree, and interwoven veins are
// narrowed where two systems pass closer than the gap.
import type { Root } from '../veins/engine'
import type { Ring } from '../veins/geometry'
import { chains, safeCurves, separateWidths, trimDeadEnds, veinWidths, type Chain } from '../veins/network'
import type { Region } from '../veins/region'
import { interweaving, joining, widthSettings, type Settings } from './settings'

export type Mirror = {
  x: ArrayLike<number>; y: ArrayLike<number>; parent: ArrayLike<number>; joins: ArrayLike<number>; points: number
  sys?: ArrayLike<number>; links?: ArrayLike<number>
}

export type Scene = {
  width: number; height: number
  systems: number // how many systems the veins and roots belong to
  rings: Ring[] | null
  veins: Chain[] | null
  attractors: Float64Array | null // the attractors still in play, as x, y pairs
  roots: Root[] | null
}

// The width of the vein arriving at each point, and which points are drawn. settled: trim Join's dead ends and narrow
// interwoven veins where they pass close. The view leaves both until growth pauses: narrowing searches every vein, and
// while the trees are still meeting, trimming would hide veins that are about to join.
export function veinLayout(s: Settings, net: Mirror, settled = true): { widths: Float64Array; keep: Uint8Array | null; closest: number } {
  const n = net.points
  // Trimming needs joins to keep: before the trees meet, every end is a dead end, and trimming would leave nothing.
  const keep = settled && joining(s) && s.trim && net.links && net.links.length > 0 ? trimDeadEnds(net.parent, n, net.links) : null
  let widths = veinWidths(net.parent, n, widthSettings(s), keep), closest = Infinity
  if (settled && interweaving(s) && net.sys) ({ widths, closest } = separateWidths(net.x, net.y, net.parent, net.sys, n, widths, s.gap))
  return { widths, keep, closest }
}

export function sceneOf(s: Settings, rings: Ring[], net: Mirror, attractors: Float64Array, used: Uint8Array | null, roots: Root[], opts: { settled?: boolean } = {}): Scene {
  let live: Float64Array | null = null
  if (s.showAttractors) {
    const keep: number[] = []
    for (let i = 0; i * 2 < attractors.length; i++) if (!used || !used[i]) keep.push(attractors[i * 2], attractors[i * 2 + 1])
    live = Float64Array.from(keep)
  }
  const several = s.systems > 1
  let veins: Chain[] | null = null
  if (s.showVeins && net.points > 1) {
    const { widths, keep } = veinLayout(s, net, opts.settled ?? true)
    veins = chains(net.x, net.y, net.parent, net.joins, net.points, widths, several ? { sys: net.sys, links: joining(s) ? net.links : null, keep } : {})
  }
  return {
    width: s.width, height: s.height, systems: several ? s.systems : 1,
    rings: s.showBoundary && rings.length ? rings : null,
    veins,
    attractors: live,
    roots: s.showRoots && roots.length ? roots : null,
  }
}

// The scene for an export, with each smoothed vein's curves worked out so they stay inside the shape and clear of its
// edges (see safeCurves). The screen draws the plain curves: the difference is far below a pixel there.
export function forExport(scene: Scene, s: Settings, region: Region): Scene {
  if (!s.smooth || !scene.veins) return scene
  return { ...scene, veins: scene.veins.map(c => (c.points.length > 2 ? { ...c, curves: safeCurves(c.points, region, s.clearance) } : c)) }
}

// What an export will hold, in plain words, for the File tab.
export function sceneContents(scene: Scene): string[] {
  return [
    ...(scene.veins?.length ? ['the veins'] : []),
    ...(scene.rings ? ['the shape'] : []),
    ...(scene.attractors?.length ? ['the attractors'] : []),
    ...(scene.roots ? ['the roots'] : []),
  ]
}
