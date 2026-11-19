// Colours and sizes for the parts that aren't veins, shared by the view and every export, so a file looks like
// the screen. Sizes are millimetres and follow the tip width, so they stay in proportion on any sheet.
export const BOUNDARY_COLOR = '#8a94a6'
export const ATTRACTOR_COLOR = '#9aa0a6'
export const ROOT_COLOR = '#ff375f'

export const boundaryWidth = (tip: number) => Math.max(0.1, Math.min(0.5, tip))
export const attractorRadius = (segment: number) => Math.max(0.08, Math.min(1.5, segment * 0.18))
export const rootRadius = (segment: number, tip: number) => Math.max(0.6, Math.min(6, Math.max(segment * 1.2, tip * 3)))
