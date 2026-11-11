// Client for the engine's /api/v1 surface: REST for runs, one WebSocket for events.
// Not wired into the shell yet - see docs/AI-Core/07-api-flow.md, "Wiring the shell".
//
//   const engine = createEngineClient({
//     onEvent: (e) => { if (e.type === 'agent.state') avatar.set(e.data.state) },
//     onUiCommand: (cmd) => ({ ok: true, wmState: desktop.snapshot() }),
//   })
//   engine.connect()
//   const { run_id } = await engine.startRun('open browser', 'voice')

import type {
  ApiError,
  CreateRunBody,
  RunSource,
  RunView,
  ServerEvent,
  UiCommandEvent,
  WmState,
  WsEnvelope,
} from '@/types/agentEvents'

export interface UiCommandResult {
  ok: boolean
  error?: string
  wmState?: WmState
}

export interface EngineClientOptions {
  /** Default http://127.0.0.1:8000 (engine main.py). */
  baseUrl?: string
  /** One per desktop session; generated when omitted. */
  sessionId?: string
  onEvent?: (event: ServerEvent) => void
  /** Apply a ui.command; the client sends the ui.command.ack from the result. */
  onUiCommand?: (command: UiCommandEvent['data']) => UiCommandResult | Promise<UiCommandResult>
  onConnectionChange?: (connected: boolean) => void
  /** For tests. */
  WebSocketImpl?: typeof WebSocket
  fetchImpl?: typeof fetch
}

export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(`${error.code}: ${error.message}`)
  }
}

const RECONNECT_MS = [500, 1000, 2000, 5000]

export function createEngineClient(options: EngineClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
  const sessionId = options.sessionId ?? crypto.randomUUID()
  const WS = options.WebSocketImpl ?? WebSocket
  const doFetch = options.fetchImpl ?? fetch.bind(globalThis)

  let socket: WebSocket | null = null
  let closedByUs = false
  let attempt = 0
  let lastWmState: WmState | null = null

  const send = (type: string, data: unknown, runId: string | null = null) => {
    if (socket?.readyState !== WS.OPEN) return false
    const message: WsEnvelope<string, unknown> = { type, session_id: sessionId, run_id: runId, ts: new Date().toISOString(), data }
    socket.send(JSON.stringify(message))
    return true
  }

  const handleUiCommand = async (event: UiCommandEvent) => {
    let result: UiCommandResult
    try {
      result = options.onUiCommand ? await options.onUiCommand(event.data) : { ok: false, error: 'shell has no ui.command handler' }
    } catch (error) {
      result = { ok: false, error: String(error) }
    }
    send('ui.command.ack', { command_id: event.data.command_id, ok: result.ok, error: result.error, wm_state: result.wmState }, event.run_id)
  }

  const connect = () => {
    closedByUs = false
    const url = `${baseUrl.replace(/^http/, 'ws')}/api/v1/ws?session_id=${sessionId}`
    const ws = new WS(url)
    socket = ws
    ws.onopen = () => {
      attempt = 0
      options.onConnectionChange?.(true)
      if (lastWmState) send('wm.state', lastWmState)
    }
    ws.onmessage = (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent
      if (event.type === 'ui.command') void handleUiCommand(event)
      options.onEvent?.(event)
    }
    ws.onclose = () => {
      if (socket === ws) socket = null
      options.onConnectionChange?.(false)
      if (closedByUs) return
      const delay = RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]
      setTimeout(() => !closedByUs && connect(), delay)
    }
  }

  const close = () => {
    closedByUs = true
    socket?.close()
    socket = null
  }

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await doFetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await response.json()
    if (!response.ok) throw new EngineError(response.status, json.error)
    return json as T
  }

  return {
    sessionId,
    connect,
    close,
    isConnected: () => socket?.readyState === WS.OPEN,

    /** Start a run. Progress arrives as events; the result is only the run id. */
    startRun: (text: string, source: RunSource = 'text', uiContext?: CreateRunBody['ui_context']) =>
      request<{ run_id: string; session_id: string; status: string }>('POST', '/agent/runs', {
        session_id: sessionId,
        text,
        source,
        ...(uiContext ? { ui_context: uiContext } : {}),
      }),

    /** Answer a run.interrupt: "yes"/"no" (or true/false) for confirm, text for clarify. */
    resume: (runId: string, answer: string | boolean) => request<RunView>('POST', `/agent/runs/${runId}/resume`, { resume: answer }),

    cancel: (runId: string) => request<RunView>('POST', `/agent/runs/${runId}/cancel`),

    getRun: (runId: string) => request<RunView>('GET', `/agent/runs/${runId}`),

    /** Call on every layout change; re-sent automatically after a reconnect. */
    pushWmState: (state: WmState) => {
      lastWmState = state
      return send('wm.state', state)
    },
  }
}

export type EngineClient = ReturnType<typeof createEngineClient>
