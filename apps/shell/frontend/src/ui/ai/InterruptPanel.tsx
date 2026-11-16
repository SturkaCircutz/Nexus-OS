import type { Interrupt } from '@/types/agentEvents'
import { ConfirmPanel } from '../overlays/ConfirmPanel'

export interface InterruptPanelProps {
  interrupt: Interrupt
  /** Resolves the interrupt; the caller performs the engine POST /resume. */
  onResolve: (option: string) => void
  className?: string
}

/**
 * The engine asking the user something mid-run (`run.interrupt`): a confirm or a
 * clarify. Options are positions in the interrupt's list; the caller turns the
 * chosen option into the resume payload.
 */
export function InterruptPanel({ interrupt, onResolve, className }: InterruptPanelProps) {
  return (
    <ConfirmPanel
      className={className ?? 'nx-interrupt'}
      message={interrupt.message}
      options={interrupt.options.map((option, i) => ({ id: String(i), label: option.toLowerCase() }))}
      onChoose={(optionId) => onResolve(interrupt.options[Number(optionId)] ?? interrupt.options[0])}
    />
  )
}
