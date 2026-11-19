import { memo } from 'react'
import { listWords } from '../lib/listWords'
import { pngProblem } from '../lib/pngExport'
import type { Settings } from '../lib/settings'
import { pixelSize } from '../lib/units'
import { Button, Section, SwitchField } from './Controls'
import type { Change } from './ShapePanel'

export type ExportKind = 'svg' | 'dxf' | 'png'

// Memoised: the panel only re-renders when its own props change, not on every growth frame.
export const FilePanel = memo(function FilePanel({ s, change, contents, unsaved, busy, fromFile, onNew, onOpen, onSave, onExport, openError }: {
  s: Settings; change: Change; contents: string[]; unsaved: boolean; busy: string | false; fromFile: boolean
  onNew: () => void; onOpen: () => void; onSave: () => void; onExport: (kind: ExportKind) => void; openError: string
}) {
  const [pw, ph] = pixelSize(s.width, s.height, s.dpi)
  const pngBlocked = pngProblem(pw, ph)
  const fileUnits = s.units === 'in' ? 'inches' : s.units === 'pt' ? 'points' : s.units === 'px' ? 'pixels' : 'millimetres'
  const nothing = !contents.length && 'Nothing is shown, so there’s nothing to export. Turn on Veins, Shape, Attractors or Roots in the bar above the sheet.'
  const vectorParts = contents.filter(c => c !== 'the background')
  return <>
    <Section title="Project">
      <p className="hint save-state">{unsaved ? <><span className="dot" aria-hidden="true" />Unsaved changes since the last save.</> : 'All changes saved.'}</p>
      <div className="button-row three">
        <Button tip="Start a new design with the default settings." onClick={onNew}>New</Button>
        <Button tip="Open a Vein Studio project file (.vein.json)." shortcut="⌘O" onClick={onOpen}>Open…</Button>
        <Button className="primary" tip="Save the settings, shape, roots, attractors and every vein point as a project file you can reopen and keep growing exactly where it stopped." shortcut="⌘S" unavailable={busy} onClick={onSave}>Save</Button>
      </div>
      {openError && <p className="hint error" role="alert">{openError}</p>}
    </Section>

    <Section title="For Illustrator, plotters and lasers">
      <div className="button-row">
        <Button tip={`Veins as paths at real size, sized in ${fileUnits}, one path per vein between forks with its own width, each part on its own layer. Opens in Illustrator, Inkscape and laser software.`} unavailable={busy || nothing} onClick={() => onExport('svg')}>SVG</Button>
        <Button tip={`AutoCAD R12 DXF in ${s.units === 'in' ? 'inches' : 'millimetres'}: veins as centre-line polylines, each part on its own layer, for Fusion, CAD and CAM.`} unavailable={busy || nothing} onClick={() => onExport('dxf')}>DXF</Button>
      </div>
      <p className="hint">{nothing || `Exports hold what the view shows: ${listWords(vectorParts)}. SVG and DXF leave out the background, so laser software doesn’t engrave it. DXF has no line widths, so its veins are centre lines.`}
        {fromFile ? ' The page matches the imported SVG: open the SVG in Illustrator, copy it all, and use Edit › Paste in Place in your file to line it up with your artwork.' : ''}</p>
    </Section>

    <Section title="For images">
      <div className="button-row">
        <Button tip={`A ${pw.toLocaleString()} × ${ph.toLocaleString()} px image at ${s.dpi} pixels per inch.`} unavailable={busy || nothing || (pngBlocked ?? false)} onClick={() => onExport('png')}>PNG</Button>
      </div>
      <SwitchField label="Transparent background" checked={s.transparentPng} tip="Leave the sheet colour out of the PNG." onChange={transparentPng => change({ transparentPng }, 'transparentPng')} />
      <p className="hint">{pngBlocked ?? `PNG: ${pw.toLocaleString()} × ${ph.toLocaleString()} px. Exports always show the whole sheet at real size, whatever the zoom.`}</p>
    </Section>
  </>
})
