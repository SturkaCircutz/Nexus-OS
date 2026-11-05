import { describe, expect, it, vi } from 'vitest'
import { createEngineClient } from './engineClient'

const SESSION = '22222222-2222-2222-2222-222222222222'

class FakeSocket {
  static OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 0
  sent: any[] = []
  onopen: (() => void) | null = null
  onmessage: ((m: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }
  send(text: string) {
    this.sent.push(JSON.parse(text))
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  receive(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
}

const setup = (overrides = {}) => {
  FakeSocket.instances = []
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ run_id: 'r1', session_id: SESSION, status: 'received' }), { status: 202 }))
  const client = createEngineClient({
    sessionId: SESSION,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    ...overrides,
  })
  client.connect()
  const socket = FakeSocket.instances[0]
  socket.open()
  return { client, socket, fetchImpl }
}

describe('engineClient', () => {
  it('opens the session socket on /api/v1/ws', () => {
    const { socket } = setup()
    expect(socket.url).toBe(`ws://127.0.0.1:8000/api/v1/ws?session_id=${SESSION}`)
  })

  it('starts a run with the session id and source', async () => {
    const { client, fetchImpl } = setup()
    const run = await client.startRun('open browser', 'voice')
    expect(run.run_id).toBe('r1')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8000/api/v1/agent/runs')
    expect(JSON.parse(String(init.body))).toEqual({ session_id: SESSION, text: 'open browser', source: 'voice' })
  })

  it('applies a ui.command and acks it with the handler result', async () => {
    const onUiCommand = vi.fn(() => ({ ok: true, wmState: { apps: [], focused_app_id: 'browser' } }))
    const { socket } = setup({ onUiCommand })
    socket.receive({ type: 'ui.command', session_id: SESSION, run_id: 'r1', ts: 'now', data: { command_id: 'cmd_1', action: 'open_app', app_id: 'browser' } })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))
    expect(onUiCommand).toHaveBeenCalledWith({ command_id: 'cmd_1', action: 'open_app', app_id: 'browser' })
    expect(socket.sent[0]).toMatchObject({
      type: 'ui.command.ack',
      session_id: SESSION,
      run_id: 'r1',
      data: { command_id: 'cmd_1', ok: true, wm_state: { focused_app_id: 'browser' } },
    })
  })

  it('acks ok:false when no handler is set', async () => {
    const { socket } = setup()
    socket.receive({ type: 'ui.command', session_id: SESSION, run_id: 'r1', ts: 'now', data: { command_id: 'cmd_2', action: 'open_app' } })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))
    expect(socket.sent[0].data).toMatchObject({ command_id: 'cmd_2', ok: false })
  })

  it('surfaces REST errors with the shared error shape', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'nope', details: {} } }), { status: 409 }))
    const { client } = setup({ fetchImpl })
    await expect(client.resume('r1', 'yes')).rejects.toMatchObject({ status: 409, error: { code: 'CONFLICT' } })
  })

  it('re-sends the last wm.state after reconnecting', () => {
    vi.useFakeTimers()
    const { client, socket } = setup()
    client.pushWmState({ apps: [{ app_id: 'notes' }], focused_app_id: 'notes' })
    socket.close()
    vi.advanceTimersByTime(600)
    const next = FakeSocket.instances[1]
    next.open()
    expect(next.sent[0]).toMatchObject({ type: 'wm.state', data: { focused_app_id: 'notes' } })
    client.close()
    vi.useRealTimers()
  })
})
