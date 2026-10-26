import { SimulatedTreadmill } from '../treadmill/simulator'
import { getDriver, getHeartRateSource, type SimTimeScale, useConsole } from '../workout/store'
import styles from './Panels.module.css'
import { Sheet } from './Sheet'

const TIME_SCALES: SimTimeScale[] = [1, 10, 30]

/**
 * Test controls that only exist with the simulator: fake the events the real
 * hardware will produce, so the app's reactions can be checked without the
 * treadmill.
 */
export function SimPanel({ onClose }: { onClose: () => void }) {
  const treadmill = useConsole((s) => s.treadmill)
  const heartRate = useConsole((s) => s.heartRate)
  const simTimeScale = useConsole((s) => s.simTimeScale)
  const setSimTimeScale = useConsole((s) => s.setSimTimeScale)
  const driver = getDriver()
  const hrSource = getHeartRateSource()
  if (!(driver instanceof SimulatedTreadmill)) return null

  return (
    <Sheet title="Simulator" onClose={onClose}>
      <p className={styles.note}>
        These fake hardware events so you can check how the app reacts. They don't exist on the
        real treadmill driver.
      </p>
      <div className={styles.buttonGrid}>
        {treadmill.safetyStop ? (
          <button type="button" className={styles.action} onClick={() => driver.resetSafetyStop()}>
            Reattach lanyard
          </button>
        ) : (
          <button
            type="button"
            className={styles.action}
            data-tone="danger"
            onClick={() => {
              driver.simulateSafetyStop()
              onClose()
            }}
          >
            Pull lanyard
          </button>
        )}
        {treadmill.connection === 'connected' ? (
          <button
            type="button"
            className={styles.action}
            data-tone="danger"
            onClick={() => {
              driver.simulateConnectionLoss()
              onClose()
            }}
          >
            Drop connection
          </button>
        ) : (
          <button type="button" className={styles.action} onClick={() => void driver.connect()}>
            Reconnect
          </button>
        )}
        {heartRate.connection === 'connected' ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => void hrSource.disconnect()}
          >
            Remove HR strap
          </button>
        ) : (
          <button type="button" className={styles.action} onClick={() => void hrSource.connect()}>
            Put on HR strap
          </button>
        )}
      </div>

      <div className={styles.row}>
        <div>
          <div className={styles.rowLabel}>Simulation speed</div>
          <div className={styles.rowHint}>
            Runs the belt, heart rate and workout clock faster than real time, so you can watch the
            chart zoom out without running for 15 minutes.
          </div>
        </div>
        <div className={styles.segmented} role="radiogroup" aria-label="Simulation speed">
          {TIME_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={simTimeScale === s}
              className={styles.segment}
              onClick={() => setSimTimeScale(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
