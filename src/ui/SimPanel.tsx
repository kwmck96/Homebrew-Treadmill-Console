import { SimulatedTreadmill } from '../treadmill/simulator'
import { getDriver, useConsole } from '../workout/store'
import styles from './Panels.module.css'
import { Sheet } from './Sheet'

/**
 * Test controls that only exist with the simulator: fake the events the real
 * hardware will produce, so the app's reactions can be checked without the
 * treadmill.
 */
export function SimPanel({ onClose }: { onClose: () => void }) {
  const treadmill = useConsole((s) => s.treadmill)
  const driver = getDriver()
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
      </div>
    </Sheet>
  )
}
