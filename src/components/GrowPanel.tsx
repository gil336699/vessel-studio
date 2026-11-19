import { memo } from 'react'
import type { Placement } from '../veins/attractors'
import type { PullMode } from '../veins/engine'
import { LIMITS, PRESETS, type PresetName, type Settings } from '../lib/settings'
import { decimals, toUnits, trimZeros, UNIT_LABEL } from '../lib/units'
import { Button, RangeField, Section, Segmented, SliderField, SwitchField, type Option } from './Controls'
import { Icon } from './Icon'
import type { Change } from './ShapePanel'

const placements = (picture: boolean): Option<Placement>[] => [
  { value: 'even', label: 'Even', tip: 'Spread evenly, without a grid; gives the smoothest veins.' },
  { value: 'random', label: 'Random', tip: 'Scattered at random, with clumps and gaps. Veins wander more.' },
  { value: 'grid', label: 'Grid', tip: 'A slightly jittered grid, whose rows can show.' },
  { value: 'edge', label: 'Edge', tip: 'Crowded near the outline, so fine twigs fill the edge, as in a tree’s crown.' },
  { value: 'picture', label: 'Picture', tip: 'More attractors where a picture is darker, so veins follow its dark areas.', unavailable: !picture && 'Choose a picture first, with the button below.' },
]
const PULLS: Option<PullMode>[] = [
  { value: 'up', label: 'Up', tip: 'Pull veins upward, as light draws a tree.' },
  { value: 'down', label: 'Down', tip: 'Pull veins downward, as gravity draws roots or lightning.' },
  { value: 'left', label: 'Left', tip: 'Pull veins to the left.' },
  { value: 'right', label: 'Right', tip: 'Pull veins to the right, as a river flows.' },
  { value: 'out', label: 'Out', tip: 'Pull each vein away from its root, so veins spread outward.' },
]

export const GrowPanel = memo(function GrowPanel({ s, change, onPreset, onShuffle, picture, onPicture }: {
  s: Settings; change: Change; onPreset: (name: PresetName) => void; onShuffle: () => void; picture: string | null; onPicture: () => void
}) {
  // Lengths are stored in mm and shown in the sheet's unit.
  const k = toUnits(1, s.units, s.dpi), unit = UNIT_LABEL[s.units], digits = decimals(s.units, true)
  const span = Math.max(s.width, s.height)
  const segMax = Math.max(1, span / 20), killMax = Math.max(2, span / 8), reachMax = Math.max(5, span / 2)
  return <>
    <Section title="Preset" tip="Sets the growth, widths, colour and a matching built-in shape for this sheet; an imported shape stays.">
      <div className="button-row preset-row">
        {PRESETS.map(p => <Button key={p.id} tip={p.tip} onClick={() => onPreset(p.id)}>{p.label}</Button>)}
      </div>
    </Section>

    <Section title="Attractors" tip="Points veins grow toward. Each one is used up once a vein comes within the kill distance.">
      <RangeField label="Count" value={s.count} min={LIMITS.count[0]} max={LIMITS.count[1]} step={1} digits={0} log onRelease
        tip="How many attractors fill the shape. More gives denser veins and smoother branches." onChange={count => change({ count: Math.round(count) }, 'count')} />
      <Segmented label="Placement" options={placements(Boolean(picture))} value={s.placement} columns={3} onChange={placement => change({ placement }, 'placement')} />
      <div className="button-row one-line">
        <Button tip="New random attractors and wiggle, with the same settings." onClick={onShuffle}><Icon name="dice" />New pattern</Button>
        <Button tip={picture ? 'Choose another picture (PNG or JPEG): with Placement set to Picture, darker areas get more attractors.' : 'Choose a picture (PNG or JPEG): with Placement set to Picture, darker areas get more attractors.'} onClick={onPicture}>Picture…</Button>
      </div>
      <p className="hint">Pattern {s.seed.toLocaleString()}{picture ? ` · picture ${picture}` : ''}</p>
    </Section>

    <Section title="Growth">
      <RangeField label="Segment length" value={s.segment} min={Math.min(0.05, segMax)} max={segMax} step={0.01} digits={digits} scale={k} suffix={unit}
        tip="Distance between neighbouring vein points. Smaller gives finer detail and takes more steps." onChange={segment => change({ segment }, 'segment')} />
      <RangeField label="Kill distance" value={s.kill} min={0.05} max={killMax} step={0.01} digits={digits} scale={k} suffix={unit}
        tip="How close a vein must come to use up an attractor; smaller gives finer, denser veins."
        onChange={kill => change({ kill }, 'kill')} />
      <SwitchField label="Limit attraction distance" checked={s.attraction > 0}
        tip="On, veins feel only attractors within the distance below, so their tips wander; off, every attractor pulls, as in a leaf."
        onChange={on => change({ attraction: on ? Math.min(reachMax, Math.max(s.kill * 4, s.segment * 20)) : 0 }, 'attraction')} />
      {s.attraction > 0 && <RangeField label="Attraction distance" value={s.attraction} min={Math.max(0.1, s.kill)} max={reachMax} step={0.1} digits={digits} scale={k} suffix={unit}
        tip="How far a vein point senses attractors. Smaller makes branch tips wander between attractors, a wiggly, gnarly look." onChange={attraction => change({ attraction }, 'attraction')} />}
      {s.kill < s.segment && <p className="hint warning">The kill distance is shorter than a segment, so veins can step past attractors without using them up. Make it at least {trimZeros((s.segment * k).toFixed(digits))} {unit}.</p>}
      <SwitchField label="Loops" checked={s.loops}
        tip="Veins from several sides grow to the same attractor and join, closing loops like a leaf’s fine net; slower."
        onChange={loops => change({ loops }, 'loops')} />
      <SwitchField label="Leaf growth" checked={s.leafGrowth}
        tip="The shape grows out from the first root, so main veins form first and finer ones fill in after."
        onChange={leafGrowth => change({ leafGrowth }, 'leafGrowth')} />
      {s.leafGrowth && <SliderField label="Grows over" value={s.leafSteps} min={LIMITS.leafSteps[0]} max={2000} step={10} format={v => `${Math.round(v)} steps`}
        tip="How many steps the outline takes to reach full size. Slower growth gives smoother main veins that follow the edge." onChange={leafSteps => change({ leafSteps }, 'leafSteps')} />}
      <SwitchField label="Keep veins apart" checked={s.apart}
        tip="Refuses a new point that would land on another vein, so points never pile up."
        onChange={apart => change({ apart }, 'apart')} />
      <SliderField label="Speed" value={s.speed} min={LIMITS.speed[0]} max={LIMITS.speed[1]} step={1} format={v => `${Math.round(v)} ${Math.round(v) === 1 ? 'step' : 'steps'} a frame`}
        tip="Steps grown between screen updates. Higher grows faster; lower lets you watch each step." onChange={speed => change({ speed: Math.round(speed) }, 'speed')} />
    </Section>

    <Section title="Feel" folded="Keep heading, wiggle, pull">
      <SliderField label="Keep heading" value={s.inertia} min={0} max={0.95} step={0.05} format={v => `${Math.round(v * 100)} %`}
        tip="How much of its last heading a vein keeps, for smooth, steady curves like arteries."
        onChange={inertia => change({ inertia }, 'inertia')} />
      <SliderField label="Wiggle" value={s.wiggle} min={0} max={1.5} step={0.05} format={v => `${Math.round(v * 100)} %`}
        tip="A wobble added to each step, so veins never run dead straight; the pattern number sets it." onChange={wiggle => change({ wiggle }, 'wiggle')} />
      <SliderField label="Pull" value={s.pull} min={0} max={1} step={0.05} format={v => (v ? `${Math.round(v * 100)} %` : 'Off')}
        tip="A steady pull on every vein, in the direction below: up for trees, down for roots." onChange={pull => change({ pull }, 'pull')} />
      {s.pull > 0 && <Segmented label="Pull toward" options={PULLS} value={s.pullMode} onChange={pullMode => change({ pullMode }, 'pullMode')} />}
    </Section>
  </>
})
