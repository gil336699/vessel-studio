// From an SVG drawing to the shape veins grow in, as the Shape tab's Import does it: the closed paths, with
// outlined strokes read as lines, on a page brought within the sheet's size limits by one even scale, so the
// outline is never stretched. What was done is said in plain words: notes for what was meant, warnings for what
// to check.
import { clipRingToBox, hasArea, signedArea, type Ring, type Vec } from '../veins/geometry'
import { mergeStrokeBands, outlinesCross, ringDepths, ringInside } from '../veins/strokes'
import type { Imported } from './design'
import { FAR } from './project'
import { LIMITS } from './settings'
import type { SvgDrawing } from './svgImport'
import { formatLength, type Units } from './units'

// parts: how many separate parts are on the sheet, each of which needs a root of its own.
export type ImportedShape = { imported: Imported; units: Units; notes: string[]; warnings: string[]; parts: number }

// How a page of w × h sits within the sheet's size limits: one scale for both sides, as large as fits the biggest
// sheet and, if the page is smaller than the smallest sheet, up to that size, as far as the long side allows. A
// page too long and thin for any even scale gets a sheet a little bigger than it, with the drawing centred.
export function fitPage(w: number, h: number): { k: number; sheetW: number; sheetH: number; dx: number; dy: number } {
  const most = Math.min(LIMITS.width[1] / w, LIMITS.height[1] / h), least = Math.max(LIMITS.width[0] / w, LIMITS.height[0] / h)
  const k = 1 > most ? most : 1 < least ? Math.min(least, most) : 1
  const sheetW = Math.max(LIMITS.width[0], w * k), sheetH = Math.max(LIMITS.height[0], h * k)
  return { k, sheetW, sheetH, dx: (sheetW - w * k) / 2, dy: (sheetH - h * k) / 2 }
}

// What a scaled page means for the exports, in words.
function scaledNote(w: number, h: number, k: number, shown: Units, dpi: number): string {
  const size = `${formatLength(w, shown, dpi)} × ${formatLength(h, shown, dpi)}`
  return k < 1
    ? `Its page is ${size}, larger than the largest sheet (${formatLength(LIMITS.width[1], shown, dpi)} a side), so it was scaled to ${Math.round(k * 100)} %. Exports come out at that scale: enlarge them by ${Math.round(100 / k)} % for full size.`
    : `Its page is ${size}, smaller than the smallest sheet (${formatLength(LIMITS.width[0], shown, dpi)} a side), so it was enlarged to ${Math.round(k * 100)} %. Exports come out at that scale.`
}

// The sheet's parts and the frame note for a set of outlines, as they lie on a sheet of w × h.
function onSheet(rings: Ring[], w: number, h: number): { parts: number; frame: 'empty' | 'around' | null } {
  const clipped = rings.map(r => clipRingToBox(r, [0, 0, w, h])).filter(hasArea)
  const depths = ringDepths(clipped)
  const parts = depths.filter(d => d % 2 === 0).length
  // Outlines that make a frame: the largest outline's openings take up most of it. Veins grow in the band round
  // them, as the file draws it, which may not be what's meant: say so, and what to do.
  let biggest = -1
  clipped.forEach((r, i) => { if (depths[i] % 2 === 0 && (biggest < 0 || Math.abs(signedArea(r)) > Math.abs(signedArea(clipped[biggest])))) biggest = i })
  if (biggest < 0) return { parts, frame: null }
  const outer = clipped[biggest], area = Math.abs(signedArea(outer))
  const openings = clipped.filter((r, i) => depths[i] === depths[biggest] + 1 && ringInside(r, outer))
  if (!(area > 0) || openings.reduce((sum, r) => sum + Math.abs(signedArea(r)), 0) <= 0.5 * area) return { parts, frame: null }
  // Parts drawn inside the openings, as a badge's letters sit inside its ring.
  const held = clipped.some((r, i) => depths[i] === depths[biggest] + 2 && openings.some(o => ringInside(r, o)))
  return { parts, frame: held ? 'around' : 'empty' }
}

export function shapeFromDrawing(drawing: SvgDrawing, name: string, units: Units, dpi: number): ImportedShape | { error: string } {
  const closed = drawing.paths.filter(p => p.closed && p.points.length >= 3)
  if (!closed.length) return { error: `${name} has no closed shapes to grow inside. Draw a closed path, such as an outline, and export it again.` }
  const w = drawing.width, h = drawing.height
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) return { error: `${name} has no usable page size, so it can’t be placed on a sheet.` }
  const { k, sheetW, sheetH, dx, dy } = fitPage(w, h)
  const placed = closed.map(p => ({ ring: p.points.map(([x, y]): Vec => [x * k + dx, y * k + dy]), element: p.element }))
  // Parts far off the page can't be kept in a project file, so they're left out here too.
  const kept = placed.filter(({ ring }) => ring.every(([x, y]) => Math.abs(x) <= FAR && Math.abs(y) <= FAR))
  if (!kept.length) return { error: `Every closed shape in ${name} lies more than 100 m off its page, so none can be used.` }
  const strokes = mergeStrokeBands(kept.map(p => p.ring), kept.map(p => p.element))
  const { parts, frame } = onSheet(strokes.rings, sheetW, sheetH)
  // Art that lies wholly off its page, as when it was moved off the artboard, leaves nothing on the sheet.
  if (!parts) return { error: `None of ${name}’s closed shapes lie on its page, so there’s nothing to grow in. In Illustrator, move the artwork onto the artboard, or use Object › Artboards › Fit to Artwork Bounds, and export it again.` }
  const shown: Units = drawing.units === 'illustrator' ? 'pt' : units
  const band = formatLength(strokes.width, shown, dpi, true)
  // Reading outlined strokes as lines is what was meant, so it's said plainly, not as a warning.
  // What it can't tell is whether a pair is an outlined stroke or, say, a bleed line round a trim line; either way
  // the band is read as one line.
  const notes = [
    strokes.pairs === 1 ? `Two of its outlines run ${band} apart all the way round, as an outlined stroke does, so they were read as one line. Veins grow up to it, never into it; Edge clearance keeps them further off.` : '',
    strokes.pairs > 1 ? `${strokes.pairs} pairs of its outlines run ${band} apart all the way round, as outlined strokes do, so each pair was read as one line. Veins grow up to them, never into them; Edge clearance keeps them further off.` : '',
    frame === 'empty' ? 'Its outlines make a frame, so veins grow in the band round the openings, as drawn. To grow in an opening, import that opening’s outline alone.' : '',
    frame === 'around' ? 'Its largest outline is a frame round the other shapes, so veins grow in the frame too. To leave it out, delete it in your file and import again.' : '',
  ].filter(Boolean)
  const crossing = outlinesCross(strokes.rings)
  const open = drawing.paths.length - closed.length, far = placed.length - kept.length
  const offPage = kept.some(({ ring }) => ring.some(([x, y]) => x < -1e-6 || y < -1e-6 || x > sheetW + 1e-6 || y > sheetH + 1e-6))
  const warnings = [
    drawing.fromClip ? `${name} is a picture, so the outline of its clipping mask is the shape.` : '',
    drawing.texts ? `Its live type was left out, as it has no outlines: in Illustrator, use Type › Create Outlines first.` : '',
    drawing.clipped ? `${drawing.clipped === 1 ? 'A clipping mask trims part' : `${drawing.clipped} clipping masks trim parts`} of the drawing; this reads shapes whole, so check the outline.` : '',
    open ? `${open} open ${open === 1 ? 'path was' : 'paths were'} left out: only closed shapes count.` : '',
    crossing ? 'Some of its outlines cross, and where they overlap is read as a hole. To fill the overlap, join them first in Illustrator with Pathfinder › Unite.' : '',
    far ? `${far} ${far === 1 ? 'shape lies' : 'shapes lie'} more than 100 m off the page and ${far === 1 ? 'was' : 'were'} left out.` : '',
    k !== 1 ? scaledNote(w, h, k, shown, dpi) : '',
    offPage ? 'Part of the drawing runs past its page, as a bleed does; veins grow only in what’s on the sheet.' : '',
    dx > 1e-9 || dy > 1e-9 ? `It’s too long and thin for any sheet, so the sheet is ${formatLength(dx > dy ? sheetW : sheetH, shown, dpi)} across its short side, with the drawing centred on it.` : '',
    drawing.units === 'css' ? 'The file doesn’t say its size, so it was read at 96 pixels per inch; check the width and height.' : '',
  ].filter(Boolean)
  return { imported: { name, sized: drawing.units, width: sheetW, height: sheetH, rings: strokes.rings }, units: shown, notes, warnings, parts }
}

// A file that doesn't say its size is read at 96 per inch, the web's; one from Illustrator is at 72. Read again at
// 72, it's 96 / 72 times the size, as Illustrator drew it, brought within the sheet's limits as an import is.
export function atIllustratorSize(imported: Imported, units: Units, dpi: number): { imported: Imported; warnings: string[] } {
  const w = (imported.width * 96) / 72, h = (imported.height * 96) / 72
  const { k, sheetW, sheetH, dx, dy } = fitPage(w, h)
  const m = (k * 96) / 72
  return {
    imported: { ...imported, sized: 'points', width: sheetW, height: sheetH, rings: imported.rings.map(r => r.map(([x, y]): Vec => [x * m + dx, y * m + dy])) },
    warnings: k !== 1 ? [scaledNote(w, h, k, units, dpi)] : [],
  }
}
