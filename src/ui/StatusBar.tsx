import { useEffect, useState } from 'react'
import { type ConsoleView, useSettings } from '../settings/store'
import { getDriver, useConsole } from '../workout/store'
import { Dialog } from './Dialog'
import { SettingsSheet } from './SettingsSheet'
import { SimPanel } from './SimPanel'
import styles from './StatusBar.module.css'

const VIEWS: [ConsoleView, string][] = [
  ['control', 'Control Center'],
  ['charts', 'Charts'],
  ['builder', 'Workout Builder'],
]

/** The dot carries "connected"; words only when something's wrong. */
const connectionText = (name: string, state: 'connected' | 'connecting' | 'disconnected') =>
  state === 'connected' ? name : state === 'connecting' ? `${name}: connecting…` : `${name}: not connected`

export function StatusBar() {
  const treadmill = useConsole((s) => s.treadmill)
  const workoutStatus = useConsole((s) => s.workout?.status ?? null)
  const stopNow = useConsole((s) => s.stopNow)
  const simTimeScale = useConsole((s) => s.simTimeScale)
  const view = useSettings((s) => s.view)
  const running = useConsole((s) => s.workout?.status === 'running')
  const pauseWorkout = useConsole((s) => s.pauseWorkout)
  const [askPause, setAskPause] = useState(false)
  const showView = (v: ConsoleView) => useSettings.getState().update({ view: v })
  const setView = (v: ConsoleView) => {
    // Opening the builder mid-run: offer to pause first.
    if (v === 'builder' && running && view !== 'builder') setAskPause(true)
    else showView(v)
  }
  const [panel, setPanel] = useState<'settings' | 'sim' | null>(null)
  const clock = useClock()
  const driver = getDriver()

  const stateText =
    workoutStatus === 'running' ? 'Running' : workoutStatus === 'paused' ? 'Paused' : 'Ready'

  return (
    <header className={styles.bar}>
      <span className={styles.connection} data-state={treadmill.connection}>
        <span className={styles.dot} aria-hidden="true" />
        {connectionText(driver.name, treadmill.connection)}
      </span>

      <span className={styles.state}>{stateText}</span>
      {simTimeScale !== 1 && (
        <span className={styles.warp} title="Simulated time is running faster than real time">
          {simTimeScale}× time
        </span>
      )}

      <div className={styles.views} role="tablist" aria-label="Workout view">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={styles.viewTab}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>

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

      {askPause && (
        <Dialog
          title="Pause the run first?"
          actions={[
            { label: 'Cancel', onClick: () => setAskPause(false) },
            {
              label: 'Keep running',
              onClick: () => {
                setAskPause(false)
                showView('builder')
              },
            },
            {
              label: 'Pause and open',
              tone: 'primary',
              onClick: () => {
                setAskPause(false)
                void pauseWorkout()
                showView('builder')
              },
            },
          ]}
        >
          <p>The Workout Builder replaces the run screen. Stop belt stays available up top either way.</p>
        </Dialog>
      )}
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
