// Sheet sizes people often need, for prints, plotters, laser sheets and social images. Sizes are millimetres;
// pixel sizes convert at the sheet's pixels per inch. The shape is chosen separately.
import type { Units } from './units'

export type SheetPreset = { id: string; label: string; width: number; height: number; units: Units; pixels?: [number, number] }

const mm = (inches: number) => inches * 25.4

export const SHEET_PRESETS: SheetPreset[] = [
  { id: 'a4', label: 'A4 210 × 297 mm', width: 210, height: 297, units: 'mm' },
  { id: 'a3', label: 'A3 297 × 420 mm', width: 297, height: 420, units: 'mm' },
  { id: 'a5', label: 'A5 148 × 210 mm', width: 148, height: 210, units: 'mm' },
  { id: 'square-200', label: 'Square 200 × 200 mm', width: 200, height: 200, units: 'mm' },
  { id: 'letter', label: 'US Letter 8.5 × 11 in', width: mm(8.5), height: mm(11), units: 'in' },
  { id: 'tabloid', label: 'Tabloid 11 × 17 in', width: mm(11), height: mm(17), units: 'in' },
  { id: 'sheet-12', label: 'Laser sheet 12 × 12 in', width: mm(12), height: mm(12), units: 'in' },
  { id: 'coaster', label: 'Coaster 100 × 100 mm', width: 100, height: 100, units: 'mm' },
  { id: 'square-1080', label: 'Square post 1080 × 1080 px', width: 0, height: 0, units: 'px', pixels: [1080, 1080] },
  { id: 'portrait-1080', label: 'Portrait post 1080 × 1350 px', width: 0, height: 0, units: 'px', pixels: [1080, 1350] },
]

export function presetSize(preset: SheetPreset, dpi: number): [number, number] {
  if (preset.pixels) return [(preset.pixels[0] / dpi) * 25.4, (preset.pixels[1] / dpi) * 25.4]
  return [preset.width, preset.height]
}

// Which preset the current sheet matches, if any, so the menu shows it.
export function matchPreset(width: number, height: number, units: Units, dpi: number): string {
  const hit = SHEET_PRESETS.find(p => {
    const [w, h] = presetSize(p, dpi)
    return p.units === units && Math.abs(w - width) < 0.01 && Math.abs(h - height) < 0.01
  })
  return hit?.id ?? 'custom'
}
