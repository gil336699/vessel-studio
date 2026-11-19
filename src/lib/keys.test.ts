// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { movesFocus, spaceGrows } from './keys'

const make = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; document.body.append(box); return box.firstElementChild! }

describe('Space and the keyboard', () => {
  it('grows on a slider nudged with the arrow keys after it was clicked, as on any slider', () => {
    const slider = make('<input type="range" min="0" max="10">')
    // Arrow keys, Home and End change a slider's value; they don't move focus by keyboard.
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) expect(movesFocus(key, slider)).toBe(false)
    expect(spaceGrows(slider, true)).toBe(true)
    // Reached with Tab, a slider still takes no Space of its own: Space grows.
    expect(movesFocus('Tab', slider)).toBe(true)
    expect(spaceGrows(slider, false)).toBe(true)
  })

  it('works a button, switch or option group reached with the keyboard, and grows on one last clicked', () => {
    const button = make('<button type="button">Leaf</button>'), check = make('<input type="checkbox">')
    expect(movesFocus('ArrowRight', button)).toBe(true)
    for (const el of [button, check]) { expect(spaceGrows(el, false)).toBe(false); expect(spaceGrows(el, true)).toBe(true) }
    // A text box keeps Space for typing, and a dialog keeps it for its buttons, however they were reached.
    expect(spaceGrows(make('<input type="number">'), true)).toBe(false)
    expect(spaceGrows(make('<div role="dialog"><button type="button">OK</button></div>').querySelector('button'), true)).toBe(false)
    expect(spaceGrows(document.body, false)).toBe(true)
  })
})
