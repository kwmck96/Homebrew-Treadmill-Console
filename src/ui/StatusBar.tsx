import { useEffect, useState } from 'react'
import { getDriver, useConsole } from '../workout/store'
import { SettingsSheet } from './SettingsSheet'
import { SimPanel } from './SimPanel'
import styles from './StatusBar.module.css'

const CONNECTION_TEXT = {
  connected: 'connected',
  connecting: 'connecting…',
  disconnected: 'not connected',
} as const

export function StatusBar() {
  const treadmill = useConsole((s) => s.treadmill)
  const workoutStatus = useConsole((s) => s.workout?.status ?? null)
  const stopNow = useConsole((s) => s.stopNow)
  const [panel, setPanel] = useState<'settings' | 'sim' | null>(null)
  const clock = useClock()
  const driver = getDriver()

  const stateText =
    workoutStatus === 'running' ? 'Running' : workoutStatus === 'paused' ? 'Paused' : 'Ready'

  return (
    <header className={styles.bar}>
      <span className={styles.connection} data-state={treadmill.connection}>
        <span className={styles.dot} aria-hidden="true" />
        {driver.name} {CONNECTION_TEXT[treadmill.connection]}
      </span>

      <span className={styles.state}>{stateText}</span>
      <span className={`${styles.clock} num`}>{clock}</span>

      <div className={styles.actions}>
        {driver.isSimulated && (
          <button type="button" className={styles.tool} onClick={() => setPanel('sim')}>
            Simulator
          </button>
        )}
        <button type="button" className={styles.tool} onClick={() => setPanel('settings')}>
          Settings
        </button>
        {/* S6: convenience only. The lanyard and physical buttons are the real stops. */}
        <button
          type="button"
          className={styles.stop}
          disabled={treadmill.belt === 'stopped'}
          onPointerDown={(e) => {
            if (e.button === 0) void stopNow()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') void stopNow()
          }}
        >
          Stop belt
        </button>
      </div>

      {panel === 'settings' && <SettingsSheet onClose={() => setPanel(null)} />}
      {panel === 'sim' && <SimPanel onClose={() => setPanel(null)} />}
    </header>
  )
}

function useClock(): string {
  const format = () =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const [time, setTime] = useState(format)
  useEffect(() => {
    const id = setInterval(() => setTime(format()), 10_000)
    return () => clearInterval(id)
  }, [])
  return time
}
