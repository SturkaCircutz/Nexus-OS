import { useEffect, useState, type HTMLAttributes } from 'react'
import { STAY_MS, TYPE_MS } from '../tokens/motion'

export interface StreamingTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'> {
  /** The full text; it types in a character at a time at final size. */
  text: string
  /** Bump to restart the typewriter for the same words. */
  liveKey?: number
  /** Renders the ink-edge error variant with the `x` mark. */
  error?: boolean
  /** Force the reduced-motion path (showing everything at once). */
  reduced?: boolean
  /** Speed and stay duration; defaults match the agent bubble's timing. */
  typeMs?: number
  stayMs?: number
  className?: string
  /** Class for the visually hidden live region (defaults to sr-only). */
  liveClassName?: string
}

/**
 * A reply that types in a character at a time at its final size, stays a while, and
 * stays longer while hovered. Screen readers hear it once, politely, via a live
 * region outside the animated element. Reduced motion shows everything at once.
 *
 * The element carries the caller's class; the surface it sits on is theirs
 * (glass bubble, panel row, …).
 */
export function StreamingText({
  text,
  liveKey = 1,
  error = false,
  reduced = false,
  typeMs = TYPE_MS,
  stayMs = STAY_MS,
  className,
  liveClassName = 'sr-only',
  ...rest
}: StreamingTextProps) {
  const [shown, setShown] = useState(0)
  const [visible, setVisible] = useState(false)
  const [held, setHeld] = useState(false)
  const done = shown >= text.length

  // A new reply starts typing from the beginning.
  useEffect(() => {
    if (!liveKey) return
    setVisible(true)
    setShown(reduced ? text.length : 0)
  }, [liveKey, text, reduced])

  useEffect(() => {
    if (!visible || done) return
    const id = window.setTimeout(() => setShown((n) => n + 1), typeMs)
    return () => window.clearTimeout(id)
  }, [visible, done, shown, typeMs])

  // Once fully typed, it leaves after a while unless someone is reading it.
  useEffect(() => {
    if (!visible || !done || held) return
    const id = window.setTimeout(() => setVisible(false), stayMs)
    return () => window.clearTimeout(id)
  }, [visible, done, held, liveKey, stayMs])

  return (
    <>
      <p
        {...rest}
        className={className}
        data-visible={visible || undefined}
        data-error={error || undefined}
        aria-hidden="true"
        onPointerEnter={(e) => {
          setHeld(true)
          rest.onPointerEnter?.(e)
        }}
        onPointerLeave={(e) => {
          setHeld(false)
          rest.onPointerLeave?.(e)
        }}
      >
        {/* Failures read differently without a second colour: an ink edge and an x. */}
        {error && <span className="nx-stream-mark">x </span>}
        {text.slice(0, shown)}
        {/* Hold the final size while typing so the surface doesn't grow letter by letter. */}
        <span className="nx-stream-rest">{text.slice(shown)}</span>
      </p>
      {/* A zero-width mark makes the same reply count as new for screen readers. */}
      <p className={liveClassName} aria-live="polite">
        {liveKey ? text + (liveKey % 2 ? '​' : '') : ''}
      </p>
    </>
  )
}
