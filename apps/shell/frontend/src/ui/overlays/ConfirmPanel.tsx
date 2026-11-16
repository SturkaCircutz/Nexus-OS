import { Button } from '../components/Button'
import { Bubble } from '../components/Text'

export interface ConfirmPanelProps {
  /** What the agent is asking for. */
  message: string
  /** The choices, in order. The first is treated as the primary action. */
  options: Array<{ id: string; label: string }>
  onChoose: (optionId: string) => void
  className?: string
}

/**
 * A choice the agent needs from the user: the message, then the options as chips.
 * The engine's confirm/clarify interrupts render through this (InterruptPanel adds
 * the wire plumbing); so can any app that needs a decision.
 */
export function ConfirmPanel({ message, options, onChoose, className }: ConfirmPanelProps) {
  return (
    <div className={className ?? 'nx-confirm'}>
      <Bubble className="nx-confirm-message">{message}</Bubble>
      <div className="nx-confirm-options" role="group" aria-label="Options">
        {options.map((option, i) => (
          <Button
            key={option.id}
            variant={i === 0 ? 'action' : 'default'}
            onClick={() => onChoose(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
