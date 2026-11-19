import { memo } from 'react'
import type { Placement } from '../veins/attractors'
import type { PullMode } from '../veins/engine'
import { LIMITS, PRESETS, type PresetName, type Settings } from '../lib/settings'
import { decimals, toUnits, UNIT_LABEL } from '../lib/units'
import { Button, RangeField, Section, Segmented, SliderField, SwitchField, type Option } from './Controls'
import { Icon } from './Icon'
import type { Change } from './ShapePanel'

const placements = (picture: boolean): Option<Placement>[] => [
  { value: 'even', label: 'Even', tip: 'Evenly spread, never on a grid (blue noise). Gives the smoothest veins.' },
  { value: 'random', label: 'Random', tip: 'Scattered at random, with clumps and gaps. Veins wander more.' },
  { value: 'grid', label: 'Grid', tip: 'A jittered grid, the look of Gil’s BioVessel page. It can show its regularity.' },
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
    <Section title="Preset" tip="Growth settings and a look, set together for this sheet’s size. An imported shape stays.">
      <div className="button-row preset-row">
        {PRESETS.map(p => <Button key={p.id} tip={p.tip} onClick={() => onPreset(p.id)}>{p.label}</Button>)}
      </div>
    </Section>

    <Section title="Attractors" tip="Points veins grow toward. Each one is used up once a vein comes within the kill distance.">
      <SliderField label="Count" value={s.count} min={LIMITS.count[0]} max={LIMITS.count[1]} step={1} log format={v => Math.round(v).toLocaleString()}
        tip="How many attractors fill the shape. More gives denser veins and smoother branches." onChange={count => change({ count: Math.round(count) }, 'count')} />
      <Segmented label="Placement" options={placements(Boolean(picture))} value={s.placement} columns={5} onChange={placement => change({ placement }, 'placement')} />
      <div className="button-row">
        <Button tip="New random attractors and wiggle, with the same settings." onClick={onShuffle}><Icon name="dice" />New pattern</Button>
        <Button tip="Choose a picture (PNG or JPEG). With Placement set to Picture, darker areas get more attractors." onClick={onPicture}>{picture ? 'Change picture…' : 'Choose picture…'}</Button>
      </div>
      <p className="hint">Pattern {s.seed.toLocaleString()}{picture ? ` · picture ${picture}` : ''}</p>
    </Section>

    <Section title="Growth">
      <RangeField label="Segment length" value={s.segment} min={Math.min(0.05, segMax)} max={segMax} step={0.01} digits={digits} scale={k} suffix={unit}
        tip="Distance between neighbouring vein points. Smaller gives finer detail and takes more steps." onChange={segment => change({ segment }, 'segment')} />
      <RangeField label="Kill distance" value={s.kill} min={0.05} max={killMax} step={0.01} digits={digits} scale={k} suffix={unit}
        tip="How close a vein must come to use up an attractor. Smaller gives denser, finer veins; larger gives sparser, smoother ones. Keep it at least the segment length."
        onChange={kill => change({ kill }, 'kill')} />
      <SwitchField label="Limit attraction distance" checked={s.attraction > 0}
        tip="Off: every attractor pulls its nearest vein, however far, as in Runions’ leaves. On: only veins within the distance below feel it, which makes tips wander."
        onChange={on => change({ attraction: on ? Math.min(reachMax, Math.max(s.kill * 4, s.segment * 20)) : 0 }, 'attraction')} />
      {s.attraction > 0 && <RangeField label="Attraction distance" value={s.attraction} min={Math.max(0.1, s.kill)} max={reachMax} step={0.1} digits={digits} scale={k} suffix={unit}
        tip="How far a vein point senses attractors. Smaller makes branch tips wander between attractors, a wiggly, gnarly look." onChange={attraction => change({ attraction }, 'attraction')} />}
      {s.kill < s.segment && <p className="hint warning">The kill distance is shorter than a segment, so veins can step past attractors without using them up. Make it at least {(s.segment * k).toFixed(digits)} {unit}.</p>}
      <SwitchField label="Loops" checked={s.loops}
        tip="Closed venation: veins from several sides grow to the same attractor and join there, closing loops, like a real leaf’s fine net. Slower."
        onChange={loops => change({ loops }, 'loops')} />
      <SwitchField label="Leaf growth" checked={s.leafGrowth}
        tip="The shape grows outward from the first root, and attractors join in as the outline reaches them, so main veins form first, then finer ones."
        onChange={leafGrowth => change({ leafGrowth }, 'leafGrowth')} />
      {s.leafGrowth && <SliderField label="Grows over" value={s.leafSteps} min={LIMITS.leafSteps[0]} max={2000} step={10} format={v => `${Math.round(v)} steps`}
        tip="How many steps the outline takes to reach full size. Slower growth gives smoother main veins that follow the edge." onChange={leafSteps => change({ leafSteps }, 'leafSteps')} />}
      <SwitchField label="Keep veins apart" checked={s.apart}
        tip="Refuse a new point that would land on another vein. Off grows exactly as the older pages did, but points can pile up where attractors pull both ways."
        onChange={apart => change({ apart }, 'apart')} />
    </Section>

    <Section title="Feel">
      <SliderField label="Keep heading" value={s.inertia} min={0} max={0.95} step={0.05} format={v => `${Math.round(v * 100)} %`}
        tip="How much of its last heading a growing vein keeps, for smooth, steady curves like arteries. Side branches always start toward their own attractors."
        onChange={inertia => change({ inertia }, 'inertia')} />
      <SliderField label="Wiggle" value={s.wiggle} min={0} max={1.5} step={0.05} format={v => v.toFixed(2)}
        tip="A seeded wobble added to each step, so veins never run dead straight. The same pattern number gives the same wobble." onChange={wiggle => change({ wiggle }, 'wiggle')} />
      <SliderField label="Pull" value={s.pull} min={0} max={1} step={0.05} format={v => (v ? v.toFixed(2) : 'Off')}
        tip="A steady pull on every vein, in the direction below: up for trees, down for roots." onChange={pull => change({ pull }, 'pull')} />
      {s.pull > 0 && <Segmented label="Pull toward" options={PULLS} value={s.pullMode} onChange={pullMode => change({ pullMode }, 'pullMode')} />}
      <SliderField label="Speed" value={s.speed} min={LIMITS.speed[0]} max={LIMITS.speed[1]} step={1} format={v => `${Math.round(v)} steps/frame`}
        tip="Steps grown between screen updates. Higher grows faster; lower lets you watch each step." onChange={speed => change({ speed: Math.round(speed) }, 'speed')} />
    </Section>
  </>
})
