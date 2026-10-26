import type { CSSProperties } from 'react'
import {
  averageMph,
  type DistanceUnit,
  formatDistance,
  formatDuration,
  formatPace,
  paceUnitLabel,
} from '../../lib/units'
import { currentLap, lapAverageHr, lapTotals } from '../../workout/engine'
import { formatBpm } from '../../workout/fields'
import type { Lap, WorkoutRecord } from '../../workout/types'
import styles from './SplitsColumn.module.css'

interface LapRow {
  lap: Lap
  elapsedMs: number
  distanceM: number
  mph: number
  hr: number | null
}

/**
 * Share of the stretch reserved for the slowest lap, so it still shows a bit
 * of bar beyond its pace text.
 */
const MIN_STRETCH = 0.12

/**
 * Current lap on top, then completed laps newest-first, Strava style: a bar
 * behind each lap's pace, longer for faster laps.
 */
export function SplitsColumn({ record, unit }: { record: WorkoutRecord | null; unit: DistanceUnit }) {
  const rows: LapRow[] = (record?.laps ?? []).map((lap) => {
    const t = lapTotals(record!, lap)
    return {
      lap,
      elapsedMs: t.elapsedMs,
      distanceM: t.distanceM,
      mph: averageMph(t.distanceM, t.elapsedMs),
      hr: lapAverageHr(record!, lap),
    }
  })
  const current = record ? rows.at(-1)! : null
  const completed = rows.slice(0, -1).reverse()

  // Scale bars between the slowest and fastest completed lap. The open lap is
  // left out: its average swings while it's young and would rescale every bar.
  const speeds = completed.filter((r) => r.elapsedMs > 0).map((r) => r.mph)
  const vMin = Math.min(...speeds)
  const vMax = Math.max(...speeds)
  const barFraction = (mph: number) =>
    vMax - vMin < 0.05 ? 1 : MIN_STRETCH + (1 - MIN_STRETCH) * ((mph - vMin) / (vMax - vMin))

  const distUnit = unit === 'mi' ? 'mi' : 'km'
  const lapNumber = record ? currentLap(record).index : 1

  return (
    <section className={styles.column} aria-label="Lap splits">
      <div className={styles.current}>
        <div className={styles.currentTitle}>Lap {lapNumber}</div>
        <div className={`${styles.currentTime} num`}>{formatDuration(current?.elapsedMs ?? 0)}</div>
        <dl className={styles.currentStats}>
          <div>
            <dt>Pace</dt>
            <dd className="num">
              {formatPace(current?.mph ?? 0, unit)}
              <small>{paceUnitLabel(unit)}</small>
            </dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd className="num">
              {formatDistance(current?.distanceM ?? 0, unit)}
              <small>{distUnit}</small>
            </dd>
          </div>
          <div>
            <dt>Avg HR</dt>
            <dd className="num">
              {formatBpm(current?.hr ?? null)}
              <small>bpm</small>
            </dd>
          </div>
        </dl>
      </div>

      <div className={styles.tableHead} aria-hidden="true">
        <span>Lap</span>
        <span>Pace</span>
        <span>Time</span>
        <span>{distUnit}</span>
        <span>HR</span>
      </div>

      <ol className={styles.list}>
        {completed.length === 0 && (
          <li className={styles.empty}>Tap Lap to split. Completed laps appear here.</li>
        )}
        {completed.map((r) => (
          <li
            key={r.lap.index}
            className={`${styles.row} num`}
            style={{ '--bar': barFraction(r.mph) } as CSSProperties}
          >
            <span className={styles.lapNo}>{r.lap.index}</span>
            <span className={styles.pace}>
              <span className={styles.bar} aria-hidden="true" />
              <span className={styles.paceText}>{formatPace(r.mph, unit)}</span>
            </span>
            <span>{formatDuration(r.elapsedMs)}</span>
            <span>{formatDistance(r.distanceM, unit)}</span>
            <span>{formatBpm(r.hr)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
