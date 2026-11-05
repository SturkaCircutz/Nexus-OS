// Wire contract for the engine's /api/v1 surface (docs/AI-Core/07-api-flow.md).
// Mirrors apps/engine/backend/api/events.py - change both together.

/** What the avatar should show. `acting` and `waiting` can render as `thinking` until they get art. */
export type AgentStateName = 'idle' | 'listening' | 'thinking' | 'acting' | 'waiting' | 'speaking' | 'error'

export type RunSource = 'voice' | 'text' | 'ui'

/** API-level run status. */
export type RunStatus = 'received' | 'running' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled'

export type InterruptKind = 'confirm' | 'clarify'

/** Same names as modules/ipc IPCCommand where they overlap. */
export type UiAction =
  | 'open_app'
  | 'close_app'
  | 'move_window'
  | 'resize_window'
  | 'set_window_mode'
  | 'set_avatar_anchor'

export interface ApiError {
  code: string
  message: string
  details: Record<string, unknown>
}

/** Every WebSocket message, both directions. */
export interface WsEnvelope<T extends string = string, D = Record<string, unknown>> {
  type: T
  session_id: string
  run_id: string | null
  ts: string
  data: D
}

// --- server -> client -------------------------------------------------------

export type AgentStateEvent = WsEnvelope<'agent.state', { state: AgentStateName; node?: string; kind?: InterruptKind; decision?: string }>
export type TaskProgressEvent = WsEnvelope<'task.progress', {
  task_id: string
  agent: string
  status: 'completed' | 'needs_input' | 'blocked' | 'failed'
  summary: string
  error: ApiError | null
}>
export type UiCommandEvent = WsEnvelope<'ui.command', { command_id: string; action: UiAction; app_id?: string; [key: string]: unknown }>
export interface Interrupt {
  kind: InterruptKind
  message: string
  options: string[]
  approval_id?: string
  expires_at?: string
}
export type RunInterruptEvent = WsEnvelope<'run.interrupt', Interrupt>
export type RunResponseEvent = WsEnvelope<'run.response', { text: string; evidence_refs: string[]; route: string | null }>
export type RunCompletedEvent = WsEnvelope<'run.completed', { status: 'completed' | 'failed' | 'cancelled'; errors: unknown[] }>
export type RunErrorEvent = WsEnvelope<'run.error', { error: ApiError }>

export type ServerEvent =
  | AgentStateEvent
  | TaskProgressEvent
  | UiCommandEvent
  | RunInterruptEvent
  | RunResponseEvent
  | RunCompletedEvent
  | RunErrorEvent

// --- client -> server -------------------------------------------------------

export interface WmState {
  apps: Array<{ app_id: string; mode?: string; [key: string]: unknown }>
  focused_app_id: string | null
}

export type UiCommandAck = WsEnvelope<'ui.command.ack', { command_id: string; ok: boolean; error?: string; wm_state?: WmState }>
export type WmStateMessage = WsEnvelope<'wm.state', WmState>

// --- REST -------------------------------------------------------------------

export interface CreateRunBody {
  session_id: string
  text: string
  source?: RunSource
  ui_context?: { active_surface?: string; selected_refs?: string[] }
}

export interface RunView {
  run_id: string
  session_id: string
  source: RunSource
  status: RunStatus
  agent_state: AgentStateName
  route: string | null
  request_ids: string[]
  response: { text: string; evidence_refs: string[] } | null
  interrupt: Interrupt | null
  errors: unknown[]
  created_at: string
  updated_at: string
}
