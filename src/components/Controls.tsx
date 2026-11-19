import { type ReactNode, useId, useState } from 'react'
import { rangeFill } from '../lib/rangeFill'
import { decimals, fromUnits, stepFor, toUnits, trimZeros, UNIT_LABEL, type Units } from '../lib/units'

// Form controls shared by the panels. Each one carries a one-sentence description (data-tip) that the
// tooltip layer shows on hover and keyboard focus. An unavailable control shows why instead.

type Tip = { tip: string; unavailable?: string | false; shortcut?: string }

export function Button({ tip, unavailable, shortcut, className, onClick, children, label, pressed }: Tip & {
  className?: string; onClick: () => void; children: ReactNode; label?: string; pressed?: boolean
}) {
  // aria-disabled keeps the button focusable and hoverable, so its reason can still be read.
  return <button type="button" className={className} aria-label={label} aria-pressed={pressed} aria-disabled={unavailable ? true : undefined}
    data-tip={unavailable || tip} data-key={shortcut} onClick={() => { if (!unavailable) onClick() }}>{children}</button>
}

export function SwitchField({ label, checked, onChange, tip, unavailable }: Tip & { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="switch-row" data-tip={unavailable || tip}>
    <span>{label}</span>
    <input type="checkbox" role="switch" checked={checked} disabled={Boolean(unavailable)} onChange={event => onChange(event.currentTarget.checked)} />
  </label>
}

export type Option<T extends string> = { value: T; label: string; tip: string; unavailable?: string | false }

// columns: how many options to a row; a long list wraps onto more rows, each its own capsule.
export function Segmented<T extends string>({ label, options, value, onChange, unavailable, hideLabel, columns }: {
  label: string; options: Option<T>[]; value: T; onChange: (value: T) => void; unavailable?: string | false; hideLabel?: boolean; columns?: number
}) {
  const id = useId()
  return <div className="field">
    {!hideLabel && <span className="field-label" id={id}>{label}</span>}
    <div className={columns && columns < options.length ? 'button-row segmented rows' : 'button-row segmented'} role="group" aria-labelledby={hideLabel ? undefined : id} aria-label={hideLabel ? label : undefined}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
      {options.map(option => {
        const off = unavailable || option.unavailable
        return <button key={option.value} type="button" aria-pressed={option.value === value}
          aria-disabled={off ? true : undefined} data-tip={off || option.tip}
          onClick={() => { if (!off) onChange(option.value) }}>{option.label}</button>
      })}
    </div>
  </div>
}

export function SliderField({ label, value, min, max, step = 1, onChange, format, tip, unavailable, log }: Tip & {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void
  format?: (value: number) => string; log?: boolean
}) {
  // Log sliders give equal travel to 10→100 and 1,000→10,000, which suits counts.
  const toTrack = (v: number) => (log ? Math.log(v) : v)
  const fromTrack = (t: number) => (log ? Math.exp(t) : t)
  const snap = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const id = useId()
  return <label className="field" data-tip={unavailable || tip}>
    <span className="field-label"><span id={id}>{label}</span><b aria-hidden="true">{format ? format(value) : value}</b></span>
    <input type="range" min={toTrack(min)} max={toTrack(max)} step={log ? 'any' : step} value={toTrack(value)} disabled={Boolean(unavailable)} aria-labelledby={id}
      style={rangeFill(toTrack(value), toTrack(min), toTrack(max))} aria-valuetext={format ? format(value) : String(value)}
      onChange={event => onChange(snap(fromTrack(Number(event.currentTarget.value))))} />
  </label>
}

// A number box that lets people type freely: the text stays as typed and applies on Enter or when the box
// loses focus, clamped to its range then (the App Development Standard's rule from Growth Studio 0.8.2, where
// clamping or applying each keystroke turned 80 into 100 and 300 into 1,300). Arrow keys and the spin buttons
// apply at once.
export function DraftNumber({ value, min, max, step = 1, digits = 0, onChange, disabled, className = 'number-input', labelledBy, label }: {
  value: number; min: number; max: number; step?: number; digits?: number; onChange: (value: number) => void
  disabled?: boolean; className?: string; labelledBy?: string; label?: string
}) {
  // What was typed, and the value it was typed against. It shows only while that is still the value, so a
  // change from elsewhere (an import, a linked field, Undo) replaces it instead of being overwritten on blur.
  const [draft, setDraft] = useState<{ text: string; at: number } | null>(null)
  const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))
  const typing = draft !== null && same(draft.at, value)
  const shown = typing ? draft.text : trimZeros(value.toFixed(digits))
  const commit = () => {
    // Only text that was actually typed is applied, so tabbing through a field never rounds its value.
    if (typing) {
      const v = Number(draft.text)
      if (draft.text.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
    }
    setDraft(null)
  }
  // An unavailable box is read-only rather than disabled, so it can still take focus and a tap, and say why.
  return <input className={className} type="number" inputMode="decimal" min={min} max={max} step={step} value={shown}
    readOnly={disabled} aria-disabled={disabled || undefined} aria-labelledby={labelledBy} aria-label={label}
    onChange={event => {
      if (disabled) return
      const text = event.currentTarget.value
      // A spin button or an arrow key changes the value without typing: apply it straight away.
      const typed = Boolean((event.nativeEvent as InputEvent).inputType)
      const v = Number(text)
      if (!typed && text.trim() !== '' && Number.isFinite(v)) { setDraft(null); onChange(Math.min(max, Math.max(min, v))); return }
      setDraft({ text, at: value })
    }}
    onBlur={() => { if (!disabled) commit() }}
    onKeyDown={event => { if (event.key === 'Enter' && !disabled) commit() }} />
}

export function NumberField({ label, value, min, max, step = 1, digits = 0, suffix, onChange, tip, unavailable, compact }: Tip & {
  label: string; value: number; min: number; max: number; step?: number; digits?: number; suffix?: string
  onChange: (value: number) => void; compact?: boolean
}) {
  return <label className={compact ? 'field compact-field' : 'field'} data-tip={unavailable || tip}>
    <span className="field-label"><span>{label}</span></span>
    <span className="number-wrap">
      <DraftNumber value={value} min={min} max={max} step={step} digits={digits} onChange={onChange} disabled={Boolean(unavailable)} />
      {suffix && <span className="suffix" aria-hidden="true">{suffix}</span>}
    </span>
  </label>
}

// A length in the sheet's unit, stored in millimetres.
export function LengthField({ label, mm, min, max, units, dpi, onChange, tip, unavailable, small, compact }: Tip & {
  label: string; mm: number; min: number; max: number; units: Units; dpi: number; onChange: (mm: number) => void; small?: boolean; compact?: boolean
}) {
  return <NumberField label={label} value={toUnits(mm, units, dpi)} min={toUnits(min, units, dpi)} max={toUnits(max, units, dpi)}
    step={stepFor(units, small)} digits={decimals(units, small) + 1} suffix={UNIT_LABEL[units]} tip={tip} unavailable={unavailable} compact={compact}
    onChange={value => onChange(fromUnits(value, units, dpi))} />
}

export function ColorField({ label, value, onChange, tip, unavailable }: Tip & { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="color-row" data-tip={unavailable || tip}>
    <span>{label}</span>
    <span className="color-value"><code>{value.toUpperCase()}</code>
      <input type="color" value={value} disabled={Boolean(unavailable)} onChange={event => onChange(event.currentTarget.value)} />
    </span>
  </label>
}

// A section of a panel. A folded one starts closed, with what it holds in its heading, so a long panel fits.
export function Section({ title, children, tip, folded }: { title: string; children: ReactNode; tip?: string; folded?: string }) {
  if (folded) return <section>
    <details className="section-fold">
      <summary data-tip={tip}><span className="fold-title">{title}</span><span className="fold-what">{folded}</span></summary>
      {children}
    </details>
  </section>
  return <section>
    <h2 data-tip={tip}>{title}</h2>
    {children}
  </section>
}

// A slider with a number box beside it, as the Illustrator panel paired them. The box takes typed values
// in the display unit; `scale` converts stored values to it (for example millimetres to points).
// onRelease: the slider applies its value when let go, not at every step of a drag, for settings that are slow
// to apply, such as Count, which places every attractor again. The number shows the value as it moves.
export function RangeField({ label, value, min, max, step, digits, scale = 1, suffix, onChange, tip, unavailable, log, onRelease }: Tip & {
  label: string; value: number; min: number; max: number; step: number; digits: number; scale?: number; suffix?: string
  onChange: (value: number) => void; log?: boolean; onRelease?: boolean
}) {
  const id = useId()
  const [moving, setMoving] = useState<number | null>(null)
  const release = () => { if (moving !== null) { onChange(moving); setMoving(null) } }
  const shown = moving ?? value
  const toTrack = (v: number) => (log ? Math.log(v) : v)
  const fromTrack = (t: number) => (log ? Math.exp(t) : t)
  const round = (v: number) => Math.min(max, Math.max(min, v))
  return <div className="field range-field" data-tip={unavailable || tip}>
    <span className="field-label"><span id={id}>{label}</span>
      <span className="number-wrap">
        <DraftNumber value={shown * scale} min={min * scale} max={max * scale} step={step * scale} digits={digits} labelledBy={id}
          disabled={Boolean(unavailable)} className="number-input inline-number" onChange={v => onChange(round(v / scale))} />
        {suffix && <span className="suffix" aria-hidden="true">{suffix}</span>}
      </span>
    </span>
    <input type="range" min={toTrack(min)} max={toTrack(max)} step={log ? 'any' : step} value={toTrack(Math.min(max, Math.max(min, shown)))}
      disabled={Boolean(unavailable)} aria-labelledby={id} style={rangeFill(toTrack(Math.min(max, Math.max(min, shown))), toTrack(min), toTrack(max))}
      onChange={event => {
        const raw = fromTrack(Number(event.currentTarget.value))
        const snapped = round(log ? raw : Math.round(raw / step) * step)
        if (onRelease) setMoving(snapped)
        else onChange(snapped)
      }}
      onPointerUp={release} onKeyUp={release} onBlur={release} />
  </div>
}
