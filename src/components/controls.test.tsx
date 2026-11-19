// @vitest-environment happy-dom
// The page's own controls, driven with the pointer, touch and key events a browser sends.
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RangeField } from './Controls'
import { Modal } from './Modal'
import { TooltipLayer } from './Tooltip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })
const render = (node: React.ReactNode) => act(() => root.render(node))
const pointer = (target: Element, type: string, init: PointerEventInit = {}) => act(() => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init })) })
const key = (target: Element, type: 'keydown' | 'keyup', k: string, init: KeyboardEventInit = {}) => act(() => { target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: k, ...init })) })
// A range input moved as a browser moves it: the value set, then input and change events.
const slide = (input: HTMLInputElement, value: string, events: ('input' | 'change')[]) => act(() => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  set.call(input, value)
  for (const type of events) input.dispatchEvent(new Event(type, { bubbles: true }))
})

describe('the Count slider', () => {
  // Count as the Grow tab has it: a log slider that applies when let go.
  function Count({ onApply }: { onApply: (v: number) => void }) {
    const [count, setCount] = useState(4000)
    return <RangeField label="Count" value={count} min={100} max={20000} step={1} digits={0} log onRelease tip="How many attractors."
      onChange={v => { const n = Math.round(v); setCount(n); onApply(n) }} />
  }

  it('applies a drag once, though the browser sends the value back a hair off after it’s let go', () => {
    const applied: number[] = []
    render(<Count onApply={v => applied.push(v)} />)
    const input = host.querySelector<HTMLInputElement>('input[type=range]')!
    pointer(input, 'pointerdown')
    slide(input, String(Math.log(1500)), ['input'])
    slide(input, String(Math.log(792.2)), ['input'])
    pointer(input, 'pointerup')
    expect(applied).toEqual([792])
    // Chrome's change event after mouseup: the applied value read back, 792.0000000000036.
    slide(input, String(Math.log(792) + 4e-15), ['change'])
    // ⌘Z, with the slider still focused: key up must not apply 792 again over the Undo.
    key(input, 'keydown', 'Meta', { metaKey: true })
    key(input, 'keydown', 'z', { metaKey: true })
    key(input, 'keyup', 'z', { metaKey: true })
    act(() => { input.dispatchEvent(new FocusEvent('blur')); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(applied).toEqual([792])
  })

  it('applies arrow keys once they rest, so five presses place the attractors once', () => {
    vi.useFakeTimers()
    const applied: number[] = []
    render(<Count onApply={v => applied.push(v)} />)
    const input = host.querySelector<HTMLInputElement>('input[type=range]')!
    let v = Math.log(4000)
    for (let i = 0; i < 5; i++) {
      key(input, 'keydown', 'ArrowLeft')
      v -= 0.05
      slide(input, String(v), ['input', 'change'])
      key(input, 'keyup', 'ArrowLeft')
      act(() => { vi.advanceTimersByTime(100) })
    }
    expect(applied).toEqual([])
    act(() => { vi.advanceTimersByTime(600) })
    expect(applied).toEqual([Math.round(Math.exp(v))])
  })

  it('applies what it holds when the touch is taken over to scroll the page', () => {
    const applied: number[] = []
    render(<Count onApply={n => applied.push(n)} />)
    const input = host.querySelector<HTMLInputElement>('input[type=range]')!
    pointer(input, 'pointerdown', { pointerType: 'touch' })
    slide(input, String(Math.log(2500)), ['input'])
    pointer(input, 'pointercancel', { pointerType: 'touch' })
    expect(applied).toEqual([2500])
  })
})

describe('dialogs', () => {
  it('close on a backdrop press that starts there, not on the lift of a finger that opened them', () => {
    const closed = vi.fn()
    render(<Modal label="Remove the root?" onClose={closed}><button type="button">Remove</button></Modal>)
    const backdrop = host.querySelector('.help-backdrop')!
    // Pressing and holding a root opened the dialog; the finger lifts over the backdrop and the browser clicks it.
    pointer(backdrop, 'pointerup', { pointerType: 'touch' })
    act(() => { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(closed).not.toHaveBeenCalled()
    // A press on the card that ends on the backdrop doesn't close it either.
    pointer(host.querySelector('.help-card')!, 'pointerdown')
    act(() => { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(closed).not.toHaveBeenCalled()
    // A press on the backdrop itself does.
    pointer(backdrop, 'pointerdown')
    act(() => { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(closed).toHaveBeenCalledTimes(1)
  })
})

describe('tooltips on a touch screen', () => {
  it('keep a tapped greyed-out control’s reason up after the finger lifts', () => {
    render(<><TooltipLayer /><button type="button" id="before">Grow</button><button type="button" aria-disabled="true" data-tip="Choose a picture first.">Picture</button></>)
    const button = host.querySelector('button[data-tip]')!
    const tip = document.getElementById('app-tooltip')!
    pointer(button, 'pointerdown', { pointerType: 'touch' })
    pointer(button, 'pointerup', { pointerType: 'touch' })
    expect(tip.hidden).toBe(false)
    expect(tip.textContent).toContain('Choose a picture first.')
    // Every touch lift sends pointerout, with nothing to move to.
    pointer(button, 'pointerout', { pointerType: 'touch', relatedTarget: null })
    expect(tip.hidden).toBe(false)
    // Then the browser moves focus to the tapped button, from the one that had it.
    act(() => { host.querySelector('#before')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(tip.hidden).toBe(false)
  })
})
