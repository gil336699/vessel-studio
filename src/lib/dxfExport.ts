// DXF for CAD, CAM and laser software, as AutoCAD R12 text, the most widely read version. Each vein between two
// forks is one polyline through its points, or through its smooth curve when Smooth curves is on (Fusion and most
// CAM read polylines more reliably than splines). The shape, attractors and roots go on their own layers when the
// view shows them; with two or three systems, each system's veins and Join's joins between its trees do too. DXF has
// no line widths in R12, so the veins are centre lines; the SVG carries their widths. DXF's y axis points up, so y is
// flipped.
import { flattenChain, flattenCurves, type Chain } from '../veins/network'
import { num } from './format'
import type { Scene } from './scene'
import { SYSTEM_NAMES, type Settings } from './settings'
import { attractorRadius, rootRadius } from './style'

export const LAYER_VEINS = 'VEINS'
export const LAYER_JOINS = 'JOINS'
// System A's veins and so on, with two or three systems.
export const systemLayer = (t: number) => `VEINS_${SYSTEM_NAMES[t]}`
export const LAYER_SHAPE = 'SHAPE'
export const LAYER_ATTRACTORS = 'ATTRACTORS'
export const LAYER_ROOTS = 'ROOTS'

// Points per smoothed segment: enough that the polyline stays within a few thousandths of a millimetre of the
// curve at typical segment lengths.
const CURVE_POINTS = 4

export function designDxf(scene: Scene, s: Settings): string {
  const inches = s.units === 'in'
  const k = inches ? 1 / 25.4 : 1
  const X = (x: number) => num(x * k, 4), Y = (y: number) => num((scene.height - y) * k, 4), R = (r: number) => num(r * k, 4)
  const out: string[] = []
  const pair = (code: number, value: string | number) => { out.push(String(code), String(value)) }

  pair(0, 'SECTION'); pair(2, 'HEADER')
  pair(9, '$ACADVER'); pair(1, 'AC1009')
  pair(9, '$INSUNITS'); pair(70, inches ? 1 : 4)
  pair(9, '$MEASUREMENT'); pair(70, inches ? 0 : 1)
  pair(9, '$EXTMIN'); pair(10, X(0)); pair(20, Y(scene.height)); pair(30, 0)
  pair(9, '$EXTMAX'); pair(10, X(scene.width)); pair(20, Y(0)); pair(30, 0)
  pair(0, 'ENDSEC')

  // AutoCAD colours: 7 black or white, 4 cyan, 8 grey, 1 red, 5 blue, 3 green, 2 yellow.
  const T = scene.systems
  const layerOf = (c: Chain) => (T === 1 ? LAYER_VEINS : c.link ? LAYER_JOINS : systemLayer(Math.min(T - 1, c.system ?? 0)))
  const layers: [string, number][] = []
  if (scene.veins?.length) {
    if (T === 1) layers.push([LAYER_VEINS, 7])
    else {
      for (let t = 0; t < T; t++) if (scene.veins.some(c => !c.link && layerOf(c) === systemLayer(t))) layers.push([systemLayer(t), [1, 5, 3][t]])
      if (scene.veins.some(c => c.link)) layers.push([LAYER_JOINS, 2])
    }
  }
  if (scene.rings) layers.push([LAYER_SHAPE, 4])
  if (scene.attractors?.length) layers.push([LAYER_ATTRACTORS, 8])
  if (scene.roots) layers.push([LAYER_ROOTS, 1])
  pair(0, 'SECTION'); pair(2, 'TABLES')
  pair(0, 'TABLE'); pair(2, 'LAYER'); pair(70, layers.length)
  for (const [name, colour] of layers) { pair(0, 'LAYER'); pair(2, name); pair(70, 0); pair(62, colour); pair(6, 'CONTINUOUS') }
  pair(0, 'ENDTAB'); pair(0, 'ENDSEC')

  pair(0, 'SECTION'); pair(2, 'ENTITIES')
  const polyline = (p: [number, number][], closed: boolean, layer: string) => {
    pair(0, 'POLYLINE'); pair(8, layer); pair(66, 1); pair(10, 0); pair(20, 0); pair(30, 0); pair(70, closed ? 1 : 0)
    for (const [x, y] of p) { pair(0, 'VERTEX'); pair(8, layer); pair(10, X(x)); pair(20, Y(y)); pair(30, 0) }
    pair(0, 'SEQEND'); pair(8, layer)
  }
  const circle = (x: number, y: number, r: number, layer: string) => { pair(0, 'CIRCLE'); pair(8, layer); pair(10, X(x)); pair(20, Y(y)); pair(30, 0); pair(40, R(r)) }
  if (scene.rings) for (const ring of scene.rings) polyline(ring, true, LAYER_SHAPE)
  if (scene.veins) for (const chain of scene.veins) {
    const p = !s.smooth ? chain.points : chain.curves ? flattenCurves(chain.points[0], chain.curves, CURVE_POINTS) : flattenChain(chain.points, CURVE_POINTS)
    polyline(p, false, layerOf(chain))
  }
  if (scene.attractors) {
    const r = attractorRadius(s.segment), a = scene.attractors
    for (let i = 0; i < a.length; i += 2) circle(a[i], a[i + 1], r, LAYER_ATTRACTORS)
  }
  if (scene.roots) for (const [x, y] of scene.roots) circle(x, y, rootRadius(s.segment, s.tipWidth), LAYER_ROOTS)
  pair(0, 'ENDSEC'); pair(0, 'EOF')
  return `${out.join('\n')}\n`
}
