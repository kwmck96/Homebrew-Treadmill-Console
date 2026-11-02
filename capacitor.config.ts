import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The Android app (APK) wraps the same Vite build that Vercel serves.
 * `npm run android:sync` rebuilds the web app and copies it into android/.
 */
const config: CapacitorConfig = {
  appId: 'dev.kwmck96.treadmillconsole',
  appName: 'Treadmill Console',
  webDir: 'dist',
  android: {
    // Fire tablets: keep the WebView's own scroll/zoom behaviour out of the way.
    allowMixedContent: false,
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: 'Looking for heart-rate sensors…',
        cancel: 'Cancel',
        availableDevices: 'Heart-rate sensors nearby',
        noDeviceFound: 'No sensor found. Is it on and broadcasting?',
      },
    },
  },
}

export default config
