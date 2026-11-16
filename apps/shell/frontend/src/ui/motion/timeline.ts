// RAF timelines: the second motion technique, for frame-sequenced ASCII
// (draw → type → settle, blink, spin). Interruptible by design: every run returns a
// cancel function, and callers must not outlive it (AsciiFrame rewinds exits from
// wherever the timeline is). No new global loops anywhere else.

/**
 * Runs `onFrame(progress)` from 0 → 1 over `duration` ms on requestAnimationFrame,
 * optionally after `delay`. Returns a cancel function. When reduced motion is on,
 * callers skip the animation and jump straight to the settled state.
 */
export function animate(
  duration: number,
  delay: number,
  onFrame: (p: number) => void,
  onDone?: () => void,
): () => void {
  let raf = 0
  let start: number | null = null
  const step = (now: number) => {
    if (start === null) start = now + delay
    const p = duration <= 0 ? 1 : clamp01((now - start) / duration)
    if (now >= start) onFrame(p)
    if (p < 1) raf = requestAnimationFrame(step)
    else onDone?.()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
