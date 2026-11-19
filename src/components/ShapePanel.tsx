import { memo } from 'react'
import type { Imported, RootPlacement } from '../lib/design'
import { matchPreset, presetSize, SHEET_PRESETS } from '../lib/presets'
import { clearanceMax, LIMITS, marginMax, type Settings } from '../lib/settings'
import { formatLength, pixelSize, type Units } from '../lib/units'
import type { ShapeKind } from '../veins/shapes'
import { Button, LengthField, NumberField, Section, Segmented, SwitchField, type Option } from './Controls'
import { Icon } from './Icon'
import { touchFirst } from '../lib/touch'

export type Change = (patch: Partial<Settings>, key?: string | null) => void

const UNITS: Option<Units>[] = [
  { value: 'mm', label: 'mm', tip: 'Show lengths in millimetres.' },
  { value: 'in', label: 'in', tip: 'Show lengths in inches, which SVG and DXF files are then written in too.' },
  { value: 'pt', label: 'pt', tip: 'Show lengths in points (72 per inch), as Illustrator does, with SVG files sized in points.' },
  { value: 'px', label: 'px', tip: 'Show lengths in pixels at the pixels per inch below, for screen graphics.' },
]
const shapes = (imported: boolean): Option<ShapeKind>[] => [
  { value: 'leaf', label: 'Leaf', tip: 'Grow inside a leaf outline that fits the sheet, from its base.' },
  { value: 'ellipse', label: 'Ellipse', tip: 'Grow inside the circle or oval that fits the sheet, inset by the margin.' },
  { value: 'rect', label: 'Rectangle', tip: 'Grow inside the sheet, inset by the margin.' },
  { value: 'ring', label: 'Ring', tip: 'Grow inside a ring: the hole in the middle is an obstacle the veins go round.' },
  { value: 'tree', label: 'Tree', tip: 'A round crown on a narrow trunk: a vein climbs the trunk and branches in the crown.' },
  { value: 'imported', label: 'Imported', tip: 'Grow inside the closed shapes of an SVG you imported, where shapes inside shapes are holes.', unavailable: !imported && 'Import an SVG first, with the button below.' },
]
const ROOTS: { id: RootPlacement; label: string; tip: string }[] = [
  { id: 'shape', label: 'Default', tip: 'Where this shape starts: a leaf’s base, an ellipse’s centre, the base of each part of a drawing.' },
  { id: 'base', label: 'Base', tip: 'A root at the bottom middle of the shape, or of each part of a drawing.' },
  { id: 'centre', label: 'Centre', tip: 'A root in the middle of the shape, or of each part of a drawing.' },
  { id: 'row', label: 'Row', tip: 'A row of roots along the bottom of the shape or of each part, for parallel veins, as in grass.' },
  { id: 'edge', label: 'Edge', tip: 'Roots spaced round the outline of the shape or of each part, growing inward.' },
]

// Whether the sheet is no longer the imported page's size, as after a typed width.
const resized = (s: Settings, imported: Imported) => Math.abs(s.width - imported.width) > 1e-6 || Math.abs(s.height - imported.height) > 1e-6

const ASSUMED = {
  css: 'The file doesn’t say how big it is, so it was read at 96 units per inch, the web standard. Check the width and height.',
  illustrator: 'The file doesn’t say how big it is. It looks like it came from Illustrator, so it was read at 72 points per inch, as Illustrator writes it.',
  points: 'The file doesn’t say how big it is; it was read at 72 points per inch, as Illustrator writes it, as you chose.',
}

export const ShapePanel = memo(function ShapePanel({ s, imported, rootCount, change, onImport, onRoots, importNotes, onIllustratorSize }: {
  s: Settings; imported: Imported | null; rootCount: number; change: Change; onImport: () => void; onRoots: (placement: RootPlacement) => void
  importNotes: string[] | null; onIllustratorSize: () => void
}) {
  const preset = matchPreset(s.width, s.height, s.units, s.dpi)
  const [pw, ph] = pixelSize(s.width, s.height, s.dpi)
  const aspect = s.shape === 'imported' && imported ? imported.width / imported.height : null
  return <>
    <Section title="Sheet">
      <label className="field" data-tip="Common sizes, each setting the sheet’s size and units.">
        <span className="field-label"><span>Preset</span></span>
        <select value={preset} onChange={event => {
          const p = SHEET_PRESETS.find(item => item.id === event.currentTarget.value)
          if (!p) return
          const [width, height] = presetSize(p, s.dpi)
          change({ width, height, units: p.units }, 'preset')
        }}>
          <option value="custom">Custom…</option>
          {SHEET_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <Segmented label="Units" options={UNITS} value={s.units} onChange={units => change({ units }, 'units')} />
      <div className="pair">
        <LengthField label="Width" mm={s.width} min={LIMITS.width[0]} max={LIMITS.width[1]} units={s.units} dpi={s.dpi} compact
          tip={aspect ? 'Sheet width: the height follows, so the imported shape keeps its proportions.' : 'Sheet width: changing the sheet places the attractors again and starts the veins over.'}
          onChange={width => change(aspect ? { width, height: width / aspect } : { width }, 'width')} />
        <Button className="icon-button swap" label="Swap width and height" tip="Swap width and height, to turn the sheet on its side."
          unavailable={Boolean(aspect) && 'Swapping would stretch the imported shape: rotate it in your drawing app instead.'}
          onClick={() => change({ width: s.height, height: s.width }, 'swap')}><Icon name="swap" /></Button>
        <LengthField label="Height" mm={s.height} min={LIMITS.height[0]} max={LIMITS.height[1]} units={s.units} dpi={s.dpi} compact
          tip={aspect ? 'Sheet height: the width follows, keeping the imported shape’s proportions.' : 'Sheet height.'}
          onChange={height => change(aspect ? { height, width: height * aspect } : { height }, 'height')} />
      </div>
      <NumberField label="Pixels per inch" value={s.dpi} min={LIMITS.dpi[0]} max={LIMITS.dpi[1]} suffix="ppi"
        tip={`Resolution of PNG exports and of pixel units: this sheet is ${pw.toLocaleString()} × ${ph.toLocaleString()} px at ${s.dpi} ppi.`}
        onChange={value => {
          const dpi = Math.min(LIMITS.dpi[1], Math.max(LIMITS.dpi[0], Math.round(value)))
          // A sheet set in pixels keeps its pixels, as a 1080 px post should: its size in millimetres follows.
          if (s.units === 'px' && dpi !== s.dpi) change({ dpi, width: (s.width * s.dpi) / dpi, height: (s.height * s.dpi) / dpi }, 'dpi')
          else change({ dpi }, 'dpi')
        }} />
    </Section>

    <Section title="Shape">
      <Segmented label="Shape" hideLabel options={shapes(Boolean(imported))} value={s.shape} columns={3} onChange={shape => change({ shape }, 'shape')} />
      <LengthField label="Margin" mm={s.margin} min={0} max={marginMax(s)} units={s.units} dpi={s.dpi}
        unavailable={s.shape === 'imported' && 'An imported shape keeps its own position on its page.'}
        tip="Space between the sheet’s edge and the shape." onChange={margin => change({ margin }, 'margin')} />
      <LengthField label="Edge clearance" mm={s.clearance} min={0} max={clearanceMax(s)} units={s.units} dpi={s.dpi}
        tip="How far vein centre lines stay inside the edges and holes; 0 lets veins reach the outline."
        onChange={clearance => change({ clearance }, 'clearance')} />
      {s.clearance > 0 && <p className="hint">Measured to each vein’s centre line: for a clear gap, keep it above half the widest vein near the edge.</p>}
      <SwitchField label="Grow outside the shape" checked={s.invert}
        tip="Grow in the sheet around the shape instead, so veins wrap round it as an obstacle." onChange={invert => change({ invert }, 'invert')} />
      <div className="button-row single">
        <Button tip="Use an SVG’s closed shapes as the shape: shapes inside shapes are holes, and the sheet becomes its page." onClick={onImport}>
          <Icon name="import" />Import SVG shape…</Button>
      </div>
      {s.shape === 'imported' && imported && <p className="hint">
        {imported.name}: {imported.rings.length} {imported.rings.length === 1 ? 'outline' : 'outlines'}, page {formatLength(imported.width, s.units, s.dpi)} × {formatLength(imported.height, s.units, s.dpi)}
        {resized(s, imported) ? ', fitted to the sheet with its proportions kept.' : '.'}
        {imported.sized !== 'file' && !resized(s, imported) ? ` ${ASSUMED[imported.sized]}` : ''}
        {importNotes?.length ? ` ${importNotes.join(' ')}` : ''}
      </p>}
      {s.shape === 'imported' && imported?.sized === 'css' && !resized(s, imported) && <div className="button-row single">
        <Button tip="Illustrator writes 72 points per inch: read this file again at that size, a third larger." onClick={onIllustratorSize}>Read at 72 points per inch</Button>
      </div>}
    </Section>

    <Section title="Roots" tip="Where veins start: each root grows its own network, and networks compete for space.">
      <div className="button-row roots-row">
        {ROOTS.map(r => <Button key={r.id} tip={r.tip} onClick={() => onRoots(r.id)}>{r.label}</Button>)}
      </div>
      <p className="hint">{rootCount ? `${rootCount} ${rootCount === 1 ? 'root' : 'roots'}.` : 'No roots yet.'} {touchFirst()
        ? 'Use the Roots tool to add one where you tap, drag one to move it, or press and hold one to remove it.'
        : 'Use the Roots tool to add one where you click, drag one to move it, or Alt-click one to remove it.'}</p>
    </Section>
  </>
})
