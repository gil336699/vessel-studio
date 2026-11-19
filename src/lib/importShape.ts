// From an SVG drawing to the shape veins grow in, as the Shape tab's Import does it: the closed paths, with
// outlined strokes read as lines, on a page brought within the sheet's size limits by one even scale, so the
// outline is never stretched. What was done is said in plain words: notes for what was meant, warnings for what
// to check.
import type { Ring, Vec } from '../veins/geometry'
import { mergeStrokeBands } from '../veins/strokes'
import type { Imported } from './design'
import { FAR } from './project'
import { LIMITS } from './settings'
import type { SvgDrawing } from './svgImport'
import { formatLength, type Units } from './units'

export type ImportedShape = { imported: Imported; units: Units; notes: string[]; warnings: string[] }

export function shapeFromDrawing(drawing: SvgDrawing, name: string, units: Units, dpi: number): ImportedShape | { error: string } {
  const closed = drawing.paths.filter(p => p.closed && p.points.length >= 3)
  if (!closed.length) return { error: `${name} has no closed shapes to grow inside. Draw a closed path, such as an outline, and export it again.` }
  const w = drawing.width, h = drawing.height
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) return { error: `${name} has no usable page size, so it can’t be placed on a sheet.` }
  // One scale for both sides: as large as fits the biggest sheet, and if the page is smaller than the smallest
  // sheet, up to that size, as far as the long side allows.
  const most = Math.min(LIMITS.width[1] / w, LIMITS.height[1] / h), least = Math.max(LIMITS.width[0] / w, LIMITS.height[0] / h)
  const k = 1 > most ? most : 1 < least ? Math.min(least, most) : 1
  // A drawing too long and thin for any even scale gets a sheet a little bigger than it, with the drawing centred.
  const sheetW = Math.max(LIMITS.width[0], w * k), sheetH = Math.max(LIMITS.height[0], h * k)
  const dx = (sheetW - w * k) / 2, dy = (sheetH - h * k) / 2
  const rings: Ring[] = closed.map(p => p.points.map(([x, y]): Vec => [x * k + dx, y * k + dy]))
  // Parts far off the page can't be kept in a project file, so they're left out here too.
  const kept = rings.filter(r => r.every(([x, y]) => Math.abs(x) <= FAR && Math.abs(y) <= FAR))
  if (!kept.length) return { error: `Every closed shape in ${name} lies more than 100 m off its page, so none can be used.` }
  const strokes = mergeStrokeBands(kept)
  const shown: Units = drawing.units === 'illustrator' ? 'pt' : units
  const band = formatLength(strokes.width, shown, dpi, true)
  // Reading outlined strokes as lines is what was meant, so it's said plainly, not as a warning.
  // What it can't tell is whether a pair is an outlined stroke or, say, a bleed line round a trim line; either way
  // the band is read as one line.
  const notes = [
    strokes.pairs === 1 ? `Two of its outlines run ${band} apart all the way round, as an outlined stroke does, so they were read as one line. Veins grow up to it, never into it; Edge clearance keeps them further off.` : '',
    strokes.pairs > 1 ? `${strokes.pairs} pairs of its outlines run ${band} apart all the way round, as outlined strokes do, so each pair was read as one line. Veins grow up to them, never into them; Edge clearance keeps them further off.` : '',
  ].filter(Boolean)
  const open = drawing.paths.length - closed.length, far = rings.length - kept.length
  const warnings = [
    drawing.fromClip ? `${name} is a picture, so the outline of its clipping mask is the shape.` : '',
    drawing.texts ? `Its live type was left out, as it has no outlines: in Illustrator, use Type › Create Outlines first.` : '',
    drawing.clipped ? `${drawing.clipped === 1 ? 'A clipping mask trims part' : `${drawing.clipped} clipping masks trim parts`} of the drawing; this reads shapes whole, so check the outline.` : '',
    open ? `${open} open ${open === 1 ? 'path was' : 'paths were'} left out: only closed shapes count.` : '',
    far ? `${far} ${far === 1 ? 'shape lies' : 'shapes lie'} more than 100 m off the page and ${far === 1 ? 'was' : 'were'} left out.` : '',
    k !== 1 ? `The drawing was scaled to ${Math.round(k * 100)} % to fit the sheet limits.` : '',
    dx > 1e-9 || dy > 1e-9 ? `It’s too long and thin for any sheet, so the sheet is ${formatLength(dx > dy ? sheetW : sheetH, shown, dpi)} across its short side, with the drawing centred on it.` : '',
    drawing.units === 'css' ? 'The file doesn’t say its size, so it was read at 96 pixels per inch; check the width and height.' : '',
  ].filter(Boolean)
  return { imported: { name, sized: drawing.units, width: sheetW, height: sheetH, rings: strokes.rings }, units: shown, notes, warnings }
}
