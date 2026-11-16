/**
 * Tauri + browser-console bridge for the desktop IPC dispatcher (WM-A / Task A3).
 *
 * - Outside Tauri: no-ops for invoke/listen (plain Vite / tests stay clean).
 * - Under Tauri: pushes snapshots to Rust (`sync_desktop_state`) and answers
 *   `nexus://ipc-request` events with `ipc_respond`.
 * - In DEV: exposes `window.nexusIPC.dispatch` for manual console checks.
 */

import { useEffect } from 'react'

import type { IPCResponse } from '@/types/ipc'
import type { DesktopSession } from '@/types/WindowState'
import type { DesktopStoreHandle } from '@/wm/DesktopProvider'
import { createDesktopIPCHandler } from '@/wm/desktopIPC'

export const SYNC_DEBOUNCE_MS = 250
export const IPC_REQUEST_EVENT = 'nexus://ipc-request'

export interface IPCRequestEventPayload {
  request_id: string
  request: unknown
}

declare global {
  interface Window {
    nexusIPC?: {
      dispatch: (request: unknown) => IPCResponse
    }
    __TAURI_INTERNALS__?: unknown
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface DesktopIPCBridgeOptions {
  /** Override Tauri detection (tests). */
  isTauri?: () => boolean
  /** Override invoke (tests). */
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  /** Override listen (tests). */
  listen?: (
    event: string,
    handler: (event: { payload: IPCRequestEventPayload }) => void,
  ) => Promise<() => void>
  /** Expose window.nexusIPC in DEV. Defaults to true when import.meta.env.DEV. */
  enableDevConsole?: boolean
}

async function defaultInvoke(cmd: string, args?: Record<string, unknown>) {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke(cmd, args)
}

async function defaultListen(
  event: string,
  handler: (event: { payload: IPCRequestEventPayload }) => void,
) {
  const { listen } = await import('@tauri-apps/api/event')
  return listen<IPCRequestEventPayload>(event, handler)
}

/**
 * Wire the store handle to Tauri sync + request handling, and (in DEV) to
 * `window.nexusIPC`. Call from DesktopProvider.
 */
export function useDesktopIPCBridge(
  handle: DesktopStoreHandle,
  options: DesktopIPCBridgeOptions = {},
): void {
  useEffect(() => {
    const ipc = createDesktopIPCHandler(handle)
    const detectTauri = options.isTauri ?? isTauriRuntime
    const invokeFn = options.invoke ?? defaultInvoke
    const listenFn = options.listen ?? defaultListen
    const enableDevConsole = options.enableDevConsole ?? Boolean(import.meta.env.DEV)

    let disposed = false
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    let unlisten: (() => void) | undefined
    let unsubscribeStore: (() => void) | undefined

    if (enableDevConsole) {
      window.nexusIPC = { dispatch: (request) => ipc.dispatch(request) }
    }

    if (!detectTauri()) {
      return () => {
        if (enableDevConsole && window.nexusIPC) {
          delete window.nexusIPC
        }
      }
    }

    function pushSnapshot(session: DesktopSession) {
      void invokeFn('sync_desktop_state', { session }).catch(() => {
        // Shell can run before Tauri commands are registered; ignore.
      })
    }

    function scheduleSync() {
      if (syncTimer !== null) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        syncTimer = null
        if (!disposed) pushSnapshot(handle.store.getSnapshot())
      }, SYNC_DEBOUNCE_MS)
    }

    pushSnapshot(handle.store.getSnapshot())
    unsubscribeStore = handle.store.subscribe(scheduleSync)

    void listenFn(IPC_REQUEST_EVENT, (event) => {
      if (disposed) return
      const { request_id, request } = event.payload ?? { request_id: '', request: null }
      const response = ipc.dispatch(request)
      void invokeFn('ipc_respond', { requestId: request_id, response }).catch(() => {
        // ignore
      })
    }).then((fn) => {
      if (disposed) {
        fn()
        return
      }
      unlisten = fn
    })

    return () => {
      disposed = true
      if (syncTimer !== null) clearTimeout(syncTimer)
      unsubscribeStore?.()
      unlisten?.()
      if (enableDevConsole && window.nexusIPC) {
        delete window.nexusIPC
      }
    }
  }, [handle, options.enableDevConsole, options.invoke, options.isTauri, options.listen])
}
