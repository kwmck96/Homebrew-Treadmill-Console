import { useEffect } from 'react'

/**
 * Keep the screen on while `active` (M1). Uses the browser Screen Wake Lock
 * API, which browsers release when the page is hidden, so it's re-requested
 * when the page becomes visible again.
 *
 * Inside the Capacitor APK this should be swapped for (or backed by) a native
 * keep-awake plugin, since WebView support for this API varies.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) void sentinel.release()
      } catch {
        // Denied (e.g. low battery mode or no user gesture yet). Not fatal.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release()
    }
  }, [active])
}
