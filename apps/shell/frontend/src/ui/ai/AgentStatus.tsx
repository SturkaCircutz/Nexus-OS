import type { AgentStateName } from '@/types/agentEvents'
import { AsciiSpinner } from '../ascii/AsciiSpinner'

// The agent's status word. Grounded in the wire contract's 7 states (types/agentEvents.ts);
// `acting` and `waiting` render as their thinking words until real art lands (doc 07).

export const AGENT_STATUS_TEXT: Record<AgentStateName, string> = {
  idle: 'ready',
  listening: 'listening',
  thinking: 'thinking',
  acting: 'working',
  waiting: 'waiting',
  speaking: 'replying',
  error: "didn't get that",
}

/** States where the agent is visibly at work: teal, per the One-Accent rule. */
export const WORKING: AgentStateName[] = ['thinking', 'acting', 'speaking', 'listening']

export interface AgentStatusProps {
  status: AgentStateName
  className?: string
}

/**
 * Spinner + honest status word. The caller supplies the styling hook: pass a
 * class that turns teal on `[data-status]` (the menu bar does exactly this).
 */
export function AgentStatus({ status, className }: AgentStatusProps) {
  return (
    <span className={className} data-status={status}>
      {status !== 'idle' && status !== 'error' ? (
        <AsciiSpinner label={AGENT_STATUS_TEXT[status]} />
      ) : (
        <span aria-hidden="true">·</span>
      )}{' '}
      {AGENT_STATUS_TEXT[status]}
    </span>
  )
}
