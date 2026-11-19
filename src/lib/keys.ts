// Which key presses Space grows on, and which move focus by keyboard. A control last pressed with the pointer
// keeps focus, but Space still grows rather than pressing it again; reached with the keyboard, Space works it.

// Controls Space works when they were reached with the keyboard.
const PRESSABLE = 'input:not([type=range]), select, textarea, button, summary'
const DIALOG = '[role=dialog], [role=alertdialog]'

// Whether a key moves focus by keyboard: Tab, and the arrow keys, Home and End in a group of options or tabs.
// On a slider they change its value and focus stays, so they don't.
export function movesFocus(key: string, target: EventTarget | null): boolean {
  if (key === 'Tab') return true
  if (!(key.startsWith('Arrow') || key === 'Home' || key === 'End')) return false
  return !(target instanceof Element && target.matches('input[type=range]'))
}

// Whether Space, pressed with focus on target, grows (or pauses) rather than working the control. pointerLast:
// whether the last thing done was with the pointer. A slider takes no Space of its own, so Space always grows on
// one; in a dialog, Space is the dialog's.
export function spaceGrows(target: EventTarget | null, pointerLast: boolean): boolean {
  if (!(target instanceof Element)) return true
  if (target.closest(DIALOG)) return false
  if (!target.closest(PRESSABLE)) return true
  // A switch, button or section heading last clicked still has focus: Space grows. A text box never gives it up.
  return pointerLast && Boolean(target.closest('button, input[type=checkbox], summary'))
}
