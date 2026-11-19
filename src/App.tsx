import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dock, Inspector, ViewBar, type ViewKey } from './components/Bars'
import { FilePanel, type ExportKind } from './components/FilePanel'
import { GrowPanel } from './components/GrowPanel'
import { ConfirmDialog, HelpDialog, QuickStart, type Pending } from './components/Help'
import { ShapePanel } from './components/ShapePanel'
import { Stage, type StageControls, type Tool } from './components/Stage'
import { StylePanel } from './components/StylePanel'
import { TabPanel, Tabs } from './components/Tabs'
import { TooltipLayer } from './components/Tooltip'
import type { Vec } from './veins/geometry'
import { randomSeed } from './veins/random'
import { fitToSheet, freshDesign, hasGrown, MAX_PART_ROOTS, partsOf, regionOf, rootsFor, shapeRings, startRoots, unrootedParts, type Design, type Imported, type RootPlacement } from './lib/design'
import { designDxf } from './lib/dxfExport'
import { pngProblem, renderPng } from './lib/pngExport'
import { readPicture, PictureError, type PictureData } from './lib/picture'
import { EXTENSION, parseProject, ProjectError, projectJson } from './lib/project'
import { saveFile } from './lib/saveFile'
import { keepSession, type Kept } from './lib/session'
import { forExport, sceneContents, sceneOf } from './lib/scene'
import { applyPreset, DEFAULTS, PRESETS, type PresetName, type Settings } from './lib/settings'
import { designSvg } from './lib/svgExport'
import { atIllustratorSize, shapeFromDrawing } from './lib/importShape'
import { readSvgDrawing, SvgShapeError } from './lib/svgImport'
import { formatLength, pixelSize, toUnits, trimZeros, UNIT_LABEL } from './lib/units'
import { useVeins, type Status } from './useVeins'
import { version } from '../package.json'
import { touchFirst } from './lib/touch'
import { useMedia } from './useMedia'

type TabId = 'grow' | 'shape' | 'style' | 'file'
// Written into project files; it comes from package.json, so it moves with every release.
const APP_VERSION = version
const SESSION_KEY = 'vessel-studio:session'
const SESSION_UNSAVED_KEY = 'vessel-studio:session-unsaved'
const QUICK_START_KEY = 'vessel-studio:quick-start-dismissed'
// Local storage holds about 5 MB; a session bigger than this isn't kept, and the page says so.
const SESSION_LIMIT = 4_500_000

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); return true } catch { return false } },
  remove: (key: string) => { try { localStorage.removeItem(key) } catch { /* nothing to remove */ } },
}

// The last session comes back after a reload or a closed tab, so work is never lost to an accident.
function initialDesign(): { design: Design; saved: boolean; restored: boolean; off: number } {
  const text = storage.get(SESSION_KEY)
  if (text) {
    try {
      const { design, off } = fitToSheet(parseProject(text))
      return { design, saved: storage.get(SESSION_UNSAVED_KEY) !== '1' && !off, restored: true, off }
    } catch { /* an unreadable session starts fresh */ }
  }
  return { design: freshDesign(DEFAULTS, null, null), saved: true, restored: false, off: 0 }
}

// What opening a project made before 1.3.0 did with attractors off the sheet, in words.
const offSheet = (off: number, grown: boolean) => off
  ? ` It was made before shapes were trimmed to the sheet: ${off.toLocaleString()} ${off === 1 ? 'attractor' : 'attractors'} off the sheet ${grown ? `${off === 1 ? 'was' : 'were'} set aside, as no vein can reach ${off === 1 ? 'it' : 'them'}` : `${off === 1 ? 'was' : 'were'} placed again on it`}.`
  : ''

const baseName = (s: Settings, imported: Imported | null) => {
  if (s.shape === 'imported' && imported) return `${imported.name.replace(/\.svg$/i, '')}-veins`
  const unit = s.units
  const v = (mm: number) => trimZeros(toUnits(mm, unit, s.dpi).toFixed(unit === 'in' ? 2 : unit === 'px' || unit === 'pt' ? 0 : 1))
  return `vessel-studio-${s.shape}-${v(s.width)}x${v(s.height)}${UNIT_LABEL[unit]}`
}

// A share of a whole, which a handful in thousands doesn't round to 0.0 %.
const share = (part: number, whole: number): string => {
  const pct = (part / Math.max(1, whole)) * 100
  return pct > 0 && pct < 0.05 ? 'under 0.1 %' : `${pct.toFixed(1)} %`
}

const SHAPE_NAME: Record<Settings['shape'], string> = { leaf: 'Leaf', ellipse: 'Ellipse', rect: 'Rectangle', ring: 'Ring', tree: 'Tree', imported: 'Imported' }

const DONE_TEXT = (done: string, live: number, total: number, outside = false, unrooted = 0): string => {
  const left = `${live.toLocaleString()} ${live === 1 ? 'attractor was' : 'attractors were'}`
  switch (done) {
    case 'reached': return 'Grown: every attractor reached.'
    case 'stalled': {
      if (!live) return 'Grown.'
      // In a shape of separate parts, a part with no root never grows: say what to do about it.
      const hint = unrooted ? ` ${unrooted.toLocaleString()} ${unrooted === 1 ? 'part has' : 'parts have'} no root, so can’t grow: Default, under Roots on the Shape tab, puts one in each.` : ''
      return `Grown. ${left} left where no vein could grow (${share(live, total)}).${hint}`
    }
    case 'out-of-reach': return `Stopped: ${live === 1 ? 'the attractor left is' : `the ${live.toLocaleString()} attractors left are`} beyond the attraction distance of every vein. Raise the attraction distance, or turn its limit off.`
    case 'cap': return 'Stopped at 400,000 vein points, the most this page grows. Use fewer attractors or a longer segment.'
    case 'empty': return `There are no roots. Pick the Roots tool and ${touchFirst() ? 'tap' : 'click'} ${outside ? 'in the space round the shape' : 'inside the shape'} to add one.`
    default: return ''
  }
}

export function App() {
  const [first] = useState(initialDesign)
  const [status, setStatus] = useState<Status>(() => (first.restored ? { text: `Restored your last session.${offSheet(first.off, hasGrown(first.design))}` } : null))
  const [picture, setPicture] = useState<PictureData | null>(null)
  const model = useVeins(() => first, setStatus, picture)
  const { design, stats } = model
  const s = design.settings
  const [tab, setTab] = useState<TabId>('grow')
  const [tool, setTool] = useState<Tool>('roots')
  const [zoom, setZoom] = useState(1)
  const [showHelp, setShowHelp] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(() => storage.get(QUICK_START_KEY) !== '1')
  // On a phone the quick start goes below the sheet, so the sheet it talks about stays in view.
  const phone = useMedia('(max-width: 599px)')
  const [pending, setPending] = useState<Pending | null>(null)
  const [openError, setOpenError] = useState('')
  const [sessionKept, setSessionKept] = useState<Kept>('kept')
  // What the last import said, kept on the Shape tab while that outline is in use.
  const [importNotes, setImportNotes] = useState<{ rings: Vec[][]; text: string[] } | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<StageControls | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const svgInput = useRef<HTMLInputElement>(null)
  const pictureInput = useRef<HTMLInputElement>(null)

  // Routine messages fade back to the counts; warnings stay until something else happens.
  useEffect(() => {
    if (!status || status.warning) return
    const timer = window.setTimeout(() => setStatus(null), 6000)
    return () => window.clearTimeout(timer)
  }, [status])

  const rings = useMemo(() => shapeRings(s, design.imported), [s, design.imported])
  // Built again only when the sheet or the shape changes, not for every setting: a drawing of many outlines takes
  // tens of milliseconds to build.
  const { width: sheetW, height: sheetH, margin, shape, invert } = s
  const region = useMemo(() => regionOf({ ...DEFAULTS, width: sheetW, height: sheetH, margin, shape, invert }, design.imported), [sheetW, sheetH, margin, shape, invert, design.imported])
  const parts = useMemo(() => region.parts(), [region])
  const unrooted = useMemo(() => unrootedParts(parts, design.roots), [parts, design.roots])
  // The veins as the worker last sent them: a new view with every frame.
  const { net, mirror } = model
  const scene = useMemo(() => sceneOf(s, rings, net, design.attractors, mirror.used, design.roots), [s, rings, net, design.attractors, design.roots, mirror])
  const contents = sceneContents(scene)

  // Keep a copy of the session a moment after the last change, while nothing is growing.
  const { current, running, unsaved: unsavedNow } = model
  const keep = useCallback((unsavedFlag: boolean) => {
    // A project file takes about 46 characters a vein point; at 30 a point, the estimate errs low, so a design that
    // would fit is never turned away.
    const d = current()
    setSessionKept(keepSession(storage, SESSION_KEY, SESSION_UNSAVED_KEY, () => projectJson(d, APP_VERSION), unsavedFlag, SESSION_LIMIT, d.growth.x.length * 30))
  }, [current])
  useEffect(() => {
    if (running) return
    const timer = window.setTimeout(() => keep(unsavedNow), 800)
    return () => window.clearTimeout(timer)
  }, [design, running, unsavedNow, keep])
  // While veins grow, keep a copy every few seconds and whenever the page is hidden or closed. A copy made
  // mid-run counts as unsaved.
  useEffect(() => {
    const now = () => keep(unsavedNow || running)
    const hidden = () => { if (document.visibilityState === 'hidden') now() }
    window.addEventListener('pagehide', now)
    document.addEventListener('visibilitychange', hidden)
    const timer = running ? window.setInterval(now, 5000) : undefined
    return () => { window.removeEventListener('pagehide', now); document.removeEventListener('visibilitychange', hidden); window.clearInterval(timer) }
  }, [running, unsavedNow, keep])

  // A tap or click on a control that can't be used yet says why in the status line: touch screens show no tooltips.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const off = event.target instanceof Element ? event.target.closest<HTMLElement>('[aria-disabled="true"][data-tip]') : null
      if (off?.dataset.tip) setStatus({ text: off.dataset.tip })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Asks before discarding unsaved work, in an in-app dialog (embedded browsers can block confirm()).
  const guard = useCallback((when: boolean, p: Pending) => { if (when) setPending(p); else p.run() }, [])
  const { change, unsaved } = model

  const newDesign = () => guard(unsaved, {
    title: 'Start a new design?', confirm: 'Discard and start new',
    body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
    run: () => { void model.replace(freshDesign({ ...DEFAULTS, seed: randomSeed() }, null, null)); setStatus({ text: 'New design.' }) },
  })

  const openProject = () => guard(unsaved, {
    title: 'Open another project?', confirm: 'Discard and open',
    body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
    run: () => fileInput.current?.click(),
  })

  const readProject = async (file: File) => {
    try {
      const { design: opened, off } = fitToSheet(parseProject(await file.text()))
      await model.replace(opened)
      // Attractors placed again or set aside are a change the file doesn't have yet.
      if (!off) model.markSaved()
      setOpenError('')
      setStatus({ text: `Opened ${file.name}.${offSheet(off, hasGrown(opened))}` })
    } catch (error) {
      // The current design stays as it was.
      setOpenError(error instanceof ProjectError ? error.message : `${file.name} could not be read.`)
      setTab('file')
    }
  }

  // An SVG's closed shapes become the shape veins grow in, on a sheet the size of its page.
  const importSvg = () => guard(unsaved && stats.step > 0, {
    title: 'Replace the grown veins?', confirm: 'Import',
    body: 'An imported shape starts the growth again in its outline. Undo brings the current veins back.',
    run: () => svgInput.current?.click(),
  })

  const readSvg = async (file: File) => {
    try {
      const drawing = readSvgDrawing(await file.text())
      const cur = model.current().settings
      const shape = shapeFromDrawing(drawing, file.name, cur.units, cur.dpi)
      if ('error' in shape) { setStatus({ text: shape.error, warning: true }); return }
      const { imported } = shape
      const next = await change({ width: imported.width, height: imported.height, shape: 'imported', invert: false, units: shape.units }, null, { imported })
      setTab('shape')
      // The notes stay on the Shape tab after the status line moves on.
      setImportNotes({ rings: imported.rings, text: [...shape.notes, ...shape.warnings].filter(t => !t.startsWith('The file doesn’t say its size')) })
      const outlines = imported.rings.length
      // A page of small text can have more parts than get a root each, and parts too thin for a root at this
      // segment length: say so, as those won't grow.
      const left = unrootedParts(partsOf(shapeRings(next.settings, next.imported)), next.roots)
      const many = [
        shape.parts > MAX_PART_ROOTS ? `It has ${shape.parts.toLocaleString()} separate parts; the ${MAX_PART_ROOTS} largest get a root each, and the Roots tool adds more.` : '',
        !next.roots.length ? `No part of it is wide enough for a root with ${formatLength(next.settings.segment, next.settings.units, next.settings.dpi)} segments: lower Segment length on the Grow tab, then press Default under Roots.`
          : left ? `${left.toLocaleString()} of its parts ${left === 1 ? 'is' : 'are'} too thin for a root with ${formatLength(next.settings.segment, next.settings.units, next.settings.dpi)} segments; a shorter Segment length roots ${left === 1 ? 'it' : 'them'} too.` : '',
      ].filter(Boolean)
      setStatus({ text: [`Using ${file.name}: ${outlines} ${outlines === 1 ? 'outline' : 'outlines'}.`, ...shape.notes, ...shape.warnings, ...many].join(' '), warning: shape.warnings.length + many.length > 0 })
    } catch (error) {
      setStatus({ text: error instanceof SvgShapeError ? error.message : `${file.name} could not be read as an SVG.`, warning: true })
    }
  }

  const illustratorSize = async () => {
    const cur = model.current()
    if (!cur.imported) return
    const { units, dpi } = cur.settings
    const { imported, warnings } = atIllustratorSize(cur.imported, units, dpi)
    await change({ width: imported.width, height: imported.height }, null, { imported })
    // The import's notes still hold for the outline read at the new size.
    setImportNotes(notes => (notes && notes.rings === cur.imported?.rings ? { rings: imported.rings, text: [...notes.text, ...warnings] } : notes))
    setStatus({ text: [`Read at 72 points per inch, as Illustrator writes it: the page is now ${formatLength(imported.width, units, dpi)} × ${formatLength(imported.height, units, dpi)}.`, ...warnings].join(' '), warning: warnings.length > 0 })
  }

  const readPictureFile = async (file: File) => {
    try {
      const pic = await readPicture(file)
      setPicture(pic)
      model.pictureChanged(pic)
      if (model.current().settings.placement !== 'picture') change({ placement: 'picture' }, 'placement')
      // A picture with nothing dark in it spreads the attractors evenly, which is rarely what was meant.
      let darkest = 0
      for (let i = 0; i < pic.dark.length; i++) if (pic.dark[i] > darkest) darkest = pic.dark[i]
      if (darkest < 0.05) setStatus({ text: `${file.name} is almost white, so the attractors are spread evenly. Choose a picture that’s darker where veins should crowd.`, warning: true })
      else setStatus({ text: `Using ${file.name}: darker areas get more attractors. The picture isn’t saved in the project; its attractors are.` })
    } catch (error) {
      setStatus({ text: error instanceof PictureError ? error.message : `${file.name} could not be read as a picture.`, warning: true })
    }
  }

  // Files dropped on the window: SVGs become the shape, pictures set the density, project files open.
  useEffect(() => {
    const over = (event: DragEvent) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault() }
    const drop = (event: DragEvent) => {
      const file = event.dataTransfer?.files[0]
      if (!file) return
      event.preventDefault()
      if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') guard(unsaved && stats.step > 0, {
        title: 'Replace the grown veins?', confirm: 'Import',
        body: 'An imported shape starts the growth again in its outline. Undo brings the current veins back.',
        run: () => void readSvg(file),
      })
      else if (/\.json$/i.test(file.name)) guard(unsaved, {
        title: 'Open another project?', confirm: 'Discard and open',
        body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
        run: () => void readProject(file),
      })
      else if (file.type.startsWith('image/')) void readPictureFile(file)
      else setStatus({ text: `${file.name} isn’t an SVG, a picture or a Vessel Studio project.`, warning: true })
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  })

  const report = (name: string, result: Awaited<ReturnType<typeof saveFile>>) => {
    if (result === 'saved' || result === 'downloaded') setStatus({ text: `${result === 'saved' ? 'Saved' : 'Downloaded'} ${name}.` })
    else if (result === 'failed') setStatus({ text: `${name} could not be saved.`, warning: true })
    return result === 'saved' || result === 'downloaded'
  }

  const busy = (model.running || model.stopping) && 'Pause the growth first, so the file has the finished veins.'

  const saveProject = async () => {
    if (busy) { setStatus({ text: busy }); return }
    const name = `${baseName(s, design.imported)}${EXTENSION}`
    if (report(name, await saveFile(name, projectJson(model.current(), APP_VERSION), 'application/json', 'Vessel Studio project'))) model.markSaved()
  }

  const exportFile = async (kind: ExportKind) => {
    if (busy) return
    const d = model.current()
    const shown = sceneOf(d.settings, shapeRings(d.settings, d.imported), { ...d.growth, points: d.growth.x.length }, d.attractors, d.growth.used, d.roots)
    if (!sceneContents(shown).length) { setStatus({ text: 'Nothing is shown, so there’s nothing to export.', warning: true }); return }
    // Curves that stay inside the shape and clear of its edges, as the veins themselves do.
    const sc = forExport(shown, d.settings, regionOf(d.settings, d.imported))
    const base = baseName(s, d.imported)
    if (kind === 'svg') report(`${base}.svg`, await saveFile(`${base}.svg`, designSvg(sc, d.settings), 'image/svg+xml', 'SVG drawing'))
    if (kind === 'dxf') report(`${base}.dxf`, await saveFile(`${base}.dxf`, designDxf(sc, d.settings), 'application/dxf', 'DXF drawing'))
    if (kind === 'png') {
      const [w, h] = pixelSize(s.width, s.height, s.dpi)
      const problem = pngProblem(w, h)
      if (problem) { setStatus({ text: problem, warning: true }); return }
      setStatus({ text: `Drawing a ${w.toLocaleString()} × ${h.toLocaleString()} px PNG…` })
      const blob = await renderPng(sc, d.settings, w, h)
      if (!blob) { setStatus({ text: 'The browser could not draw a PNG this large. Lower the pixels per inch.', warning: true }); return }
      report(`${base}.png`, await saveFile(`${base}.png`, blob, 'image/png', 'PNG image'))
    }
  }

  const preset = (name: PresetName) => {
    const cur = model.current()
    const next = applyPreset(cur.settings, name)
    // A picture chosen to place attractors stays in charge of them.
    const keepsPicture = cur.settings.placement === 'picture' && picture !== null
    if (keepsPicture) next.placement = 'picture'
    const p = PRESETS.find(item => item.id === name)!
    const region = regionOf(next, cur.imported)
    // Roots placed by hand stay where they were put, as long as the shape does.
    const handRoots = !cur.rootsBy && next.shape === cur.settings.shape && cur.roots.length > 0
    const roots = handRoots ? rootsFor(next, region, cur.roots) : startRoots(next, region, p.roots)
    change(next, 'preset', { roots, rootsBy: handRoots ? undefined : p.roots, quiet: true })
    // A preset brings its own built-in shape; say so when that replaces the one chosen.
    const shapeNote = next.shape === 'imported' ? ' Your imported shape stays.'
      : next.shape !== cur.settings.shape ? ` It uses the ${SHAPE_NAME[next.shape]} shape; choose another on the Shape tab.` : ''
    setStatus({ text: `${p.label}: ${p.tip}${shapeNote}${handRoots ? ' Your roots stay where you put them.' : ''}${keepsPicture ? ' Your picture still places the attractors.' : ''}` })
  }
  const placeRoots = (placement: RootPlacement) => {
    const cur = model.current()
    const roots = startRoots(cur.settings, regionOf(cur.settings, cur.imported), placement)
    if (!roots.length) { setStatus({ text: 'No room for roots there in this shape.', warning: true }); return }
    // Leaf growth grows each part out from its first root, so the rest of a row or a ring of roots would wait on it:
    // it goes off, in the same step as the roots, so one Undo brings both back.
    const many = (placement === 'row' || placement === 'edge') && cur.settings.leafGrowth
    if (many) {
      void change({ leafGrowth: false }, null, { roots, rootsBy: placement, quiet: true })
      setStatus({ text: 'Leaf growth is now off, so every root grows at once instead of waiting for the shape to grow out from the first. Turn it on again on the Grow tab.' })
      return
    }
    void model.setRoots(roots, null, undefined, placement)
    setStatus(null)
  }
  // Moving or removing a root starts the veins again, so once they've grown it asks first, as Reset does: a stray
  // drag, Alt-click, or a finger held on a root, would otherwise throw a long run away, saved or not.
  const grown = stats.step > 0
  const moveRoot = (index: number, x: number, y: number) => guard(grown, {
    title: 'Move the root?', confirm: 'Move',
    body: 'The veins start again from the roots where they are now. Undo brings them back.',
    run: () => void model.setRoots(design.roots.map((r, i): Vec => (i === index ? [x, y] : r)), 'move-root'),
  })
  const removeRoot = (index: number) => {
    const last = design.roots.length <= 1
    guard(grown, {
      title: last ? 'Remove the last root?' : 'Remove the root?', confirm: 'Remove',
      body: last ? 'The veins go, and nothing grows until you add a root. Undo brings them back.' : 'The veins start again from the other roots. Undo brings them back.',
      run: () => void model.setRoots(design.roots.filter((_, i) => i !== index), null,
        last ? 'Removed the last root. Add one with the Roots tool to grow again.' : grown ? 'Removed a root; the veins started again from the others. Undo brings them back.' : 'Removed a root. Undo brings it back.'),
    })
  }

  const noRoots = stats.points === 0 && `There are no roots. Pick the Roots tool and ${touchFirst() ? 'tap' : 'click'} ${s.invert ? 'in the space round the shape' : 'inside the shape'} to add one.`
  const noAttractors = design.attractors.length === 0 && 'There are no attractors to grow toward. Raise the count on the Grow tab, or choose another shape.'
  const finished = stats.done && stats.done !== 'empty' && `${DONE_TEXT(stats.done, stats.live, design.attractors.length / 2, s.invert, unrooted)} Reset to grow again, change a growth setting, or add a root.`
  const canGrow = noRoots || noAttractors || finished || false
  const resetBlocked = stats.step === 0 && stats.points === design.roots.length && !model.running && 'The veins are already at their roots.'
  const reset = () => guard(stats.step > 0, {
    title: 'Reset the veins?', confirm: 'Reset',
    body: 'The veins go back to their roots and grow again from there. Undo brings them back.',
    run: () => { void model.reset(); setStatus({ text: 'Back to the roots. Undo brings the veins back.' }) },
  })
  // Growing clears old messages so the counts show; pausing says so briefly.
  const grow = () => { setStatus(null); if (showQuickStart) closeQuickStart(); model.play() }
  const pause = () => { model.pause(); setStatus({ text: 'Paused. Press Grow to carry on.' }) }
  const toggleGrow = () => { if (model.running) pause(); else if (!canGrow) grow(); else setStatus({ text: canGrow }) }
  const toggle = (key: ViewKey) => change({ [key]: !s[key] }, key)
  const shuffle = useCallback(() => change({ seed: randomSeed() }, 'seed'), [change])
  const closeQuickStart = () => { setShowQuickStart(false); storage.set(QUICK_START_KEY, '1') }

  // Keyboard shortcuts, ignored while typing. Re-registered each render so handlers see current state.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      // Sliders and switches take no typed letters, so shortcuts still work while one has focus.
      const typing = Boolean(target?.closest('input:not([type=range]):not([type=checkbox]), select, textarea'))
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') { setShowHelp(false); setPending(null); if (!typing) setTool('roots'); return }
      if (pending || showHelp) return
      if (mod && key === 's') { event.preventDefault(); void saveProject(); return }
      if (mod && key === 'o') { event.preventDefault(); openProject(); return }
      if (typing) return
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) void model.redo(); else void model.undo(); return }
      if (mod && key === 'y') { event.preventDefault(); void model.redo(); return }
      if (mod || event.altKey) return
      if (key === 's') { if (!model.running && !canGrow) { setStatus(null); model.step() } }
      else if (key === 'r') { if (!resetBlocked) reset() }
      else if (key === 'o') setTool('roots')
      else if (key === 'h') setTool('pan')
      else if (key === '1') toggle('showVeins')
      else if (key === '2') toggle('showAttractors')
      else if (key === '3') toggle('showBoundary')
      else if (key === '4') toggle('showRoots')
      else if (key === 'f' || key === '0') stageRef.current?.fit()
      else if (key === '+' || key === '=') stageRef.current?.zoomBy(1.25)
      else if (key === '-' || key === '_') stageRef.current?.zoomBy(1 / 1.25)
      else if (event.key === '?') setShowHelp(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const counts = `${stats.points.toLocaleString()} vein ${stats.points === 1 ? 'point' : 'points'} · ${stats.live.toLocaleString()} ${stats.live === 1 ? 'attractor' : 'attractors'} left · step ${stats.step.toLocaleString()}`
  const doneText = stats.done ? DONE_TEXT(stats.done, stats.live, design.attractors.length / 2, s.invert, unrooted) : ''
  const statusText = status?.text ?? (model.stopping ? 'Stopping after the current step…'
    : model.running ? `Growing · ${counts}` : doneText ? (stats.done === 'out-of-reach' || stats.done === 'cap' ? doneText : `${doneText} ${counts}`) : counts)

  return <main className="studio">
    <TooltipLayer />
    <div className="stage">
      <Stage scene={scene} settings={s} roots={design.roots} region={region} tool={tool} frameRef={frameRef} controlRef={stageRef}
        onAddRoot={(x, y, moved) => {
          model.addRoot(x, y)
          const where = moved === 'outside' ? ' That point was outside the shape, so the root went just inside it.'
            : moved === 'clearance' ? ' It was moved in from the edge, to keep the edge clearance.' : ''
          setStatus({ text: `${stats.step > 0 ? 'Added a root: it grows a vein of its own. Undo removes it.' : 'Added a root.'}${where}` })
        }}
        onMoveRoot={moveRoot} onRemoveRoot={removeRoot} onZoom={setZoom} onNotice={text => setStatus({ text })}
        onSpaceTap={() => { if (!pending && !showHelp) toggleGrow() }} />
    </div>

    <header className="brand glass">
      <div><p className="app-kicker" data-tip="How it works: points are scattered in the shape, and veins grow toward them, using up each one they reach.">Space colonization</p><h1>Vessel Studio</h1></div>
      <button type="button" className="icon-button" aria-label="Keyboard shortcuts and help" data-tip="Keyboard shortcuts and the quick start." data-key="?" onClick={() => setShowHelp(true)}>?</button>
    </header>

    <aside className="sidebar side-panel glass" aria-label="Design controls">
      <Tabs label="Design controls" idBase="design" value={tab} onChange={setTab} tabs={[
        { id: 'grow', label: 'Grow', title: 'Presets, attractors, and how the veins grow.' },
        { id: 'shape', label: 'Shape', title: 'Sheet size, the shape veins grow inside, and where they start.' },
        { id: 'style', label: 'Style', title: 'Vein widths by Murray’s law, colours and curves.' },
        { id: 'file', label: 'File', title: 'Save or open a project, and export SVG, DXF or PNG.', badge: unsaved ? 'unsaved changes' : undefined },
      ]} />
      <TabPanel idBase="design" id="grow" value={tab}>
        <GrowPanel s={s} change={change} onPreset={preset} onShuffle={shuffle} picture={picture?.name ?? null} onPicture={() => pictureInput.current?.click()} />
      </TabPanel>
      <TabPanel idBase="design" id="shape" value={tab}>
        <ShapePanel s={s} imported={design.imported} rootCount={design.roots.length} change={change} onImport={importSvg} onRoots={placeRoots}
          importNotes={importNotes && design.imported?.rings === importNotes.rings ? importNotes.text : null} onIllustratorSize={() => void illustratorSize()} />
      </TabPanel>
      <TabPanel idBase="design" id="style" value={tab}><StylePanel s={s} change={change} /></TabPanel>
      <TabPanel idBase="design" id="file" value={tab}>
        <FilePanel s={s} change={change} contents={contents} unsaved={unsaved} busy={busy} openError={openError} fromFile={s.shape === 'imported' && Boolean(design.imported)}
          onNew={newDesign} onOpen={openProject} onSave={() => void saveProject()} onExport={kind => void exportFile(kind)} />
        {sessionKept !== 'kept' && <p className="hint warning">{sessionKept === 'too-big' ? 'This design is too big to keep in the browser between visits.' : 'The browser won’t keep this design between visits.'} Save it as a project file.</p>}
      </TabPanel>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Choose a project file" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readProject(file)
      }} />
      <input ref={svgInput} type="file" accept=".svg,image/svg+xml" hidden aria-label="Choose an SVG shape" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readSvg(file)
      }} />
      <input ref={pictureInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden aria-label="Choose a picture" onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void readPictureFile(file)
      }} />
    </aside>

    <div className="center">
      <ViewBar tool={tool} setTool={setTool} s={s} toggle={toggle} zoom={zoom} onFit={() => stageRef.current?.fit()} onZoom={f => stageRef.current?.zoomBy(f)} />
      <div className="sheet-frame" ref={frameRef}>
        {showQuickStart && !phone && <QuickStart onClose={closeQuickStart} />}
      </div>
      <Dock running={model.running} stopping={model.stopping} canGrow={canGrow}
        onGrow={grow} onPause={pause} onStep={() => { setStatus(null); model.step() }} onReset={reset} canReset={resetBlocked}
        status={statusText} warning={status ? Boolean(status.warning) : !model.running && (stats.done === 'out-of-reach' || stats.done === 'cap')}
        canUndo={model.canUndo} canRedo={model.canRedo} onUndo={() => void model.undo()} onRedo={() => void model.redo()} />
    </div>

    {showQuickStart && phone && <QuickStart onClose={closeQuickStart} />}

    <aside className="inspector side-panel glass" aria-label="Measurements">
      <Inspector s={s} stats={stats} net={net} attractors={design.attractors.length / 2} roots={design.roots.length} />
    </aside>

    {pending && <ConfirmDialog pending={pending} onCancel={() => setPending(null)} />}
    {showHelp && <HelpDialog onClose={() => setShowHelp(false)} onQuickStart={() => {
      setShowHelp(false); setShowQuickStart(true)
      // After the dialog hands focus back, move it to the guide's button, which would be far down the Tab order.
      window.setTimeout(() => document.querySelector<HTMLElement>('.quick-start button')?.focus(), 0)
    }} />}
  </main>
}
