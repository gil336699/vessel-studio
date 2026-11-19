// Draws a scene on a canvas, for the view and the PNG, from the same scene the SVG and DXF are written from.
// `scale` is pixels per millimetre and (ox, oy) where the sheet's corner lands. Veins of the same width are
// stroked together, which keeps tens of thousands of veins quick to draw.
import { smoothChain } from '../veins/network'
import type { Scene } from './scene'
import type { Settings } from './settings'
import { ATTRACTOR_COLOR, BOUNDARY_COLOR, ROOT_COLOR, attractorRadius, boundaryWidth, rootRadius } from './style'

export type Transform = { scale: number; ox: number; oy: number }

// On screen, lines never draw thinner than this many pixels, so fine veins stay visible when zoomed out.
const MIN_SCREEN_PX = 0.6

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, s: Settings, t: Transform, opts: { background: string | null; minPx?: number }) {
  const { scale: k, ox, oy } = t
  const minPx = opts.minPx ?? MIN_SCREEN_PX
  ctx.save()
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(ox, oy, scene.width * k, scene.height * k)
  }
  ctx.setTransform(k, 0, 0, k, ox, oy)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (scene.rings) {
    ctx.beginPath()
    for (const ring of scene.rings) { ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath() }
    ctx.strokeStyle = BOUNDARY_COLOR
    ctx.lineWidth = Math.max(boundaryWidth(s.tipWidth), minPx / k)
    ctx.stroke()
  }
  if (scene.veins?.length) {
    // Group by drawn width, rounded to a twentieth of a pixel.
    const groups = new Map<number, typeof scene.veins>()
    for (const chain of scene.veins) {
      // At least a twentieth of a pixel: canvas ignores a line width of 0 and would keep the last one.
      const w = Math.max(1, Math.round(Math.max(chain.width, minPx / k) * k * 20))
      const list = groups.get(w)
      if (list) list.push(chain); else groups.set(w, [chain])
    }
    ctx.strokeStyle = s.veinColor
    for (const [w, list] of groups) {
      ctx.lineWidth = w / 20 / k
      ctx.beginPath()
      for (const { points } of list) {
        ctx.moveTo(points[0][0], points[0][1])
        if (s.smooth && points.length > 2) for (const [a, b, c, d, x, y] of smoothChain(points)) ctx.bezierCurveTo(a, b, c, d, x, y)
        else for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1])
      }
      ctx.stroke()
    }
  }
  if (scene.attractors?.length) {
    const r = Math.max(attractorRadius(s.segment), (minPx * 0.9) / k), a = scene.attractors
    ctx.fillStyle = ATTRACTOR_COLOR
    ctx.beginPath()
    for (let i = 0; i < a.length; i += 2) { ctx.moveTo(a[i] + r, a[i + 1]); ctx.arc(a[i], a[i + 1], r, 0, Math.PI * 2) }
    ctx.fill()
  }
  if (scene.roots) {
    const r = Math.max(rootRadius(s.segment, s.tipWidth), 3 / k)
    ctx.fillStyle = ROOT_COLOR
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1 / k
    for (const [x, y] of scene.roots) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  }
  ctx.restore()
}
