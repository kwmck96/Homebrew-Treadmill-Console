/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the same build works on Vercel and inside the
  // Capacitor APK (which serves files from a local origin, not a domain root).
  base: './',
  build: {
    // The Fire HD 10's system WebView version is still unknown (Fire OS 7 ships
    // Amazon's own Chromium WebView). ES2020 is a conservative syntax target;
    // revisit once the diagnostics screen reports the real WebView version.
    target: 'es2020',
  },
  server: {
    // Listen on the LAN so the Fire tablet can open the dev server directly.
    host: true,
  },
  test: {
    environment: 'node',
  },
})
