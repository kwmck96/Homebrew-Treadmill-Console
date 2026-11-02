/**
 * Native (APK) set-up. In a browser these are no-ops.
 * - Hide Android's status bar so the console uses the whole screen. The
 *   app is locked to landscape in AndroidManifest.xml.
 */
import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'

export async function setUpNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await StatusBar.hide().catch(() => {})
}
