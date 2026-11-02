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
import { averageHr, lapTotals } from '../workout/engine'
import { describeStepTarget } from './workout/runText'
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
        {[...(record.pastRuns ?? []), ...(record.run ? [record.run] : [])].map((run, k) => (
          <table key={k} className={styles.table}>
            <caption className={styles.caption}>{run.name}: target vs. actual</caption>
            <thead>
              <tr>
                <th>Step</th>
                <th>Target</th>
                <th>Time</th>
                <th>Distance ({distUnit})</th>
                <th>Pace ({paceUnitLabel(unit)})</th>
                <th>Avg HR</th>
              </tr>
            </thead>
            <tbody>
              {run.results.map((r) => {
                const step = run.steps[r.index]
                const ms = (r.endMs ?? record.elapsedMs) - r.startMs
                const m = (r.endM ?? record.distanceM) - r.startM
                const hr = averageHr(record, r.startMs, r.endMs ?? record.elapsedMs)
                return (
                  <tr key={r.index} className="num" data-skipped={r.skipped ?? false}>
                    <td>
                      {step?.label}
                      {r.skipped && ' (skipped)'}
                      {r.addedMs > 0 && ` (+${Math.round(r.addedMs / 1000)}s)`}
                    </td>
                    <td>{step ? describeStepTarget(step, unit) : ''}</td>
                    <td>{formatDuration(ms)}</td>
                    <td>{formatDistance(m, unit)}</td>
                    <td>{m > 1 ? formatPace(averageMph(m, ms), unit) : '–'}</td>
                    <td>{hr == null ? '–' : Math.round(hr)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
        <table className={styles.table}>
          <caption className={styles.caption}>Laps</caption>
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
