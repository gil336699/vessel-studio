// PNG at real size: the sheet at its pixels per inch, drawn by the same renderer as the view, with the pixels per
// inch written into the file so Illustrator, InDesign and Photoshop place it at its real size. The resolution
// chunk writer is Line Growth's (lib/render.ts), unchanged.
import { drawScene } from './render'
import type { Scene } from './scene'
import type { Settings } from './settings'

export const PNG_MAX_SIDE = 16_384
export const PNG_MAX_PIXELS = 120_000_000

export function pngProblem(width: number, height: number): string | null {
  if (width > PNG_MAX_SIDE || height > PNG_MAX_SIDE) return `That PNG would be ${width.toLocaleString()} × ${height.toLocaleString()} px, over the ${PNG_MAX_SIDE.toLocaleString()} px a side browsers can draw. Lower the pixels per inch on the Shape tab, or export SVG.`
  if (width * height > PNG_MAX_PIXELS) return `That PNG would be ${Math.round((width * height) / 1e6)} megapixels, more than browsers can draw. Lower the pixels per inch on the Shape tab, or export SVG.`
  return null
}

export async function renderPng(scene: Scene, s: Settings, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Real size: one millimetre is this many pixels. Lines keep their real widths, with no screen minimum.
  drawScene(ctx, scene, s, { scale: width / s.width, ox: 0, oy: 0 }, { background: s.transparentPng ? null : s.background, minPx: 0 })
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ? withResolution(blob, s.dpi) : null), 'image/png'))
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

// A PNG keeps its print size as pixels per metre in a pHYs chunk. The browser writes none, and without one
// Illustrator, InDesign and Photoshop read 72 pixels per inch, so a 100 mm sheet at 300 ppi placed at 417 mm.
// This writes the sheet's pixels per inch into the file, after the header, in place of any there.
export async function withResolution(png: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = (at: number) => String.fromCharCode(...bytes.subarray(at + 4, at + 8))
  if (bytes.length < 33 || type(8) !== 'IHDR') return png
  const chunk = new Uint8Array(21), out = new DataView(chunk.buffer)
  const perMetre = Math.round(dpi / 0.0254)
  out.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4) // pHYs
  out.setUint32(8, perMetre); out.setUint32(12, perMetre); chunk[16] = 1 // the unit is the metre
  out.setUint32(17, crc32(chunk.subarray(4, 17)))
  const parts: Uint8Array[] = [bytes.subarray(0, 33), chunk]
  for (let at = 33; at + 12 <= bytes.length;) {
    const next = at + 12 + view.getUint32(at)
    if (type(at) !== 'pHYs') parts.push(bytes.subarray(at, next))
    at = next
  }
  return new Blob(parts as BlobPart[], { type: 'image/png' })
}
