import { memo } from 'react'
import { LIMITS, type Settings } from '../lib/settings'
import { decimals, toUnits, UNIT_LABEL } from '../lib/units'
import type { WidthRule } from '../veins/network'
import { ColorField, RangeField, Section, Segmented, SliderField, SwitchField, type Option } from './Controls'
import type { Change } from './ShapePanel'

const RULES: Option<WidthRule>[] = [
  { value: 'murray', label: 'Murray’s law', tip: 'Veins thicken toward the roots at every fork, as blood vessels and leaf veins do.' },
  { value: 'even', label: 'Even', tip: 'Every vein the same width, one stroke, as a pen plotter draws.' },
]

export const StylePanel = memo(function StylePanel({ s, change }: { s: Settings; change: Change }) {
  const k = toUnits(1, s.units, s.dpi), unit = UNIT_LABEL[s.units], digits = decimals(s.units, true)
  const span = Math.max(s.width, s.height)
  return <>
    <Section title="Vein width">
      <Segmented label="Width" options={RULES} value={s.widthRule} onChange={widthRule => change({ widthRule }, 'widthRule')} />
      <RangeField label={s.widthRule === 'even' ? 'Width' : 'Tip width'} value={s.tipWidth} min={LIMITS.tipWidth[0]} max={Math.max(1, span / 40)} step={0.01} digits={digits} scale={k} suffix={unit}
        tip={s.widthRule === 'even' ? 'Width of every vein, at real size.' : 'Width of the finest veins, at their ends, at real size.'} onChange={tipWidth => change({ tipWidth }, 'tipWidth')} />
      {s.widthRule === 'murray' && <>
        <RangeField label="Max width" value={s.maxWidth} min={Math.max(0.01, s.tipWidth)} max={Math.max(2, span / 10)} step={0.01} digits={digits} scale={k} suffix={unit}
          tip="A cap on how wide a vein gets; how wide they grow depends on the ends they feed and the exponent." onChange={maxWidth => change({ maxWidth }, 'maxWidth')} />
        <SliderField label="Murray exponent" value={s.exponent} min={LIMITS.exponent[0]} max={LIMITS.exponent[1]} step={0.05} format={v => v.toFixed(2)}
          tip="How fast veins thicken toward the roots: lower thickens faster; 3 suits blood vessels, 2 suits leaves."
          onChange={exponent => change({ exponent }, 'exponent')} />
      </>}
    </Section>
    <Section title="Colour">
      <ColorField label="Veins" value={s.veinColor} tip="Colour of the veins, in the view and every export." onChange={veinColor => change({ veinColor }, 'veinColor')} />
      <ColorField label="Background" value={s.background} tip="The sheet’s colour in the view and the PNG; SVG and DXF leave it out." onChange={background => change({ background }, 'background')} />
    </Section>
    <Section title="Curves">
      <SwitchField label="Smooth curves" checked={s.smooth}
        tip="Draw and export each vein as a smooth curve through its points. Off draws straight segments between them."
        onChange={smooth => change({ smooth }, 'smooth')} />
    </Section>
  </>
})
