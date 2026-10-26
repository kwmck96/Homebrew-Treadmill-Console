import type { CSSProperties, ReactNode } from 'react'
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  paceUnitLabel,
  speedUnitLabel,
} from '../../lib/units'
import { useSettings } from '../../settings/store'
import { quantize } from '../../treadmill/limits'
import { useConsole } from '../../workout/store'
import { ControlBar } from '../ControlBar'
import { HoldButton } from '../HoldButton'
import { PauseBanner } from '../PauseBanner'
import { PendingLapOverlay } from '../PendingLapOverlay'
import { ActivityChart } from './ActivityChart'
import styles from './ChartsView.module.css'
import { PresetHoldButton } from './PresetHoldButton'
import { SpeedWheel } from './SpeedWheel'
import { SplitsColumn } from './SplitsColumn'

const INCLINE_STEPS = [-0.5, 0.5]
const SPEED_TOLERANCE_MPH = 0.05
const INCLINE_TOLERANCE_PCT = 0.1

/**
 * Metrics across the top, splits down the left, a live graph filling the
 * rest, and along the bottom: Recover / speed wheel / Run, pause-lap, and
 * incline steps.
 */
export function ChartsView() {
  const treadmill = useConsole((s) => s.treadmill)
  const workout = useConsole((s) => s.workout)
  const { nudgeIncline, jumpToPreset } = useConsole.getState()
  const unit = useSettings((s) => s.distanceUnit)
  const speedPresets = useSettings((s) => s.speedPresets)
  const recover = speedPresets.find((p) => p.id === 'recovery')
  const run = speedPresets.find((p) => p.id === 'run')
  // Hold-to-set saves whatever the wheel currently shows.
  const saveWheelTo = (id: string) =>
    useSettings.getState().setPresetValue('speed', id, useConsole.getState().dialMph)
  const showPace = useSettings((s) => s.speedDisplay) === 'pace'

  const canDrive =
    workout?.status === 'running' &&
    treadmill.connection === 'connected' &&
    treadmill.belt === 'running'
  const speed = treadmill.actualSpeedMph
  const speedRamping =
    canDrive && Math.abs(treadmill.targetSpeedMph - speed) > SPEED_TOLERANCE_MPH
  const inclineRamping =
    canDrive &&
    Math.abs(treadmill.targetInclinePct - treadmill.actualInclinePct) > INCLINE_TOLERANCE_PCT

  return (
    <main className={styles.view}>
      <div className={styles.metrics}>
        <Metric
          label={showPace ? 'Pace' : 'Speed'}
          accent="speed"
          value={showPace ? formatPace(speed, unit) : formatSpeed(speed, unit)}
          unit={showPace ? paceUnitLabel(unit) : speedUnitLabel(unit)}
          note={
            speedRamping
              ? `Target ${formatSpeed(treadmill.targetSpeedMph, unit)} ${speedUnitLabel(unit)}`
              : showPace
                ? `${formatSpeed(speed, unit)} ${speedUnitLabel(unit)}`
                : `${formatPace(speed, unit)} ${paceUnitLabel(unit)}`
          }
          highlightNote={speedRamping}
        />
        <Metric
          label="Incline"
          accent="grade"
          value={quantize(treadmill.actualInclinePct, 0.1).toFixed(1)}
          unit="%"
          note={inclineRamping ? `Target ${treadmill.targetInclinePct.toFixed(1)} %` : undefined}
          highlightNote={inclineRamping}
        />
        <Metric label="Time" value={formatDuration(workout?.elapsedMs ?? 0)} />
        <Metric
          label="Distance"
          value={formatDistance(workout?.distanceM ?? 0, unit)}
          unit={unit === 'mi' ? 'mi' : 'km'}
        />
      </div>

      <div className={styles.middle}>
        <SplitsColumn record={workout} unit={unit} />
        <div className={styles.chartColumn}>
          <PauseBanner />
          <ActivityChart />
          <PendingLapOverlay />
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.speedControls} role="group" aria-label="Speed">
          {recover && (
            <PresetHoldButton
              label="Recover"
              valueMph={recover.value}
              unit={unit}
              canTap={canDrive}
              onTap={() =>
                jumpToPreset('speed', 'recovery', useSettings.getState().lapOnPresetTap)
              }
              onHold={() => saveWheelTo('recovery')}
            />
          )}
          <SpeedWheel />
          {run && (
            <PresetHoldButton
              label="Run"
              valueMph={run.value}
              unit={unit}
              canTap={canDrive}
              onTap={() => jumpToPreset('speed', 'run', useSettings.getState().lapOnPresetTap)}
              onHold={() => saveWheelTo('run')}
            />
          )}
        </div>
        <div className={styles.center}>
          <ControlBar />
        </div>
        <StepGroup
          label="Incline"
          accent="grade"
          steps={INCLINE_STEPS}
          format={(d) => `${d > 0 ? '+' : '−'}${Math.abs(d)}%`}
          describe={(d) => `${d > 0 ? 'Increase' : 'Decrease'} incline by ${Math.abs(d)} percent`}
          onStep={nudgeIncline}
          enabled={canDrive}
        />
      </div>
    </main>
  )
}

function Metric(props: {
  label: string
  value: string
  unit?: string
  note?: ReactNode
  highlightNote?: boolean
  accent?: 'speed' | 'grade'
}) {
  const style = props.accent ? ({ '--accent': `var(--${props.accent})` } as CSSProperties) : undefined
  return (
    <div className={styles.metric} style={style} data-accent={props.accent ?? 'none'}>
      <span className={styles.metricLabel}>{props.label}</span>
      <span className={styles.metricValueRow}>
        <span className={`${styles.metricValue} num`}>{props.value}</span>
        {props.unit && <span className={styles.metricUnit}>{props.unit}</span>}
      </span>
      {props.note && (
        <span className={`${styles.metricNote} num`} data-highlight={props.highlightNote ?? false}>
          {props.note}
        </span>
      )}
    </div>
  )
}

function StepGroup(props: {
  label: string
  accent: 'speed' | 'grade'
  steps: number[]
  format: (delta: number) => string
  describe: (delta: number) => string
  onStep: (delta: number) => void
  enabled: boolean
}) {
  const style = {
    '--accent': `var(--${props.accent})`,
    '--accent-ink': `var(--${props.accent}-ink)`,
  } as CSSProperties
  return (
    <div className={styles.steps} style={style} role="group" aria-label={props.label}>
      {props.steps.map((d) => (
        <HoldButton
          key={d}
          className={styles.step}
          disabled={!props.enabled}
          aria-label={props.describe(d)}
          onTrigger={() => props.onStep(d)}
        >
          <span className="num">{props.format(d)}</span>
        </HoldButton>
      ))}
    </div>
  )
}
