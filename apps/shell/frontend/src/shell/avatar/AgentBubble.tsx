import { useEffect, useState } from 'react'

// Characters per tick while a reply types in, and how long it stays after.
const TYPE_MS = 18
const STAY_MS = 6000

interface AgentBubbleProps {
  reply: string
  replyId: number
  error: boolean
  reduced: boolean
}

/**
 * The avatar's speech. Types in beside the avatar, on the side facing the screen centre,
 * then leaves. Hover or focus keeps it. Screen readers hear it once, politely.
 */
export function AgentBubble({ reply, replyId, error, reduced }: AgentBubbleProps) {
  const [shown, setShown] = useState(0)
  const [visible, setVisible] = useState(false)
  const [held, setHeld] = useState(false)
  const done = shown >= reply.length

  // A new reply starts typing from the beginning.
  useEffect(() => {
    if (!replyId) return
    setVisible(true)
    setShown(reduced ? reply.length : 0)
  }, [replyId, reply, reduced])

  useEffect(() => {
    if (!visible || done) return
    const id = window.setTimeout(() => setShown((n) => n + 1), TYPE_MS)
    return () => window.clearTimeout(id)
  }, [visible, done, shown])

  // Once fully typed, it leaves after a while unless someone is reading it.
  useEffect(() => {
    if (!visible || !done || held) return
    const id = window.setTimeout(() => setVisible(false), STAY_MS)
    return () => window.clearTimeout(id)
  }, [visible, done, held, replyId])

  return (
    <>
      <p
        className="nx-bubble nx-glass"
        data-visible={visible || undefined}
        data-error={error || undefined}
        aria-hidden="true"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
      >
        {/* Failures read differently without a second colour: an ink edge and an x. */}
        {error && <span className="nx-bubble-mark">x </span>}
        {reply.slice(0, shown)}
        {/* Hold the final size while typing so the bubble doesn't grow letter by letter. */}
        <span className="nx-bubble-rest">{reply.slice(shown)}</span>
      </p>
      {/* A zero-width mark makes the same reply count as new for screen readers. */}
      <p className="sr-only" aria-live="polite">
        {replyId ? reply + (replyId % 2 ? '​' : '') : ''}
      </p>
    </>
  )
}
