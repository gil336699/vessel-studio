import { memo, type ReactNode } from 'react'
import { networkStats } from '../veins/network'
import type { Settings } from '../lib/settings'
import { formatLength, formatLong } from '../lib/units'
import type { Stats } from '../useVeins'
import { Button } from './Controls'
import { Icon, type IconName } from './Icon'
import type { Tool } from './Stage'
import { touchFirst } from '../lib/touch'

// The floating bars round the sheet: tools and what's shown on top, growth controls and status below, and the
// measurements panel.

const TOOLS: { id: Tool; label: string; icon: IconName; key: string; tip: string }[] = [
  { id: 'roots', label: 'Roots', icon: 'draw', key: 'O', tip: 'Click to add a root, where veins start. Drag a root to move it; Alt-click one to remove it.' },
  { id: 'pan', label: 'Pan', icon: 'pan', key: 'H', tip: 'Drag to move the view. Holding Space pans with any tool.' },
]

const TOOL_CAPTION: Record<Tool, string> = {
  roots: 'Click to add a root · Drag one to move it · Alt-click to remove · Space+drag to pan · Scroll to zoom',
  pan: 'Drag to move the view · Scroll or pinch to zoom · Esc for Roots',
}
const TOUCH_CAPTION: Record<Tool, string> = {
  roots: 'Tap to add a root · Drag one to move it · Press and hold one to remove it · Pinch to zoom, two fingers to pan',
  pan: 'Drag to move the view · Pinch to zoom',
}

export type ViewKey = 'showVeins' | 'showAttractors' | 'showBoundary' | 'showRoots'
// Named "Show …" for screen readers, so the Roots toggle isn't mistaken for the Roots tool.
const VIEW: { key: ViewKey; label: string; name: string; shortcut: string; tip: string }[] = [
  { key: 'showVeins', label: 'Veins', name: 'Show veins', shortcut: '1', tip: 'Show or hide the veins; exports hold what’s shown.' },
  { key: 'showAttractors', label: 'Attractors', name: 'Show attractors', shortcut: '2', tip: 'Show or hide the attractors still in play, the points veins grow toward; exports hold what’s shown.' },
  { key: 'showBoundary', label: 'Shape', name: 'Show the shape’s outline', shortcut: '3', tip: 'Show or hide the shape’s outline; exports hold what’s shown.' },
  { key: 'showRoots', label: 'Roots', name: 'Show roots', shortcut: '4', tip: 'Show or hide the roots, where veins start; exports hold what’s shown.' },
]

export function ViewBar({ tool, setTool, s, toggle, zoom, onFit, onZoom }: {
  tool: Tool; setTool: (tool: Tool) => void; s: Settings
  toggle: (key: ViewKey) => void; zoom: number; onFit: () => void; onZoom: (factor: number) => void
}) {
  return <div className="viewport-bars">
    <div className="viewport-bar-row">
      <div className="floating-bar glass" role="toolbar" aria-label="Tools">
        {TOOLS.map(t => <Button key={t.id} pressed={tool === t.id} tip={t.tip} shortcut={t.key} label={t.label} onClick={() => setTool(t.id)}>
          <Icon name={t.icon} /><span className="compact-label">{t.label}</span></Button>)}
      </div>
      <div className="floating-bar glass" role="toolbar" aria-label="Show">
        {VIEW.map(v => <Button key={v.key} pressed={s[v.key]} shortcut={v.shortcut} tip={v.tip} label={v.name} onClick={() => toggle(v.key)}>{v.label}</Button>)}
        <span className="bar-divider" aria-hidden="true" />
        <Button className="icon-button zoom-step" label="Zoom out" shortcut="−" tip="Zoom out." onClick={() => onZoom(1 / 1.25)}><Icon name="minus" /></Button>
        <Button className="zoom-readout" shortcut="F" tip="Fit the whole sheet in the window." label={`Zoom ${Math.round(zoom * 100)} percent. Fit to window`} onClick={onFit}>{Math.round(zoom * 100)}%</Button>
        <Button className="icon-button zoom-step" label="Zoom in" shortcut="+" tip="Zoom in." onClick={() => onZoom(1.25)}><Icon name="plus" /></Button>
      </div>
    </div>
    <p className="view-caption"><span>{(touchFirst() ? TOUCH_CAPTION : TOOL_CAPTION)[tool]}</span></p>
  </div>
}

export function Dock({ running, stopping, canGrow, onGrow, onPause, onStep, onReset, canReset, status, warning, canUndo, canRedo, onUndo, onRedo }: {
  running: boolean; stopping: boolean; canGrow: string | false
  onGrow: () => void; onPause: () => void; onStep: () => void; onReset: () => void; canReset: string | false
  status: ReactNode; warning: boolean; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void
}) {
  const busy = running && 'Pause the growth first.'
  return <div className="dock">
    <div className="timeline glass">
      <div className="transport" role="group" aria-label="Growth">
        {running
          ? <Button className="primary" shortcut="Space" unavailable={stopping && 'Stopping after the current step…'} tip="Pause the growth. Press Grow to carry on." onClick={onPause}>
            <Icon name="pause" />{stopping ? 'Stopping…' : 'Pause'}</Button>
          : <Button className="primary" shortcut="Space" unavailable={canGrow} tip="Grow the veins until every attractor is reached or you pause. Growth settings can change while they grow." onClick={onGrow}>
            <Icon name="play" />Grow</Button>}
        <Button shortcut="S" unavailable={busy || canGrow} tip="Grow by a single step." onClick={onStep}><Icon name="step" /><span className="compact-label">Step</span></Button>
        <Button shortcut="R" unavailable={canReset} tip="Go back to the roots, before any growth. Undo brings the veins back." onClick={onReset}><Icon name="reset" /><span className="compact-label">Reset</span></Button>
      </div>
      <span className="timeline-status" role="status" data-warning={warning} data-tip={typeof status === 'string' && status.length > 90 ? status : undefined}>{status}</span>
      <div className="transport" role="group" aria-label="History">
        <Button className="icon-button" label="Undo" shortcut="⌘Z" unavailable={!canUndo && 'Nothing to undo yet.'} tip="Undo the last change. Undoing while veins grow pauses them first." onClick={onUndo}><Icon name="undo" /></Button>
        <Button className="icon-button" label="Redo" shortcut="⇧⌘Z" unavailable={!canRedo && 'Nothing to redo.'} tip="Redo the change you undid." onClick={onRedo}><Icon name="redo" /></Button>
      </div>
    </div>
  </div>
}

type Net = { x: ArrayLike<number>; y: ArrayLike<number>; parent: ArrayLike<number>; joins: ArrayLike<number>; points: number }

// Memoised on the frame counter, so it measures the veins once per frame.
export const Inspector = memo(function Inspector({ s, stats, net, attractors, roots }: { s: Settings; stats: Stats; net: Net; attractors: number; roots: number }) {
  const n = networkStats(net.x, net.y, net.parent, net.joins, net.points)
  const L = (mm: number) => formatLength(mm, s.units, s.dpi, true)
  const rows: [string, string, string][] = [
    ['Sheet', `${formatLength(s.width, s.units, s.dpi)} × ${formatLength(s.height, s.units, s.dpi)}`, 'Width × height of the sheet, which is also the size of every export.'],
    ['Vein points', n.points.toLocaleString(), 'Points the veins are made of, one segment length apart.'],
    ['Forks', n.forks.toLocaleString(), 'Vein points where a vein splits in two or more.'],
    ['Vein ends', n.ends.toLocaleString(), 'Veins that end freely, not in a loop.'],
    ['Loops', n.loops.toLocaleString(), 'Places where veins from two sides met at an attractor and joined, closing a loop. Turn on Loops on the Grow tab.'],
    ['Roots', roots.toLocaleString(), 'Where veins start. Add them with the Roots tool.'],
    ['Attractors left', `${stats.live.toLocaleString()} of ${attractors.toLocaleString()}${stats.waiting ? ` (${stats.waiting.toLocaleString()} waiting for the leaf)` : ''}`, 'Attractors not yet reached by a vein. With leaf growth, some wait until the growing outline reaches them.'],
    ['Total length', formatLong(n.length, s.units), 'Length of every vein, to estimate plotter or laser time.'],
    ['Segment', L(s.segment), 'Distance between neighbouring vein points.'],
    ['Steps', stats.step.toLocaleString(), 'Growth steps since the roots.'],
    ['Speed', stats.rate ? `${Math.round(stats.rate).toLocaleString()} steps/s` : '—', 'Steps per second while growing.'],
  ]
  return <section className="measurements" aria-labelledby="measure-title">
    <h2 id="measure-title">Measurements</h2>
    <dl>{rows.map(([term, value, tip]) => <div key={term}><dt data-tip={tip} tabIndex={0}>{term}</dt><dd>{value}</dd></div>)}</dl>
  </section>
}, (a, b) => a.stats.revision === b.stats.revision && a.s === b.s && a.attractors === b.attractors && a.roots === b.roots)
