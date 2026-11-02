import { useState } from 'react'
import { averageMph, formatDistance, formatDuration, formatPace, METERS_PER_MILE, paceUnitLabel } from '../../lib/units'
import { formatDurationSpec } from '../../plan/format'
import { useSettings } from '../../settings/store'
import { clampIncline, clampSpeed, quantize } from '../../treadmill/limits'
import { stepRemaining } from '../../workout/runner'
import { activeRun, effectiveLimits, useConsole } from '../../workout/store'
import { Stepper } from '../builder/controls'
import { Sheet } from '../Sheet'
import { describeStepTarget } from './runText'
import styles from './WorkoutSheet.module.css'

/**
 * Every step of the running workout. Finished steps are locked; the current
 * step's remaining duration and targets, and anything after it, can be
 * changed on the fly.
 */
export function WorkoutSheet({ onClose }: { onClose: () => void }) {
  const run = useConsole((s) => activeRun(s.workout))
  const editRunStep = useConsole((s) => s.editRunStep)
  const unit = useSettings((s) => s.distanceUnit)
  const [selected, setSelected] = useState<number | null>(null)
  if (!run) return null

  const sel = selected != null && selected >= run.index ? selected : run.phase === 'running' ? run.index : null
  const step = sel != null ? run.steps[sel] : null
  const isCurrent = sel === run.index
  const unitM = unit === 'mi' ? METERS_PER_MILE : 1000

  return (
    <Sheet title={run.name} onClose={onClose}>
      <div className={styles.layout}>
        <ol className={styles.list}>
          {run.steps.map((s, i) => {
            const done = i < run.index
            const result = run.results.find((r) => r.index === i)
            const actual =
              done && result?.endMs != null
                ? actualText(result.endMs - result.startMs, (result.endM ?? 0) - result.startM, unit, result.skipped)
                : null
            return (
              <li key={i}>
                <button
                  type="button"
                  className={styles.row}
                  data-state={done ? 'done' : i === run.index && run.phase === 'running' ? 'now' : 'next'}
                  aria-pressed={i === sel}
                  disabled={done}
                  onClick={() => setSelected(i)}
                >
                  <span className={styles.rowLabel}>{s.label}</span>
                  <span className={`${styles.rowMeta} num`}>
                    {formatDurationSpec(s.duration, unit)} · {describeStepTarget(s, unit)}
                  </span>
                  <span className={`${styles.rowState} num`}>
                    {done ? actual : i === run.index && run.phase === 'running' ? 'Now' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className={styles.editor}>
          {step && sel != null ? (
            <>
              <h3 className={styles.editorTitle}>
                {step.label}
                {isCurrent && <span className={styles.now}>Now</span>}
              </h3>
              {step.duration.kind === 'time' ? (
                <Stepper
                  label={isCurrent ? 'Time left' : 'Duration'}
                  value={formatDuration(
                    isCurrent
                      ? 'ms' in stepRemaining(run)
                        ? (stepRemaining(run) as { ms: number }).ms
                        : 0
                      : step.duration.seconds * 1000,
                  )}
                  down={[
                    ['−1:00', -60],
                    ['−0:05', -5],
                  ]}
                  up={[
                    ['+0:05', 5],
                    ['+1:00', 60],
                  ]}
                  onStep={(d) => {
                    const secs = step.duration.kind === 'time' ? step.duration.seconds : 0
                    const floor = isCurrent ? Math.ceil(run.stepMs / 1000) + 1 : 1
                    editRunStep(sel, { seconds: Math.max(floor, secs + d) })
                  }}
                />
              ) : (
                <Stepper
                  label={isCurrent ? 'Distance left' : 'Distance'}
                  value={`${formatDistance(
                    isCurrent ? Math.max(0, step.duration.meters - run.stepM) : step.duration.meters,
                    unit,
                  )} ${unit}`}
                  down={[
                    ['−0.1', -0.1],
                    ['−.01', -0.01],
                  ]}
                  up={[
                    ['+.01', 0.01],
                    ['+0.1', 0.1],
                  ]}
                  onStep={(d) => {
                    const m = step.duration.kind === 'distance' ? step.duration.meters : 0
                    const floor = isCurrent ? run.stepM + 1 : 1
                    editRunStep(sel, { meters: Math.max(floor, m + d * unitM) })
                  }}
                />
              )}
              {step.restOff ? (
                <p className={styles.note}>
                  Off-treadmill rest: the belt keeps the next step's speed and incline.
                </p>
              ) : (
                <>
                  <Stepper
                    label={step.kind === 'rest' ? 'Walking speed' : 'Belt speed'}
                    value={`${step.speedMph.toFixed(1)} mph`}
                    note={`${formatPace(step.speedMph, unit)}${paceUnitLabel(unit)}`}
                    down={[
                      ['−1', -1],
                      ['−0.1', -0.1],
                    ]}
                    up={[
                      ['+0.1', 0.1],
                      ['+1', 1],
                    ]}
                    onStep={(d) =>
                      editRunStep(sel, { speedMph: clampSpeed(quantize(step.speedMph + d, 0.1), effectiveLimits()) })
                    }
                  />
                  <Stepper
                    label="Incline"
                    value={`${step.inclinePct.toFixed(1)} %`}
                    down={[['−0.5', -0.5]]}
                    up={[['+0.5', 0.5]]}
                    onStep={(d) =>
                      editRunStep(sel, { inclinePct: clampIncline(quantize(step.inclinePct + d, 0.5), effectiveLimits()) })
                    }
                  />
                </>
              )}
              <p className={styles.note}>
                Changes apply to this run only; the workout in the builder stays as it was.
              </p>
            </>
          ) : (
            <p className={styles.note}>All steps are done.</p>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function actualText(ms: number, m: number, unit: 'mi' | 'km', skipped?: boolean): string {
  const base = `${formatDuration(ms)} · ${formatDistance(m, unit)} ${unit}`
  const pace = m > 1 ? ` · ${formatPace(averageMph(m, ms), unit)}${paceUnitLabel(unit)}` : ''
  return skipped ? `Skipped · ${base}` : base + pace
}
