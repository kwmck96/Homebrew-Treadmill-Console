import { useEffect } from 'react'
import { SummaryScreen } from './ui/SummaryScreen'
import { WorkoutScreen } from './ui/WorkoutScreen'
import { useConsole } from './workout/store'

export default function App() {
  const ready = useConsole((s) => s.ready)
  const summary = useConsole((s) => s.summary)
  const dismissSummary = useConsole((s) => s.dismissSummary)

  useEffect(() => {
    void useConsole.getState().init()
  }, [])

  if (!ready) return null
  if (summary) return <SummaryScreen record={summary} onDone={dismissSummary} />
  return <WorkoutScreen />
}
