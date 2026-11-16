/**
 * @vitest-environment jsdom
 *
 * Task A3: Tauri bridge behaviour with mocked invoke/listen injected via
 * DesktopProvider's `ipc` prop.
 */

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DesktopProvider } from '@/wm/DesktopProvider'
import { createSeedSession } from '@/wm/windowStore'
import {
  IPC_REQUEST_EVENT,
  SYNC_DEBOUNCE_MS,
  type IPCRequestEventPayload,
} from '@/wm/useDesktopIPCBridge'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.nexusIPC
})

describe('useDesktopIPCBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('does not invoke Tauri when not in a Tauri runtime', async () => {
    const invoke = vi.fn(async () => undefined)
    const listen = vi.fn(async () => () => undefined)

    render(
      <DesktopProvider
        initialSession={createSeedSession()}
        persist={false}
        ipc={{ isTauri: () => false, invoke, listen, enableDevConsole: true }}
      >
        <div />
      </DesktopProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(invoke).not.toHaveBeenCalled()
    expect(listen).not.toHaveBeenCalled()
  })

  it('pushes a snapshot on mount and after a debounced change; answers ipc-request', async () => {
    const invoke = vi.fn(
      async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => undefined,
    )
    let requestHandler: ((event: { payload: IPCRequestEventPayload }) => void) | null = null
    const unlisten = vi.fn()
    const listen = vi.fn(
      async (
        _event: string,
        handler: (event: { payload: IPCRequestEventPayload }) => void,
      ): Promise<() => void> => {
        requestHandler = handler
        return unlisten
      },
    )

    const { unmount } = render(
      <DesktopProvider
        initialSession={createSeedSession()}
        persist={false}
        ipc={{ isTauri: () => true, invoke, listen, enableDevConsole: true }}
      >
        <div />
      </DesktopProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(listen).toHaveBeenCalledWith(IPC_REQUEST_EVENT, expect.any(Function))
    expect(invoke).toHaveBeenCalledWith(
      'sync_desktop_state',
      expect.objectContaining({
        session: expect.objectContaining({ windows: expect.any(Array) }),
      }),
    )
    const syncCallsAfterMount = invoke.mock.calls.filter((c) => c[0] === 'sync_desktop_state').length

    await act(async () => {
      window.nexusIPC?.dispatch({ command: 'open_app', args: { app_name: 'nexus.terminal' } })
      vi.advanceTimersByTime(SYNC_DEBOUNCE_MS)
    })

    const syncCallsAfterChange = invoke.mock.calls.filter((c) => c[0] === 'sync_desktop_state').length
    expect(syncCallsAfterChange).toBeGreaterThan(syncCallsAfterMount)

    await act(async () => {
      requestHandler?.({
        payload: {
          request_id: 'req-1',
          request: { command: 'get_desktop_state', args: {} },
        },
      })
      await Promise.resolve()
    })

    const respond = invoke.mock.calls.find((c) => c[0] === 'ipc_respond')
    expect(respond).toBeTruthy()
    expect(respond?.[1]).toMatchObject({
      requestId: 'req-1',
      response: { success: true },
    })

    unmount()
    expect(unlisten).toHaveBeenCalled()
  })

  it('exposes window.nexusIPC.dispatch when enableDevConsole is on', async () => {
    render(
      <DesktopProvider
        initialSession={createSeedSession()}
        persist={false}
        ipc={{ isTauri: () => false, enableDevConsole: true }}
      >
        <div />
      </DesktopProvider>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(window.nexusIPC?.dispatch).toBeTypeOf('function')
    const res = window.nexusIPC!.dispatch({ command: 'get_desktop_state', args: {} })
    expect(res.success).toBe(true)
  })
})
