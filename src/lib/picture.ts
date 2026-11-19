// A picture for the Picture placement: its darkness, from 0 (white) to 1 (black), at up to 512 pixels a side,
// fitted inside the sheet and centred, as a print would be. Transparent parts count as white.
import type { DensityMap } from '../veins/attractors'

export type PictureData = { name: string; width: number; height: number; dark: Float32Array }

const MAX_SIDE = 512

export class PictureError extends Error {}

export async function readPicture(file: File): Promise<PictureData> {
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new PictureError(`${file.name} could not be read as a picture. Use a PNG or JPEG.`) }
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * k)), height = Math.max(1, Math.round(bitmap.height * k))
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new PictureError('The browser could not read the picture.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { name: file.name, width, height, dark: darkness(ctx.getImageData(0, 0, width, height).data) }
}

// RGBA bytes to darkness, composited over white.
export function darkness(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4)
  for (let i = 0; i < out.length; i++) {
    const a = rgba[i * 4 + 3] / 255
    const lum = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255
    out[i] = 1 - (lum * a + (1 - a))
  }
  return out
}

// The picture fitted inside the sheet and centred.
export function fitPicture(p: PictureData, sheetWidth: number, sheetHeight: number): DensityMap {
  const k = Math.min(sheetWidth / p.width, sheetHeight / p.height)
  const w = p.width * k, h = p.height * k
  const x0 = (sheetWidth - w) / 2, y0 = (sheetHeight - h) / 2
  return { width: p.width, height: p.height, dark: p.dark, box: [x0, y0, x0 + w, y0 + h] }
}
