// What the view shows, ready to draw or export: the shape, the veins as paths between forks with their
// widths, the attractors still in play and the roots. The screen, the PNG, the SVG and the DXF all draw this,
// so they always match.
import type { Ring, Vec } from '../veins/geometry'
import { chains, veinWidths, type Chain } from '../veins/network'
import { widthSettings, type Settings } from './settings'

export type Mirror = { x: ArrayLike<number>; y: ArrayLike<number>; parent: ArrayLike<number>; joins: ArrayLike<number>; points: number }

export type Scene = {
  width: number; height: number
  rings: Ring[] | null
  veins: Chain[] | null
  attractors: Float64Array | null // the attractors still in play, as x, y pairs
  roots: Vec[] | null
}

export function sceneOf(s: Settings, rings: Ring[], net: Mirror, attractors: Float64Array, used: Uint8Array | null, roots: Vec[]): Scene {
  let live: Float64Array | null = null
  if (s.showAttractors) {
    const keep: number[] = []
    for (let i = 0; i * 2 < attractors.length; i++) if (!used || !used[i]) keep.push(attractors[i * 2], attractors[i * 2 + 1])
    live = Float64Array.from(keep)
  }
  return {
    width: s.width, height: s.height,
    rings: s.showBoundary && rings.length ? rings : null,
    veins: s.showVeins && net.points > 1 ? chains(net.x, net.y, net.parent, net.joins, net.points, veinWidths(net.parent, net.points, widthSettings(s))) : null,
    attractors: live,
    roots: s.showRoots && roots.length ? roots : null,
  }
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
