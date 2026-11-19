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
import { freshDesign, regionOf, shapeRings, startRoots, type Design, type Imported, type RootPlacement } from './lib/design'
import { designDxf } from './lib/dxfExport'
import { pngProblem, renderPng } from './lib/pngExport'
import { readPicture, PictureError, type PictureData } from './lib/picture'
import { EXTENSION, parseProject, ProjectError, projectJson } from './lib/project'
import { saveFile } from './lib/saveFile'
import { sceneContents, sceneOf } from './lib/scene'
import { applyPreset, DEFAULTS, LIMITS, PRESETS, type PresetName, type Settings } from './lib/settings'
import { designSvg } from './lib/svgExport'
import { readSvgDrawing, SvgShapeError } from './lib/svgImport'
import { pixelSize, toUnits, trimZeros, UNIT_LABEL } from './lib/units'
import { useVeins, type Status } from './useVeins'

type TabId = 'grow' | 'shape' | 'style' | 'file'
const APP_VERSION = '1.0.0'
const SESSION_KEY = 'vessel-studio:session'
const SESSION_UNSAVED_KEY = 'vessel-studio:session-unsaved'
const QUICK_START_KEY = 'vessel-studio:quick-start-dismissed'
// Local storage holds about 5 MB; a session bigger than this isn't kept, and the page says so.
const SESSION_LIMIT = 4_500_000

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); return true } catch { return false } },
}

// The last session comes back after a reload or a closed tab, so work is never lost to an accident.
function initialDesign(): { design: Design; saved: boolean; restored: boolean } {
  const text = storage.get(SESSION_KEY)
  if (text) {
    try { return { design: parseProject(text), saved: storage.get(SESSION_UNSAVED_KEY) !== '1', restored: true } } catch { /* an unreadable session starts fresh */ }
  }
  return { design: freshDesign(DEFAULTS, null, null, null), saved: true, restored: false }
}

const baseName = (s: Settings, imported: Imported | null) => {
  if (s.shape === 'imported' && imported) return `${imported.name.replace(/\.svg$/i, '')}-veins`
  const unit = s.units
  const v = (mm: number) => trimZeros(toUnits(mm, unit, s.dpi).toFixed(unit === 'in' ? 2 : unit === 'px' || unit === 'pt' ? 0 : 1))
  return `vessel-studio-${s.shape}-${v(s.width)}x${v(s.height)}${UNIT_LABEL[unit]}`
}

// Brings an imported drawing within the sheet's size limits, scaling it evenly if needed.
function fitPage(width: number, height: number): number {
  const big = Math.max(width, height), small = Math.min(width, height)
  if (big > LIMITS.width[1]) return LIMITS.width[1] / big
  if (small < LIMITS.width[0]) return LIMITS.width[0] / small
  return 1
}

const DONE_TEXT = (done: string, live: number, total: number): string => {
  const left = `${live.toLocaleString()} ${live === 1 ? 'attractor was' : 'attractors were'}`
  switch (done) {
    case 'reached': return 'Grown: every attractor reached.'
    case 'stalled': return live ? `Grown. ${left} left where no vein could grow (${((live / Math.max(1, total)) * 100).toFixed(1)} %).` : 'Grown.'
    case 'out-of-reach': return `Stopped: the ${live.toLocaleString()} attractors left are beyond the attraction distance of every vein. Raise it, or turn its limit off.`
    case 'cap': return 'Stopped at 400,000 vein points, the most this page grows. Use fewer attractors or a longer segment.'
    case 'empty': return 'There are no roots. Pick the Roots tool and click inside the shape to add one.'
    default: return ''
  }
}

export function App() {
  const [first] = useState(initialDesign)
  const [status, setStatus] = useState<Status>(() => (first.restored ? { text: 'Restored your last session.' } : null))
  const [picture, setPicture] = useState<PictureData | null>(null)
  const model = useVeins(() => first, setStatus, picture)
  const { design, stats } = model
  const s = design.settings
  const [tab, setTab] = useState<TabId>('grow')
  const [tool, setTool] = useState<Tool>('roots')
  const [zoom, setZoom] = useState(1)
  const [showHelp, setShowHelp] = useState(false)
  const [showQuickStart, setShowQuickStart] = useState(() => storage.get(QUICK_START_KEY) !== '1')
  const [pending, setPending] = useState<Pending | null>(null)
  const [openError, setOpenError] = useState('')
  const [sessionTooBig, setSessionTooBig] = useState(false)
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
  const region = useMemo(() => regionOf(s, design.imported), [s, design.imported])
  // The veins as the worker last sent them: a new view with every frame.
  const { net, mirror } = model
  const scene = useMemo(() => sceneOf(s, rings, net, design.attractors, mirror.used, design.roots), [s, rings, net, design.attractors, design.roots, mirror])
  const contents = sceneContents(scene)

  // Keep a copy of the session a moment after the last change, while nothing is growing.
  const { current, running, unsaved: unsavedNow } = model
  const keep = useCallback((unsavedFlag: boolean) => {
    const text = projectJson(current(), APP_VERSION)
    if (text.length > SESSION_LIMIT) { setSessionTooBig(true); return }
    setSessionTooBig(false)
    storage.set(SESSION_KEY, text)
    storage.set(SESSION_UNSAVED_KEY, unsavedFlag ? '1' : '0')
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

  // Asks before discarding unsaved work, in an in-app dialog (embedded browsers can block confirm()).
  const guard = useCallback((when: boolean, p: Pending) => { if (when) setPending(p); else p.run() }, [])
  const { change, unsaved } = model

  const newDesign = () => guard(unsaved, {
    title: 'Start a new design?', confirm: 'Discard and start new',
    body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
    run: () => { void model.replace(freshDesign({ ...DEFAULTS, seed: randomSeed() }, null, null, null)); setStatus({ text: 'New design.' }) },
  })

  const openProject = () => guard(unsaved, {
    title: 'Open another project?', confirm: 'Discard and open',
    body: 'Unsaved changes in the current design will be lost. Undo can still bring it back during this session.',
    run: () => fileInput.current?.click(),
  })

  const readProject = async (file: File) => {
    try {
      const opened = parseProject(await file.text())
      await model.replace(opened)
      model.markSaved()
      setOpenError('')
      setStatus({ text: `Opened ${file.name}.` })
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
      const k = fitPage(drawing.width, drawing.height)
      const closed = drawing.paths.filter(p => p.closed && p.points.length >= 3)
      if (!closed.length) { setStatus({ text: `${file.name} has no closed shapes to grow inside. Draw a closed path, such as an outline, and export it again.`, warning: true }); return }
      const imported: Imported = { name: file.name, sized: drawing.units, width: drawing.width * k, height: drawing.height * k, rings: closed.map(p => p.points.map(([x, y]): Vec => [x * k, y * k])) }
      const cur = model.current().settings
      change({ width: imported.width, height: imported.height, shape: 'imported', invert: false, units: drawing.units === 'illustrator' ? 'pt' : cur.units }, null, { imported })
      setTab('shape')
      const open = drawing.paths.length - closed.length
      const notes = [
        drawing.fromClip ? `${file.name} is a picture, so the outline of its clipping mask is the shape.` : '',
        open ? `${open} open ${open === 1 ? 'path was' : 'paths were'} left out: only closed shapes count.` : '',
        k !== 1 ? `The drawing was scaled to ${Math.round(k * 100)} % to fit the sheet limits.` : '',
        drawing.units === 'css' ? 'The file doesn’t say its size, so it was read at 96 per inch; check the width and height.' : '',
      ].filter(Boolean).join(' ')
      setStatus({ text: `Using ${file.name}: ${closed.length} ${closed.length === 1 ? 'outline' : 'outlines'}.${notes ? ` ${notes}` : ''}`, warning: Boolean(notes) })
    } catch (error) {
      setStatus({ text: error instanceof SvgShapeError ? error.message : `${file.name} could not be read as an SVG.`, warning: true })
    }
  }

  const readPictureFile = async (file: File) => {
    try {
      const pic = await readPicture(file)
      setPicture(pic)
      model.pictureChanged(pic)
      if (model.current().settings.placement !== 'picture') change({ placement: 'picture' }, 'placement')
      setStatus({ text: `Using ${file.name}: darker areas get more attractors. The picture isn’t saved in the project; its attractors are.` })
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
    const sc = sceneOf(d.settings, shapeRings(d.settings, d.imported), { ...d.growth, points: d.growth.x.length }, d.attractors, d.growth.used, d.roots)
    if (!sceneContents(sc).length) { setStatus({ text: 'Nothing is shown, so there’s nothing to export.', warning: true }); return }
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
    const p = PRESETS.find(item => item.id === name)!
    const roots = startRoots(next, regionOf(next, cur.imported), p.roots)
    change(next, 'preset', { roots, quiet: true })
    setStatus({ text: `${p.label}: ${p.tip}` })
  }
  const placeRoots = (placement: RootPlacement) => {
    const cur = model.current()
    const roots = startRoots(cur.settings, regionOf(cur.settings, cur.imported), placement)
    if (!roots.length) { setStatus({ text: 'No room for roots there in this shape.', warning: true }); return }
    void model.setRoots(roots)
  }
  const moveRoot = (index: number, x: number, y: number) => void model.setRoots(design.roots.map((r, i): Vec => (i === index ? [x, y] : r)), 'move-root')
  const removeRoot = (index: number) => {
    void model.setRoots(design.roots.filter((_, i) => i !== index))
    setStatus({ text: design.roots.length > 1 ? 'Removed a root. Undo brings it back.' : 'Removed the last root. Add one with the Roots tool to grow again.' })
  }

  const noRoots = stats.points === 0 && 'There are no roots. Pick the Roots tool and click inside the shape to add one.'
  const noAttractors = design.attractors.length === 0 && 'There are no attractors to grow toward. Raise the count on the Grow tab, or choose another shape.'
  const finished = stats.done && stats.done !== 'empty' && `${DONE_TEXT(stats.done, stats.live, design.attractors.length / 2)} Reset to grow again, change a growth setting, or add a root.`
  const canGrow = noRoots || noAttractors || finished || false
  const resetBlocked = stats.step === 0 && stats.points === design.roots.length && !model.running && 'The veins are already at their roots.'
  const reset = () => { void model.reset(); setStatus({ text: 'Back to the roots. Undo brings the veins back.' }) }
  // Growing clears old messages so the counts show; pausing says so briefly.
  const grow = () => { setStatus(null); model.play() }
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

  const counts = `${stats.points.toLocaleString()} vein points · ${stats.live.toLocaleString()} attractors left · step ${stats.step.toLocaleString()}`
  const doneText = stats.done ? DONE_TEXT(stats.done, stats.live, design.attractors.length / 2) : ''
  const statusText = status?.text ?? (model.stopping ? 'Stopping after the current step…'
    : model.running ? `Growing · ${counts}` : doneText ? `${doneText} ${counts}` : counts)

  return <main className="studio">
    <TooltipLayer />
    <div className="stage">
      <Stage scene={scene} settings={s} roots={design.roots} region={region} tool={tool} frameRef={frameRef} controlRef={stageRef}
        onAddRoot={(x, y) => { model.addRoot(x, y); setStatus({ text: stats.step > 0 ? 'Added a root: it grows a vein of its own. Undo removes it.' : 'Added a root.' }) }}
        onMoveRoot={moveRoot} onRemoveRoot={removeRoot} onZoom={setZoom} onNotice={text => setStatus({ text })}
        onSpaceTap={() => { if (!pending && !showHelp) toggleGrow() }} />
    </div>

    <header className="brand glass">
      <div><p className="app-kicker">Space colonization</p><h1>Vessel Studio</h1></div>
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
        <ShapePanel s={s} imported={design.imported} rootCount={design.roots.length} change={change} onImport={importSvg} onRoots={placeRoots} />
      </TabPanel>
      <TabPanel idBase="design" id="style" value={tab}><StylePanel s={s} change={change} /></TabPanel>
      <TabPanel idBase="design" id="file" value={tab}>
        <FilePanel s={s} change={change} contents={contents} unsaved={unsaved} busy={busy} openError={openError} fromFile={s.shape === 'imported' && Boolean(design.imported)}
          onNew={newDesign} onOpen={openProject} onSave={() => void saveProject()} onExport={kind => void exportFile(kind)} />
        {sessionTooBig && <p className="hint warning">This design is too big to keep in the browser between visits. Save it as a project file.</p>}
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
        {showQuickStart && <QuickStart onClose={closeQuickStart} />}
      </div>
      <Dock running={model.running} stopping={model.stopping} canGrow={canGrow}
        onGrow={grow} onPause={pause} onStep={() => { setStatus(null); model.step() }} onReset={reset} canReset={resetBlocked}
        status={statusText} warning={Boolean(status?.warning)}
        canUndo={model.canUndo} canRedo={model.canRedo} onUndo={() => void model.undo()} onRedo={() => void model.redo()} />
    </div>

    <aside className="inspector side-panel glass" aria-label="Measurements">
      <Inspector s={s} stats={stats} net={net} attractors={design.attractors.length / 2} roots={design.roots.length} />
    </aside>

    {pending && <ConfirmDialog pending={pending} onCancel={() => setPending(null)} />}
    {showHelp && <HelpDialog onClose={() => setShowHelp(false)} onQuickStart={() => { setShowHelp(false); setShowQuickStart(true) }} />}
  </main>
}
