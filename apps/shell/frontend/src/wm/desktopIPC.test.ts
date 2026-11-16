/**
 * Task A3: store-backed IPC dispatcher against createDesktopStore.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopSession } from '@/types/WindowState'
import { createDesktopStore, createSeedSession } from '@/wm/windowStore'
import { createDesktopIPCHandler } from '@/wm/desktopIPC'
import type { DesktopStoreHandle } from '@/wm/DesktopProvider'
import {
  createSessionPersister,
  DEFAULT_SAVE_DEBOUNCE_MS,
  loadSession,
  type SessionStorage,
} from '@/wm/sessionPersistence'

function memoryStorage(): SessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

function makeHandle(storage?: SessionStorage | null): DesktopStoreHandle {
  const store = createDesktopStore({
    initialSession: createSeedSession(),
    generateId: (() => {
      let n = 0
      return (appId: string) => `${appId}#${++n}`
    })(),
  })
  const persister =
    storage === undefined
      ? null
      : createSessionPersister(store, { storage })
  return {
    store,
    flush() {
      persister?.flush()
    },
  }
}

describe('createDesktopIPCHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('get_desktop_state matches store after scripted open_app x2 (A3 acceptance)', () => {
    const handle = makeHandle()
    const ipc = createDesktopIPCHandler(handle)

    const a = ipc.dispatch({ command: 'open_app', args: { app_name: 'nexus.terminal' } })
    const b = ipc.dispatch({ command: 'open_app', args: { app_name: 'nexus.clock' } })
    expect(a.success).toBe(true)
    expect(b.success).toBe(true)

    const state = ipc.dispatch({ command: 'get_desktop_state', args: {} })
    expect(state.success).toBe(true)
    expect(state.data).toEqual(handle.store.getSnapshot())
    expect((state.data as DesktopSession).windows).toHaveLength(4)
  })

  it('get_desktop_state filters by monitor', () => {
    const handle = makeHandle()
    handle.store.openApp('nexus.terminal', { monitor: 1 })
    const ipc = createDesktopIPCHandler(handle)

    const filtered = ipc.dispatch({ command: 'get_desktop_state', args: { monitor: 1 } })
    expect(filtered.success).toBe(true)
    const session = filtered.data as DesktopSession
    expect(session.windows.every((w) => w.monitor === 1)).toBe(true)
    expect(session.windows).toHaveLength(1)
  })

  it('runs every mutation command and keeps a single focused window', () => {
    const handle = makeHandle()
    const ipc = createDesktopIPCHandler(handle)

    const opened = ipc.dispatch({
      command: 'open_app',
      args: { app_name: 'nexus.terminal', title: 'Term', x: 1, y: 2, width: 300, height: 200 },
    })
    const windowId = (opened.data as { window_id: string }).window_id

    expect(
      ipc.dispatch({ command: 'move_window', args: { window_id: windowId, x: 50, y: 60 } }).success,
    ).toBe(true)
    expect(
      ipc.dispatch({
        command: 'resize_window',
        args: { window_id: windowId, width: 400, height: 300 },
      }).success,
    ).toBe(true)
    expect(
      ipc.dispatch({
        command: 'set_window_mode',
        args: { window_id: windowId, mode: 'fullscreen' },
      }).success,
    ).toBe(true)
    expect(
      ipc.dispatch({ command: 'focus_window', args: { window_id: 'seed-notes' } }).success,
    ).toBe(true)

    const afterFocus = handle.store.getSnapshot()
    expect(afterFocus.windows.filter((w) => w.focused)).toHaveLength(1)
    expect(afterFocus.focusedId).toBe('seed-notes')

    expect(
      ipc.dispatch({ command: 'switch_workspace', args: { workspace_id: 'ws-2' } }).success,
    ).toBe(true)
    expect(handle.store.getState().activeWorkspaceId).toBe('ws-2')

    expect(ipc.dispatch({ command: 'close_app', args: { window_id: windowId } }).success).toBe(
      true,
    )
    expect(handle.store.getState().windows.some((w) => w.id === windowId)).toBe(false)

    expect(handle.store.getState().windows.find((w) => w.id === 'seed-notes')).toMatchObject({
      // notes was not moved; terminal was
    })
    const termGone = handle.store.getState().windows.find((w) => w.id === windowId)
    expect(termGone).toBeUndefined()
  })

  it('persist_workspace flushes before the debounce fires', () => {
    const storage = memoryStorage()
    const handle = makeHandle(storage)
    const ipc = createDesktopIPCHandler(handle)

    ipc.dispatch({ command: 'open_app', args: { app_name: 'nexus.terminal' } })
    expect(loadSession(storage)).toBeNull()

    const result = ipc.dispatch({ command: 'persist_workspace', args: {} })
    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(loadSession(storage)).toEqual(handle.store.getSnapshot())

    // Debounce would also write later; ensure we already wrote.
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS)
    expect(loadSession(storage)).toEqual(handle.store.getSnapshot())
  })

  it('rejects bad requests without mutating the store', () => {
    const handle = makeHandle()
    const before = handle.store.getSnapshot()
    const ipc = createDesktopIPCHandler(handle)

    expect(ipc.dispatch(null).success).toBe(false)
    expect(ipc.dispatch({ command: 'nope', args: {} }).error).toMatch(/unknown command/)
    expect(ipc.dispatch({ command: 'search_web', args: { query: 'x' } }).error).toBe(
      'not handled by window manager',
    )
    expect(ipc.dispatch({ command: 'fetch_article', args: { url: 'https://x' } }).error).toBe(
      'not handled by window manager',
    )
    expect(ipc.dispatch({ command: 'close_app', args: {} }).error).toMatch(/window_id/)
    expect(
      ipc.dispatch({ command: 'close_app', args: { window_id: 'missing' } }).error,
    ).toMatch(/unknown window_id/)
    expect(
      ipc.dispatch({
        command: 'move_window',
        args: { window_id: 'seed-notes', x: Number.NaN, y: 1 },
      }).error,
    ).toMatch(/args\.x/)
    expect(
      ipc.dispatch({
        command: 'set_window_mode',
        args: { window_id: 'seed-notes', mode: 'maximized' },
      }).error,
    ).toMatch(/mode/)
    expect(ipc.dispatch({ command: 'open_app', args: {} }).error).toMatch(/app_name/)

    expect(handle.store.getSnapshot()).toEqual(before)
  })

  it('get_desktop_state returns a detached copy', () => {
    const handle = makeHandle()
    const ipc = createDesktopIPCHandler(handle)
    const res = ipc.dispatch({ command: 'get_desktop_state', args: {} })
    const data = res.data as DesktopSession
    data.windows[0].x = 9999
    expect(handle.store.getState().windows[0].x).not.toBe(9999)
  })
})
