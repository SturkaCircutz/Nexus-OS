// Wire contract for the engine's /api/v1 surface (docs/AI-Core/07-api-flow.md).
// Mirrors apps/engine/backend/api/events.py - change both together.

/** What the avatar should show. `acting` and `waiting` can render as `thinking` until they get art. */
export type AgentStateName = 'idle' | 'listening' | 'thinking' | 'acting' | 'waiting' | 'speaking' | 'error'

export type RunSource = 'voice' | 'text' | 'ui'

/** API-level run status. */
export type RunStatus = 'received' | 'running' | 'awaiting_input' | 'completed' | 'failed' | 'cancelled'

export type InterruptKind = 'confirm' | 'clarify'

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

export type RunOutcome = 'ok' | 'failed' | 'cancelled'

export type UiAction =
  | 'open_app'
  | 'close_app'
  | 'focus'
  | 'move'
  | 'resize'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'snap'
  | 'set_avatar_position'

/** Wire spelling. The shell's anchors.ts uses hyphens (top-left); convert at the edge. */
export type AvatarPosition =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right'

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

export type AgentStateEvent = WsEnvelope<'agent.state', { state: AgentStateName }>
export type TaskProgressEvent = WsEnvelope<'task.progress', { task_id: string; tool_id: string | null; status: TaskStatus }>
export type UiCommandEvent = WsEnvelope<'ui.command', {
  command_id: string
  action: UiAction
  app_id: string | null
  data: Record<string, unknown>
}>
export interface Interrupt {
  kind: InterruptKind
  message: string
  options: string[]
}
/** Widget payloads are not produced by the engine yet (always []). */
export type Widget = Record<string, unknown>
export interface RunResponse {
  speech: string
  widgets: Widget[]
}
export type RunInterruptEvent = WsEnvelope<'run.interrupt', Interrupt>
export type RunResponseEvent = WsEnvelope<'run.response', RunResponse>
export type RunCompletedEvent = WsEnvelope<'run.completed', { status: RunOutcome }>
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
  response: RunResponse | null
  interrupt: Interrupt | null
  errors: unknown[]
  created_at: string
  updated_at: string
}
