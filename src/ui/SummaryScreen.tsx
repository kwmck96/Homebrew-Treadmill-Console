import {
  averageMph,
  elevationUnitLabel,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  paceUnitLabel,
} from '../lib/units'
import { useSettings } from '../settings/store'
import { lapTotals } from '../workout/engine'
import type { WorkoutRecord } from '../workout/types'
import styles from './SummaryScreen.module.css'

/** End-of-workout summary (M8). The workout is already saved when this shows. */
export function SummaryScreen({ record, onDone }: { record: WorkoutRecord; onDone: () => void }) {
  const unit = useSettings((s) => s.distanceUnit)
  const distUnit = unit === 'mi' ? 'mi' : 'km'
  const elevUnit = elevationUnitLabel(unit)
  const started = new Date(record.startedAt).toLocaleString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const totals: [string, string, string?][] = [
    ['Time', formatDuration(record.elapsedMs)],
    ['Distance', formatDistance(record.distanceM, unit), distUnit],
    ['Avg pace', formatPace(averageMph(record.distanceM, record.elapsedMs), unit), paceUnitLabel(unit)],
    ['Elev gain', formatElevation(record.elevGainM, unit), elevUnit],
    ['Elev loss', formatElevation(record.elevLossM, unit), elevUnit],
  ]

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Workout saved</h1>
          <p className={styles.date}>{started}</p>
        </div>
        <button type="button" className={styles.done} onClick={onDone}>
          Done
        </button>
      </header>

      <div className={styles.totals}>
        {totals.map(([label, value, u]) => (
          <div key={label} className={styles.total}>
            <span className={styles.totalLabel}>{label}</span>
            <span className={`${styles.totalValue} num`}>
              {value}
              {u && <span className={styles.totalUnit}> {u}</span>}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Lap</th>
              <th>Time</th>
              <th>Distance ({distUnit})</th>
              <th>Pace ({paceUnitLabel(unit)})</th>
              <th>Gain ({elevUnit})</th>
            </tr>
          </thead>
          <tbody>
            {record.laps.map((lap) => {
              const t = lapTotals(record, lap)
              return (
                <tr key={lap.index} className="num">
                  <td>{lap.index}</td>
                  <td>{formatDuration(t.elapsedMs)}</td>
                  <td>{formatDistance(t.distanceM, unit)}</td>
                  <td>{formatPace(averageMph(t.distanceM, t.elapsedMs), unit)}</td>
                  <td>{formatElevation(t.elevGainM, unit)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
