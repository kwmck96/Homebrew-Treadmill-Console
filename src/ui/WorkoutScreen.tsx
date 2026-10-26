import { useSettings } from '../settings/store'
import { useConsole } from '../workout/store'
import { ChartsView } from './charts/ChartsView'
import { ControlCenterView } from './ControlCenterView'
import { StatusBar } from './StatusBar'
import { useWakeLock } from './useWakeLock'
import styles from './WorkoutScreen.module.css'

/** Status bar plus whichever workout view is selected. */
export function WorkoutScreen() {
  const view = useSettings((s) => s.view)
  const workoutActive = useConsole((s) => s.workout !== null)

  // Keep the screen on for the whole workout, paused included (M1).
  useWakeLock(workoutActive)

  return (
    <div className={styles.screen}>
      <StatusBar />
      {view === 'charts' ? <ChartsView /> : <ControlCenterView />}
    </div>
  )
}
