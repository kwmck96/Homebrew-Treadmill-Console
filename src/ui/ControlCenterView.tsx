import { useState } from 'react'
import { formatPace, formatSpeed, paceUnitLabel, speedUnitLabel } from '../lib/units'
import { useSettings } from '../settings/store'
import { clampIncline, clampSpeed, quantize } from '../treadmill/limits'
import { effectiveLimits, useConsole } from '../workout/store'
import { ControlBar } from './ControlBar'
import { FieldGrid } from './FieldGrid'
import { Lane } from './Lane'
import styles from './ControlCenterView.module.css'
import { PauseBanner } from './PauseBanner'

const SPEED_STEPS = [
  { label: '+1', delta: 1 },
  { label: '+0.1', delta: 0.1 },
  { label: '−1', delta: -1 },
  { label: '−0.1', delta: -0.1 },
]
const INCLINE_STEPS = [
  { label: '+0.5', delta: 0.5 },
  { label: '−0.5', delta: -0.5 },
]

/** Treat actual as "at target" within these tolerances (M5). */
const SPEED_TOLERANCE_MPH = 0.05
const INCLINE_TOLERANCE_PCT = 0.1

/** The original workout layout: big speed and incline lanes with presets. */
export function ControlCenterView() {
  const treadmill = useConsole((s) => s.treadmill)
  const workout = useConsole((s) => s.workout)
  const heartRateBpm = useConsole((s) => s.heartRate.bpm)
  const { nudgeSpeed, nudgeIncline, jumpToPreset } = useConsole.getState()
  const settings = useSettings()
  const [editing, setEditing] = useState<'speed' | 'incline' | null>(null)

  const unit = settings.distanceUnit
  const running = workout?.status === 'running'
  const canDrive = running && treadmill.connection === 'connected' && treadmill.belt === 'running'

  const speed = treadmill.actualSpeedMph
  const showPace = settings.speedDisplay === 'pace'
  const speedRamping = Math.abs(treadmill.targetSpeedMph - speed) > SPEED_TOLERANCE_MPH
  const inclineRamping =
    Math.abs(treadmill.targetInclinePct - treadmill.actualInclinePct) > INCLINE_TOLERANCE_PCT

  const limits = effectiveLimits()

  // "Current" for hold-to-set and "Set to current": the belt's target speed,
  // or the last one while stopped (the store's dial value tracks exactly that),
  // and the deck's target incline.
  const saveCurrentSpeed = (id: string) =>
    settings.setPresetValue('speed', id, clampSpeed(useConsole.getState().dialMph, limits))
  const saveCurrentIncline = (id: string) =>
    settings.setPresetValue(
      'incline',
      id,
      clampIncline(useConsole.getState().treadmill.targetInclinePct, limits),
    )

  return (
    <main className={styles.main}>
      <Lane
        title="Speed"
        accent="speed"
        readout={showPace ? formatPace(speed, unit) : formatSpeed(speed, unit)}
        readoutUnit={showPace ? paceUnitLabel(unit) : speedUnitLabel(unit)}
        idle={speed < 0.05}
        secondary={
          <span className="num">
            {showPace
              ? `${formatSpeed(speed, unit)} ${speedUnitLabel(unit)}`
              : `${formatPace(speed, unit)} ${paceUnitLabel(unit)}`}
          </span>
        }
        target={`${formatSpeed(treadmill.targetSpeedMph, unit)} ${speedUnitLabel(unit)}`}
        ramping={canDrive && speedRamping}
        presets={settings.speedPresets}
        formatPreset={(v) => ({
          main: formatSpeed(v, unit),
          sub: `${formatPace(v, unit)}${paceUnitLabel(unit)}`,
        })}
        activePresetValue={canDrive ? treadmill.targetSpeedMph : null}
        onPresetTap={(id) => jumpToPreset('speed', id, settings.lapOnSpeedPresetTap)}
        onPresetHold={saveCurrentSpeed}
        lapOnTap={settings.lapOnSpeedPresetTap}
        onToggleLapOnTap={() =>
          settings.update({ lapOnSpeedPresetTap: !settings.lapOnSpeedPresetTap })
        }
        editing={editing === 'speed'}
        onToggleEditing={() => setEditing(editing === 'speed' ? null : 'speed')}
        presetStep={0.1}
        onPresetChange={(id, v) => settings.setPresetValue('speed', id, clampSpeed(v, limits))}
        onUseCurrent={saveCurrentSpeed}
        steps={SPEED_STEPS}
        stepUnit="mph"
        onStep={nudgeSpeed}
        enabled={canDrive}
      />

      <section className={styles.center}>
        <PauseBanner />
        <FieldGrid
          ctx={{
            record: workout,
            actualSpeedMph: speed,
            actualInclinePct: treadmill.actualInclinePct,
            heartRateBpm,
            unit,
          }}
        />
        <div className={styles.controls}>
          <ControlBar />
        </div>
      </section>

      <Lane
        title="Incline"
        accent="grade"
        readout={quantize(treadmill.actualInclinePct, 0.1).toFixed(1)}
        readoutUnit="%"
        target={`${treadmill.targetInclinePct.toFixed(1)} %`}
        ramping={canDrive && inclineRamping}
        presets={settings.inclinePresets}
        formatPreset={(v) => ({ main: `${v.toFixed(1)}%` })}
        activePresetValue={canDrive ? treadmill.targetInclinePct : null}
        onPresetTap={(id) => jumpToPreset('incline', id, settings.lapOnInclinePresetTap)}
        onPresetHold={saveCurrentIncline}
        lapOnTap={settings.lapOnInclinePresetTap}
        onToggleLapOnTap={() =>
          settings.update({ lapOnInclinePresetTap: !settings.lapOnInclinePresetTap })
        }
        editing={editing === 'incline'}
        onToggleEditing={() => setEditing(editing === 'incline' ? null : 'incline')}
        presetStep={0.5}
        onPresetChange={(id, v) =>
          settings.setPresetValue('incline', id, clampIncline(v, limits))
        }
        onUseCurrent={saveCurrentIncline}
        steps={INCLINE_STEPS}
        stepUnit="percent"
        onStep={nudgeIncline}
        enabled={canDrive}
      />
    </main>
  )
}
