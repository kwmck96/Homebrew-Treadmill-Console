/**
 * Workout beeps via the Web Audio API: short sine tones, no audio files.
 *
 * Browsers (and the Android WebView) only allow sound after a user gesture,
 * so `primeAudio()` is called from button handlers (Start workout, Resume)
 * to create and unlock the audio context. Everything fails silently: a
 * missing beep must never break the workout.
 */
let ctx: AudioContext | null = null

export function primeAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // No audio available (tests, locked-down WebView): stay silent.
  }
}

/** Final-seconds countdown tick. */
export const COUNTDOWN_TONE = { freq: 880, ms: 150 }
/** Next step started: higher and a little longer. */
export const STEP_TONE = { freq: 1320, ms: 380 }

export function beep({ freq, ms }: { freq: number; ms: number }, volume = 0.3): void {
  try {
    if (!ctx || ctx.state !== 'running') return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // Short attack and release so the tone doesn't click.
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01)
    gain.gain.setValueAtTime(volume, t0 + ms / 1000 - 0.03)
    gain.gain.linearRampToValueAtTime(0, t0 + ms / 1000)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + ms / 1000 + 0.02)
  } catch {
    // Ignore: sound is a nicety.
  }
}

/** Which of the 3-2-1 marks were crossed between two remaining-time readings. */
export function countdownMarksCrossed(beforeMs: number, afterMs: number): number {
  let n = 0
  for (const mark of [3000, 2000, 1000]) if (beforeMs > mark && afterMs <= mark) n++
  return n
}
