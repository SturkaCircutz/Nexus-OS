import { StreamingText } from '@/ui'

interface AgentBubbleProps {
  reply: string
  replyId: number
  error: boolean
  reduced: boolean
}

/**
 * The avatar's speech, on the surface the chrome styles (`.nx-bubble`). The
 * typewriter timing and the polite live region are the library's StreamingText;
 * this wrapper only carries the glass placement.
 */
export function AgentBubble({ reply, replyId, error, reduced }: AgentBubbleProps) {
  return (
    <StreamingText
      text={reply}
      liveKey={replyId}
      error={error}
      reduced={reduced}
      className="nx-bubble nx-glass"
      typeMs={18}
      stayMs={6000}
    />
  )
}
