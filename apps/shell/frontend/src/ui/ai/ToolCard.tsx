import { Badge } from '../components/Markers'
import { Mono } from '../components/Text'
import type { TaskStatus } from '@/types/agentEvents'

// One tool call, one card: name, arguments summary, status glyph, ack state.
// The glyph carries the state; color never has to.

export interface ToolCardProps {
  name: string
  /** Short args summary, e.g. `("notes", "2x1")`. */
  args?: string
  status: TaskStatus
  /** The engine acknowledged the ui.command this tool produced. */
  ack?: 'pending' | 'ok' | 'failed'
  className?: string
}

export function ToolCard({ name, args, status, ack, className }: ToolCardProps) {
  return (
    <div className={className ?? 'nx-toolcard'} data-status={status}>
      <span className="nx-toolcard-glyph" aria-hidden="true">
        {GLYPH[status]}
      </span>
      <Mono className="nx-toolcard-name">
        {name}
        {args ? <span className="nx-toolcard-args">{args}</span> : null}
      </Mono>
      {ack && (
        <Badge tone={ack === 'ok' ? 'default' : 'default'} className="nx-toolcard-ack">
          {ack === 'pending' ? '…sent' : ack === 'ok' ? 'ack' : 'no ack'}
        </Badge>
      )}
    </div>
  )
}

const GLYPH: Record<TaskStatus, string> = {
  queued: '·',
  running: '>',
  done: '=',
  failed: 'x',
  skipped: '-',
}
