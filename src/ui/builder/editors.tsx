import { useState } from 'react'
import { type DistanceUnit, formatDuration, KM_PER_MILE, METERS_PER_MILE } from '../../lib/units'
import { time } from '../../plan/defaults'
import { hrTargetRange, zoneBounds } from '../../plan/expand'
import { beltNote, formatDistanceSpec, formatPaceSec, paceUnit } from '../../plan/format'
import type { Duration, Recovery, RestSpec, StepSpec, TargetKind, ZoneSpec } from '../../plan/types'
import { useSettings } from '../../settings/store'
import { quantize } from '../../treadmill/limits'
import { useConsole } from '../../workout/store'
import { Dialog } from '../Dialog'
import { Check, Choices, Section, Stepper } from './controls'
import cstyles from './editors.module.css'

const { chipRow, chip, small, pair } = cstyles

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ---- duration ----------------------------------------------------------

const DISTANCE_CHIPS = [200, 400, 800, 1000, METERS_PER_MILE]

export function DurationEditor(props: {
  value: Duration
  onChange: (d: Duration) => void
  unit: DistanceUnit
  /** Off-treadmill rest is time-only. */
  timeOnly?: boolean
  label?: string
}) {
  const { value, unit } = props
  const unitM = unit === 'mi' ? METERS_PER_MILE : 1000
  // Remember the other mode's value while toggling.
  const [lastTime, setLastTime] = useState(value.kind === 'time' ? value.seconds : 300)
  const [lastDist, setLastDist] = useState(value.kind === 'distance' ? value.meters : 1609.344)

  const setKind = (k: Duration['kind']) => {
    if (k === value.kind) return
    if (value.kind === 'time') setLastTime(value.seconds)
    else setLastDist(value.meters)
    props.onChange(k === 'time' ? time(lastTime) : { kind: 'distance', meters: lastDist })
  }

  return (
    <>
      <Choices
        label={props.label ?? 'Duration'}
        value={value.kind}
        options={[
          { value: 'time', label: 'Time' },
          { value: 'distance', label: 'Distance', disabled: props.timeOnly },
        ]}
        onChange={setKind}
        note={props.timeOnly ? 'Off-treadmill rest is time-based.' : undefined}
      />
      {value.kind === 'time' ? (
        <Stepper
          label="Time"
          value={formatDuration(value.seconds * 1000)}
          down={[
            ['−1:00', -60],
            ['−0:05', -5],
          ]}
          up={[
            ['+0:05', 5],
            ['+1:00', 60],
          ]}
          onStep={(d) => props.onChange(time(clamp(value.seconds + d, 5, 4 * 3600)))}
        />
      ) : (
        <>
          <Stepper
            label="Distance"
            value={formatDistanceSpec(value.meters, unit)}
            down={[
              ['−0.1', -0.1],
              ['−.01', -0.01],
            ]}
            up={[
              ['+.01', 0.01],
              ['+0.1', 0.1],
            ]}
            onStep={(d) => {
              // Step in the display unit, snapped to its hundredths.
              const v = Math.round((value.meters / unitM + d) * 100) / 100
              props.onChange({ kind: 'distance', meters: clamp(v, 0.01, 50) * unitM })
            }}
          />
          <div className={chipRow}>
            {DISTANCE_CHIPS.map((m) => (
              <button
                key={m}
                type="button"
                className={chip}
                aria-pressed={Math.abs(value.meters - m) < 0.5}
                onClick={() => props.onChange({ kind: 'distance', meters: m })}
              >
                {m === METERS_PER_MILE ? '1 mi' : m === 1000 ? '1 km' : `${m} m`}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ---- pace ----------------------------------------------------------------

export function PaceEditor(props: {
  label: string
  secPerMile: number
  onChange: (s: number) => void
  unit: DistanceUnit
}) {
  const factor = props.unit === 'mi' ? 1 : KM_PER_MILE
  return (
    <Stepper
      label={props.label}
      value={
        <>
          {formatPaceSec(props.secPerMile, props.unit)}
          <small className={small}>{paceUnit(props.unit)}</small>
        </>
      }
      down={[
        ['−0:30', -30],
        ['−0:05', -5],
      ]}
      up={[
        ['+0:05', 5],
        ['+0:30', 30],
      ]}
      // Faster = smaller number, so "−" makes the pace quicker. Steps are in
      // seconds per display unit; stored per mile. Clamped to the belt's range.
      onStep={(d) => props.onChange(clamp(props.secPerMile + d * factor, 3600 / 16, 3600 / 0.5))}
      note={beltNote(props.secPerMile, props.unit)}
    />
  )
}

// ---- targets -------------------------------------------------------------

export function StepEditor(props: {
  value: StepSpec
  onChange: (s: StepSpec) => void
  unit: DistanceUnit
  /** Recovery steps can auto-advance on HR. */
  recovery?: boolean
}) {
  const s = props.value
  const set = (patch: Partial<StepSpec>) => props.onChange({ ...s, ...patch })
  const strap = useConsole((st) => st.heartRate.connection === 'connected')
  const { maxHr, restHr, update } = useSettings()
  const hrDisabledNote = strap ? undefined : 'Connect a heart-rate strap to use HR targets.'

  return (
    <>
      <DurationEditor
        value={s.duration}
        onChange={(duration) => set({ duration })}
        unit={props.unit}
        label={s.advanceOnHr && s.targetKind === 'hr' ? 'Duration (maximum)' : 'Duration'}
      />
      <Choices<TargetKind>
        label="Target"
        value={s.targetKind}
        options={[
          { value: 'pace', label: 'Pace' },
          { value: 'hr', label: 'Heart rate', disabled: !strap },
          { value: 'zone', label: 'HR zone', disabled: !strap },
          { value: 'rpe', label: 'Effort' },
        ]}
        onChange={(targetKind) => set({ targetKind })}
        note={hrDisabledNote}
      />

      {s.targetKind === 'pace' && (
        <PaceEditor label="Pace" secPerMile={s.paceSecPerMile} onChange={(paceSecPerMile) => set({ paceSecPerMile })} unit={props.unit} />
      )}

      {s.targetKind === 'hr' && (
        <>
          <Stepper
            label="Heart rate"
            value={`${s.hrBpm} bpm`}
            down={[
              ['−5', -5],
              ['−1', -1],
            ]}
            up={[
              ['+1', 1],
              ['+5', 5],
            ]}
            onStep={(d) => set({ hrBpm: clamp(s.hrBpm + d, 60, 220) })}
            note={(() => {
              const r = hrTargetRange(s.hrBpm)
              return `Target range ${r.low}–${r.high} bpm (±4 %)`
            })()}
          />
          {props.recovery && (
            <Check
              label="Start the next rep automatically at this heart rate"
              checked={s.advanceOnHr}
              onChange={(advanceOnHr) => set({ advanceOnHr })}
              note={`The next rep starts winding up 5 s after HR falls to ${s.hrBpm} bpm. The duration above becomes the maximum.`}
            />
          )}
        </>
      )}

      {s.targetKind === 'zone' && (
        <ZoneEditor
          zone={s.zone}
          onChange={(zone) => set({ zone })}
          maxHr={maxHr}
          restHr={restHr}
          onProfile={(p) => update(p)}
        />
      )}

      {s.targetKind === 'rpe' && (
        <Choices
          label="Perceived effort"
          value={String(s.rpe)}
          options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          onChange={(v) => set({ rpe: Number(v) })}
        />
      )}

      {s.targetKind !== 'pace' && (
        <PaceEditor
          label="Starting pace"
          secPerMile={s.paceSecPerMile}
          onChange={(paceSecPerMile) => set({ paceSecPerMile })}
          unit={props.unit}
        />
      )}

      <Stepper
        label="Incline"
        value={`${s.inclinePct.toFixed(1)} %`}
        down={[['−0.5', -0.5]]}
        up={[['+0.5', 0.5]]}
        onStep={(d) => set({ inclinePct: clamp(quantize(s.inclinePct + d, 0.5), -3, 15) })}
      />
    </>
  )
}

function ZoneEditor(props: {
  zone: ZoneSpec
  onChange: (z: ZoneSpec) => void
  maxHr: number
  restHr: number
  onProfile: (p: { maxHr?: number; restHr?: number }) => void
}) {
  const z = props.zone
  const profile = { maxHr: props.maxHr, restHr: props.restHr }
  const mode = z.mode === 'computed' ? String(z.zone) : 'custom'
  return (
    <>
      <Choices
        label="Zone"
        value={mode}
        options={[
          ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Z${n}` })),
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(v) => {
          if (v !== 'custom') {
            props.onChange({ mode: 'computed', zone: Number(v) as 1 | 2 | 3 | 4 | 5 })
          } else if (z.mode === 'computed') {
            // Start the custom bounds from the zone that was selected.
            const b = zoneBounds(z.zone, profile)
            props.onChange({ mode: 'custom', lowBpm: b.low, highBpm: b.high })
          }
        }}
        note={
          z.mode === 'computed'
            ? (() => {
                const b = zoneBounds(z.zone, profile)
                return `Zone ${z.zone}: ${b.low}–${b.high} bpm (heart-rate reserve, from your max and resting HR)`
              })()
            : undefined
        }
      />
      {z.mode === 'computed' ? (
        <div className={pair}>
          <Stepper
            label="Max HR"
            value={props.maxHr}
            down={[['−1', -1]]}
            up={[['+1', 1]]}
            onStep={(d) => props.onProfile({ maxHr: clamp(props.maxHr + d, props.restHr + 20, 230) })}
          />
          <Stepper
            label="Resting HR"
            value={props.restHr}
            down={[['−1', -1]]}
            up={[['+1', 1]]}
            onStep={(d) => props.onProfile({ restHr: clamp(props.restHr + d, 30, props.maxHr - 20) })}
          />
        </div>
      ) : (
        <div className={pair}>
          <Stepper
            label="Lower bound"
            value={`${z.lowBpm}`}
            down={[['−1', -1]]}
            up={[['+1', 1]]}
            onStep={(d) => props.onChange({ ...z, lowBpm: clamp(z.lowBpm + d, 40, z.highBpm - 1) })}
          />
          <Stepper
            label="Upper bound"
            value={`${z.highBpm}`}
            down={[['−1', -1]]}
            up={[['+1', 1]]}
            onStep={(d) => props.onChange({ ...z, highBpm: clamp(z.highBpm + d, z.lowBpm + 1, 230) })}
          />
        </div>
      )}
    </>
  )
}

// ---- rest ----------------------------------------------------------------

export function RestEditor(props: { value: RestSpec; onChange: (r: RestSpec) => void; unit: DistanceUnit; nextSpeedMph?: number }) {
  const r = props.value
  const set = (patch: Partial<RestSpec>) => props.onChange({ ...r, ...patch })
  const strap = useConsole((st) => st.heartRate.connection === 'connected')
  const [warn, setWarn] = useState(false)

  return (
    <>
      <Choices
        label="Where"
        value={r.where}
        options={[
          { value: 'on', label: 'On treadmill' },
          { value: 'off', label: 'Off treadmill' },
        ]}
        onChange={(where) => (where === 'off' ? setWarn(true) : set({ where }))}
        note={
          r.where === 'on'
            ? 'The belt slows for the rest; distance keeps logging.'
            : "Standing recovery off the belt: time runs, distance doesn't. The belt keeps running at the next rep's speed."
        }
      />
      {warn && (
        <Dialog
          title="Recovering off the treadmill"
          tone="warning"
          actions={[
            { label: 'Nevermind', onClick: () => setWarn(false) },
            {
              label: 'I Understand',
              tone: 'primary',
              onClick: () => {
                setWarn(false)
                set({ where: 'off', duration: r.duration.kind === 'time' ? r.duration : time(120) })
              },
            },
          ]}
        >
          <p>
            The belt <strong>keeps running at the next rep's speed</strong>
            {props.nextSpeedMph ? ` (${props.nextSpeedMph.toFixed(1)} mph)` : ''} while you're off, so
            you'll step back onto a moving belt. Stepping onto a fast belt is a common way to fall.
          </p>
          <p>
            <strong>Unclip the lanyard before you step off.</strong> If it's still clipped it will stop
            the belt and pause the workout. Clip it back on before you step on.
          </p>
        </Dialog>
      )}

      {r.where === 'on' && (
        <Stepper
          label="Belt speed"
          value={`${r.onSpeedMph.toFixed(1)} mph`}
          down={[
            ['−0.5', -0.5],
            ['−0.1', -0.1],
          ]}
          up={[
            ['+0.1', 0.1],
            ['+0.5', 0.5],
          ]}
          onStep={(d) => set({ onSpeedMph: clamp(quantize(r.onSpeedMph + d, 0.1), 0.5, 5) })}
        />
      )}

      <DurationEditor
        value={r.duration}
        onChange={(duration) => set({ duration })}
        unit={props.unit}
        timeOnly={r.where === 'off'}
        label={r.useHr && r.advanceOnHr ? 'Duration (maximum)' : 'Duration'}
      />

      <Check
        label="Use a heart-rate target"
        checked={r.useHr}
        disabled={!strap}
        onChange={(useHr) => set({ useHr })}
        note={strap ? undefined : 'Connect a heart-rate strap to use HR targets.'}
      />
      {r.useHr && (
        <>
          <Stepper
            label="Heart rate"
            value={`${r.hrBpm} bpm`}
            down={[
              ['−5', -5],
              ['−1', -1],
            ]}
            up={[
              ['+1', 1],
              ['+5', 5],
            ]}
            onStep={(d) => set({ hrBpm: clamp(r.hrBpm + d, 60, 200) })}
          />
          <Check
            label="Start the next rep automatically at this heart rate"
            checked={r.advanceOnHr}
            onChange={(advanceOnHr) => set({ advanceOnHr })}
            note={`The next rep starts winding up 5 s after HR falls to ${r.hrBpm} bpm. The duration above becomes the maximum.`}
          />
        </>
      )}
    </>
  )
}

// ---- recovery between reps ----------------------------------------------------

export function RecoveryEditor(props: {
  title: string
  value: Recovery
  onChange: (r: Recovery) => void
  unit: DistanceUnit
  nextSpeedMph?: number
}) {
  const r = props.value
  return (
    <Section title={props.title}>
      <Choices
        value={r.kind}
        options={[
          { value: 'active', label: 'Active recovery' },
          { value: 'rest', label: 'Rest' },
        ]}
        onChange={(kind) => props.onChange({ ...r, kind })}
      />
      {r.kind === 'active' ? (
        <StepEditor value={r.active} onChange={(active) => props.onChange({ ...r, active })} unit={props.unit} recovery />
      ) : (
        <RestEditor
          value={r.rest}
          onChange={(rest) => props.onChange({ ...r, rest })}
          unit={props.unit}
          nextSpeedMph={props.nextSpeedMph}
        />
      )}
    </Section>
  )
}
