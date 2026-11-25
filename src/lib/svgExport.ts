// SVG at real size, for Illustrator, Inkscape, pen plotters and laser software. The page is the sheet. Like every
// export it holds what the view shows, each part in its own group, which Illustrator opens as a layer and Inkscape
// (and so AxiDraw) as a layer too. Each vein between two forks is one path with its own width, in millimetres.
// With two or three systems, each system is a layer of its own, and so are Join's joins between its trees, so each
// can be cut, plotted with its own pen or hidden on its own. There is no background rectangle: laser software would
// engrave a filled one.
import { smoothChain, type Chain, type Cubic } from '../veins/network'
import { num } from './format'
import { rootColor } from './render'
import type { Scene } from './scene'
import { SYSTEM_NAMES, systemColor, type Settings } from './settings'
import { ATTRACTOR_COLOR, BOUNDARY_COLOR, ROOT_COLOR, attractorRadius, boundaryWidth, rootRadius } from './style'

// Illustrator keeps a path's point count in 16 bits, so very long veins are written as pieces (as Line Growth does).
const MAX_PATH_SEGMENTS = 32_000

function sizeAttributes(s: Settings): string {
  if (s.units === 'in') return `width="${num(s.width / 25.4, 4)}in" height="${num(s.height / 25.4, 4)}in"`
  if (s.units === 'pt') return `width="${num((s.width / 25.4) * 72, 3)}pt" height="${num((s.height / 25.4) * 72, 3)}pt"`
  if (s.units === 'px') return `width="${Math.round((s.width / 25.4) * s.dpi)}" height="${Math.round((s.height / 25.4) * s.dpi)}"`
  return `width="${num(s.width)}mm" height="${num(s.height)}mm"`
}

const layer = (id: string, label: string) => `id="${id}" inkscape:groupmode="layer" inkscape:label="${label}"`

// A vein's path data, smoothed through its points (along `curves` when given, one a segment) or straight between
// them, in pieces if very long.
export function veinPaths(points: [number, number][], smooth: boolean, curves?: Cubic[]): string[] {
  const out: string[] = []
  for (let start = 0; start < points.length - 1; start += MAX_PATH_SEGMENTS) {
    const piece = points.slice(start, Math.min(points.length, start + MAX_PATH_SEGMENTS + 1))
    let d = `M${num(piece[0][0])} ${num(piece[0][1])}`
    const along = curves ? curves.slice(start, start + piece.length - 1) : null
    if (smooth && piece.length > 2) for (const [a, b, c, e, x, y] of along ?? smoothChain(piece)) d += `C${num(a)} ${num(b)} ${num(c)} ${num(e)} ${num(x)} ${num(y)}`
    else for (let i = 1; i < piece.length; i++) d += `L${num(piece[i][0])} ${num(piece[i][1])}`
    out.push(d)
  }
  return out
}

export function designSvg(scene: Scene, s: Settings): string {
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ${sizeAttributes(s)} viewBox="0 0 ${num(scene.width)} ${num(scene.height)}">\n`
    + `<title>Vessel Studio</title>\n`
  if (scene.rings) {
    const d = scene.rings.filter(r => r.length >= 3).map(r => `M${r.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`).join('')
    svg += `<g ${layer('shape', 'Shape')} fill="none" stroke="${BOUNDARY_COLOR}" stroke-width="${num(boundaryWidth(s.tipWidth), 4)}" stroke-linejoin="round">`
      + `<path fill-rule="evenodd" d="${d}"/></g>\n`
  }
  const veinLayer = (id: string, label: string, color: string, chains: Chain[]) => {
    if (!chains.length) return
    svg += `<g ${layer(id, label)} fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">\n`
    for (const chain of chains) {
      const w = num(chain.width, 4)
      for (const d of veinPaths(chain.points, s.smooth, chain.curves)) svg += `<path stroke-width="${w}" d="${d}"/>\n`
    }
    svg += `</g>\n`
  }
  if (scene.veins?.length) {
    const T = scene.systems
    if (T === 1) veinLayer('veins', 'Veins', s.veinColor, scene.veins)
    else {
      for (let t = 0; t < T; t++) veinLayer(`veins-${SYSTEM_NAMES[t].toLowerCase()}`, `System ${SYSTEM_NAMES[t]}`, systemColor(s, t), scene.veins.filter(c => !c.link && Math.min(T - 1, c.system ?? 0) === t))
      veinLayer('joins', 'Joins', s.linkColor, scene.veins.filter(c => c.link))
    }
  }
  if (scene.attractors?.length) {
    const r = num(attractorRadius(s.segment), 4), a = scene.attractors
    svg += `<g ${layer('attractors', 'Attractors')} fill="${ATTRACTOR_COLOR}">\n`
    for (let i = 0; i < a.length; i += 2) svg += `<circle cx="${num(a[i])}" cy="${num(a[i + 1])}" r="${r}"/>\n`
    svg += `</g>\n`
  }
  if (scene.roots) {
    const r = num(rootRadius(s.segment, s.tipWidth), 4)
    svg += `<g ${layer('roots', 'Roots')} fill="${ROOT_COLOR}">\n`
    // With two or three systems, each root is its system's colour.
    for (const [x, y, t] of scene.roots) svg += `<circle cx="${num(x)}" cy="${num(y)}" r="${r}"${scene.systems > 1 ? ` fill="${rootColor(t ?? 0, s, scene.systems)}"` : ''}/>\n`
    svg += `</g>\n`
  }
  return `${svg}</svg>\n`
}
