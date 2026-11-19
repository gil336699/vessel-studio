import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Vec } from '../veins/geometry'
import type { Region } from '../veins/region'
import { rootInset } from '../lib/design'
import { drawScene } from '../lib/render'
import type { Scene } from '../lib/scene'
import type { Settings } from '../lib/settings'
import { rootRadius } from '../lib/style'

export type Tool = 'roots' | 'pan'
export type StageControls = { fit: () => void; zoomBy: (factor: number) => void }

type View = { zoom: number; panX: number; panY: number }
type Drag =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  // A press on empty sheet. It adds a root when released, unless it moved or a second finger made it a pinch.
  | { kind: 'tap'; clientX: number; clientY: number }
  | { kind: 'root'; index: number; moved: boolean; x: number; y: number; startX: number; startY: number; touch: boolean }
  | { kind: 'pinch'; distance: number; view: View; worldX: number; worldY: number }

const ZOOM_MIN = 0.25, ZOOM_MAX = 80
const FIT_PADDING = 20

// The sheet preview. It fills the window behind the panels and fits the sheet into the free area between them
// (the frame). With the Roots tool, click to add a root, drag one to move it, Alt-click one to remove it.
// Space-drag or the Pan tool pans, wheel or pinch zooms, and a tap of Space grows or pauses.
export function Stage({ scene, settings, roots, region, tool, frameRef, controlRef, onAddRoot, onMoveRoot, onRemoveRoot, onZoom, onNotice, onSpaceTap }: {
  scene: Scene
  settings: Settings
  roots: Vec[]
  region: Region
  tool: Tool
  frameRef: RefObject<HTMLDivElement | null>
  controlRef: RefObject<StageControls | null>
  // moved: the click was outside the shape, or inside its edge clearance, so the root went further in.
  onAddRoot: (x: number, y: number, moved: 'outside' | 'clearance' | null) => void
  onMoveRoot: (index: number, x: number, y: number) => void
  onRemoveRoot: (index: number) => void
  onZoom: (zoom: number) => void
  onNotice: (text: string) => void
  onSpaceTap: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0, frame: { x: 0, y: 0, width: 0, height: 0 } })
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 })
  const [hover, setHover] = useState<number | null>(null)
  const [moving, setMoving] = useState<{ index: number; x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState('crosshair')
  const drag = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const space = useRef({ down: false, panned: false })
  const toolCursor = tool === 'pan' ? 'grab' : 'crosshair'

  // Track the window and the free frame between panels.
  useLayoutEffect(() => {
    const measure = () => {
      const outer = box.current?.getBoundingClientRect()
      const inner = frameRef.current?.getBoundingClientRect()
      if (!outer) return
      const frame = inner && inner.width > 40 && inner.height > 40
        ? { x: inner.left - outer.left, y: inner.top - outer.top, width: inner.width, height: inner.height }
        : { x: 0, y: 0, width: outer.width, height: outer.height }
      setSize({ width: outer.width, height: outer.height, frame })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (box.current) observer.observe(box.current)
    if (frameRef.current) observer.observe(frameRef.current)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [frameRef])

  const fitScale = Math.max(1e-6, Math.min((size.frame.width - FIT_PADDING * 2) / settings.width, (size.frame.height - FIT_PADDING * 2) / settings.height))
  const centerX = size.frame.x + size.frame.width / 2, centerY = size.frame.y + size.frame.height / 2
  const originX = useCallback((s: number, pan: number) => centerX - (settings.width / 2) * s + pan, [centerX, settings.width])
  const originY = useCallback((s: number, pan: number) => centerY - (settings.height / 2) * s + pan, [centerY, settings.height])
  const scale = fitScale * view.zoom
  const ox = originX(scale, view.panX), oy = originY(scale, view.panY)

  useEffect(() => onZoom(view.zoom), [view.zoom, onZoom])

  // Draw whenever anything visible changes, before the browser paints.
  useLayoutEffect(() => {
    const el = canvas.current
    if (!el || !size.width) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(size.width * dpr), h = Math.round(size.height * dpr)
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h }
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // The sheet's shadow, then the design on it.
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = 18 * dpr
    ctx.shadowOffsetY = 4 * dpr
    ctx.fillStyle = settings.background
    ctx.fillRect(ox * dpr, oy * dpr, settings.width * scale * dpr, settings.height * scale * dpr)
    ctx.restore()
    const shown = moving && scene.roots ? { ...scene, roots: scene.roots.map((r, i): Vec => (i === moving.index ? [moving.x, moving.y] : r)) } : scene
    drawScene(ctx, shown, settings, { scale: scale * dpr, ox: ox * dpr, oy: oy * dpr }, { background: null, minPx: 0.6 * dpr })
    if (hover !== null && roots[hover] && scene.roots) {
      const [x, y] = moving && moving.index === hover ? [moving.x, moving.y] : roots[hover]
      ctx.beginPath()
      ctx.arc((ox + x * scale) * dpr, (oy + y * scale) * dpr, (Math.max(rootRadius(settings.segment, settings.tipWidth) * scale, 3) + 4) * dpr, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0, 113, 227, 0.8)'
      ctx.lineWidth = 2 * dpr
      ctx.stroke()
    }
    // Read-only view state for QA scripts in development builds.
    if (import.meta.env.DEV) (window as unknown as { __stage: unknown }).__stage = { scale, ox, oy, rect: box.current?.getBoundingClientRect() }
  }, [scene, settings, scale, ox, oy, size, hover, moving, roots])

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect()
    return [(clientX - r.left - ox) / scale, (clientY - r.top - oy) / scale] as const
  }, [ox, oy, scale])

  const zoomAround = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const cx = clientX === undefined ? centerX : clientX - r.left
    const cy = clientY === undefined ? centerY : clientY - r.top
    setView(v => {
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * factor))
      const s0 = fitScale * v.zoom, s1 = fitScale * zoom
      const wx = (cx - originX(s0, v.panX)) / s0, wy = (cy - originY(s0, v.panY)) / s0
      return { zoom, panX: cx - wx * s1 - originX(s1, 0), panY: cy - wy * s1 - originY(s1, 0) }
    })
  }, [fitScale, centerX, centerY, originX, originY])

  useEffect(() => {
    controlRef.current = { fit: () => setView({ zoom: 1, panX: 0, panY: 0 }), zoomBy: factor => zoomAround(factor) }
  }, [controlRef, zoomAround])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomAround(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)), event.clientX, event.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  // Space held while dragging pans; a tap of Space on its own grows or pauses. A button, slider or switch last
  // pressed with the pointer keeps focus, but Space still grows rather than pressing it again; reached with the
  // keyboard, Space works it as usual.
  const tapRef = useRef(onSpaceTap)
  useEffect(() => { tapRef.current = onSpaceTap }, [onSpaceTap])
  const hold = useRef(0)
  const pressed = useRef<Element | null>(null)
  useEffect(() => {
    const CONTROL = 'button, input[type=range], input[type=checkbox]'
    const pointer = (event: PointerEvent) => { pressed.current = event.target instanceof Element ? event.target.closest(CONTROL) : null }
    const tab = (event: KeyboardEvent) => { if (event.key === 'Tab') pressed.current = null }
    const byPointer = (event: KeyboardEvent) => event.target instanceof Element && pressed.current !== null
      && event.target.closest(CONTROL) === pressed.current && !event.target.closest('[role=dialog], [role=alertdialog]')
    const ignored = (event: KeyboardEvent) => event.target instanceof Element && Boolean(event.target.closest('input, select, textarea, button, [role=dialog], [role=alertdialog]')) && !byPointer(event)
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || ignored(event)) return
      event.preventDefault()
      if (event.repeat || space.current.down) return
      space.current = { down: true, panned: false }
      setCursor('grab')
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !space.current.down) return
      event.preventDefault()
      const tapped = !space.current.panned
      space.current = { down: false, panned: false }
      setCursor(toolCursor)
      if (tapped) tapRef.current()
    }
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('keydown', tab, true)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('pointerdown', pointer, true); window.removeEventListener('keydown', tab, true)
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
    }
  }, [toolCursor])
  useEffect(() => { if (!space.current.down) setCursor(toolCursor) }, [toolCursor])

  // The root under a point, within a finger's or a cursor's reach.
  const rootAt = (x: number, y: number, touch: boolean): number => {
    const reach = Math.max(rootRadius(settings.segment, settings.tipWidth), (touch ? 22 : 10) / scale)
    let best = -1, bestD = reach
    roots.forEach(([rx, ry], i) => { const d = Math.hypot(rx - x, ry - y); if (d <= bestD) { bestD = d; best = i } })
    return best
  }
  const inside = (x: number, y: number): Vec | null => region.nearestInside(x, y, rootInset(settings))

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* the pointer already ended */ }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      // Two fingers: pinch to zoom and drag to pan. A root drag one finger started is dropped.
      const [a, b] = [...pointers.current.values()]
      const [wx, wy] = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2)
      drag.current = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), view, worldX: wx, worldY: wy }
      setMoving(null)
      return
    }
    if (pointers.current.size > 2) return
    const panning = tool === 'pan' || space.current.down || event.button === 1
    if (panning) {
      if (space.current.down) space.current.panned = true
      drag.current = { kind: 'pan', startX: event.clientX, startY: event.clientY, panX: view.panX, panY: view.panY }
      setCursor('grabbing')
      return
    }
    if (event.button !== 0) return
    const [x, y] = toWorld(event.clientX, event.clientY)
    const hit = rootAt(x, y, event.pointerType === 'touch')
    if (hit >= 0 && event.altKey) { onRemoveRoot(hit); setHover(null); return }
    if (hit >= 0) {
      const touch = event.pointerType === 'touch'
      drag.current = { kind: 'root', index: hit, moved: false, x: roots[hit][0], y: roots[hit][1], startX: event.clientX, startY: event.clientY, touch }
      // On a touch screen, which has no Alt key, pressing and holding a root removes it.
      window.clearTimeout(hold.current)
      if (touch) hold.current = window.setTimeout(() => {
        const d = drag.current
        if (d?.kind !== 'root' || d.index !== hit || d.moved) return
        drag.current = null
        setMoving(null)
        onRemoveRoot(hit)
      }, 600)
      return
    }
    if (x < 0 || y < 0 || x > settings.width || y > settings.height) return
    drag.current = { kind: 'tap', clientX: event.clientX, clientY: event.clientY }
  }

  const addRootAt = (clientX: number, clientY: number) => {
    const [x, y] = toWorld(clientX, clientY)
    const p = inside(x, y)
    if (!p) {
      const where = settings.invert ? 'in the space round the shape, as it grows outside it' : 'inside the shape'
      onNotice(settings.clearance > 0 ? `Roots go ${where}, clear of its edges by the edge clearance. Click further in, or lower the clearance.` : `Roots go ${where}. Click there.`)
      return
    }
    const moved = !region.contains(x, y) ? 'outside' : settings.clearance > 0 && (p[0] !== x || p[1] !== y) ? 'clearance' : null
    onAddRoot(p[0], p[1], moved)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const d = drag.current
    if (d?.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()]
      if (!a || !b) return
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, d.view.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, d.distance))))
      const r = box.current!.getBoundingClientRect()
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top
      const s1 = fitScale * zoom
      setView({ zoom, panX: mx - d.worldX * s1 - originX(s1, 0), panY: my - d.worldY * s1 - originY(s1, 0) })
      return
    }
    if (d?.kind === 'pan') { setView(v => ({ ...v, panX: d.panX + event.clientX - d.startX, panY: d.panY + event.clientY - d.startY })); return }
    // A press that moves is a drag, not a tap, so it adds no root.
    if (d?.kind === 'tap' && Math.hypot(event.clientX - d.clientX, event.clientY - d.clientY) > 8) drag.current = null
    const [x, y] = toWorld(event.clientX, event.clientY)
    if (d?.kind === 'root') {
      // A finger wobbles: a press that stays within 8 px holds the root still, for press and hold.
      if (d.touch && !d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < 8) return
      window.clearTimeout(hold.current)
      const p = inside(x, y)
      if (!p) return
      d.moved = true; d.x = p[0]; d.y = p[1]
      setMoving({ index: d.index, x: p[0], y: p[1] })
      return
    }
    if (event.pointerType === 'touch' || tool !== 'roots' || space.current.down) { if (hover !== null) setHover(null); return }
    const hit = rootAt(x, y, false)
    setHover(hit >= 0 ? hit : null)
    setCursor(hit >= 0 ? (event.altKey ? 'not-allowed' : 'move') : 'crosshair')
  }

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    window.clearTimeout(hold.current)
    pointers.current.delete(event.pointerId)
    const d = drag.current
    if (d?.kind === 'pinch' && pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      drag.current = { kind: 'pan', startX: p.x, startY: p.y, panX: view.panX, panY: view.panY }
      return
    }
    if (pointers.current.size === 0) {
      drag.current = null
      setMoving(null)
      setCursor(space.current.down ? 'grab' : toolCursor)
      if (d?.kind === 'root' && d.moved && event.type === 'pointerup') onMoveRoot(d.index, d.x, d.y)
      if (d?.kind === 'tap' && event.type === 'pointerup') addRootAt(d.clientX, d.clientY)
    }
  }

  return <div ref={box} className="stage-canvas">
    <canvas ref={canvas} style={{ cursor }} role="img"
      aria-label="Sheet preview. With the Roots tool, click to add a root where veins start, drag a root to move it, or Alt-click it to remove it."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onPointerLeave={() => { if (!drag.current) setHover(null) }} onContextMenu={event => event.preventDefault()} />
  </div>
}
