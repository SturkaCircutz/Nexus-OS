/**
 * Store-backed IPC dispatcher (WM-A / Task A3).
 *
 * Maps typed IPC requests onto DesktopStoreHandle actions. Pure validation +
 * dispatch: no React, no Tauri. The bridge (useDesktopIPCBridge) and tests
 * call this directly.
 */

import type {
  IPCCommand,
  IPCRequest,
  IPCResponse,
  WMIPCCommand,
} from '@/types/ipc'
import { WM_IPC_COMMANDS } from '@/types/ipc'
import type { DesktopSession, WindowMode } from '@/types/WindowState'
import type { DesktopStoreHandle } from '@/wm/DesktopProvider'
import type { OpenAppOptions } from '@/wm/DesktopStoreAPI'

const WINDOW_MODES: readonly WindowMode[] = ['minimized', 'windowed', 'fullscreen']
const WM_SET = new Set<string>(WM_IPC_COMMANDS)

export interface DesktopIPCHandler {
  dispatch(request: unknown): IPCResponse
}

function ok<T>(data: T): IPCResponse<T> {
  return { success: true, data }
}

function fail(error: string): IPCResponse {
  return { success: false, error }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isValidMode(v: unknown): v is WindowMode {
  return typeof v === 'string' && WINDOW_MODES.includes(v as WindowMode)
}

function requireWindowId(
  store: DesktopStoreHandle['store'],
  args: Record<string, unknown>,
): { id: string } | IPCResponse {
  if (!isNonEmptyString(args.window_id)) {
    return fail('missing or invalid args.window_id')
  }
  if (!store.getState().windows.some((w) => w.id === args.window_id)) {
    return fail(`unknown window_id: ${args.window_id}`)
  }
  return { id: args.window_id }
}

function optionalNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined | IPCResponse {
  const v = args[key]
  if (v === undefined) return undefined
  if (!isFiniteNumber(v)) return fail(`invalid args.${key}`)
  return v
}

function filterByMonitor(session: DesktopSession, monitor?: number): DesktopSession {
  if (monitor === undefined) return session
  const windows = session.windows.filter((w) => w.monitor === monitor)
  const focusedId =
    session.focusedId && windows.some((w) => w.id === session.focusedId)
      ? session.focusedId
      : null
  return {
    ...session,
    windows,
    focusedId,
  }
}

export function createDesktopIPCHandler(handle: DesktopStoreHandle): DesktopIPCHandler {
  const { store } = handle

  function dispatchWM(command: WMIPCCommand, args: Record<string, unknown>): IPCResponse {
    switch (command) {
      case 'get_desktop_state': {
        const monitor = optionalNumber(args, 'monitor')
        if (monitor && typeof monitor === 'object' && 'success' in monitor) return monitor
        return ok(filterByMonitor(store.getSnapshot(), monitor as number | undefined))
      }

      case 'open_app': {
        if (!isNonEmptyString(args.app_name)) return fail('missing or invalid args.app_name')
        const opts: OpenAppOptions = {}
        if (args.title !== undefined) {
          if (!isNonEmptyString(args.title)) return fail('invalid args.title')
          opts.title = args.title
        }
        if (args.mode !== undefined) {
          if (!isValidMode(args.mode)) return fail('invalid args.mode')
          opts.mode = args.mode
        }
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          const n = optionalNumber(args, key)
          if (n && typeof n === 'object' && 'success' in n) return n
          if (n !== undefined) opts[key] = n as number
        }
        const window_id = store.openApp(args.app_name, opts)
        return ok({ window_id })
      }

      case 'close_app': {
        const idOrErr = requireWindowId(store, args)
        if ('success' in idOrErr) return idOrErr
        store.closeApp(idOrErr.id)
        return ok({ window_id: idOrErr.id })
      }

      case 'focus_window': {
        const idOrErr = requireWindowId(store, args)
        if ('success' in idOrErr) return idOrErr
        store.focusApp(idOrErr.id)
        return ok({ window_id: idOrErr.id })
      }

      case 'move_window': {
        const idOrErr = requireWindowId(store, args)
        if ('success' in idOrErr) return idOrErr
        if (!isFiniteNumber(args.x)) return fail('missing or invalid args.x')
        if (!isFiniteNumber(args.y)) return fail('missing or invalid args.y')
        store.moveWindow(idOrErr.id, args.x, args.y)
        return ok({ window_id: idOrErr.id })
      }

      case 'resize_window': {
        const idOrErr = requireWindowId(store, args)
        if ('success' in idOrErr) return idOrErr
        if (!isFiniteNumber(args.width)) return fail('missing or invalid args.width')
        if (!isFiniteNumber(args.height)) return fail('missing or invalid args.height')
        store.resizeWindow(idOrErr.id, args.width, args.height)
        return ok({ window_id: idOrErr.id })
      }

      case 'set_window_mode': {
        const idOrErr = requireWindowId(store, args)
        if ('success' in idOrErr) return idOrErr
        if (!isValidMode(args.mode)) return fail('missing or invalid args.mode')
        store.setMode(idOrErr.id, args.mode)
        return ok({ window_id: idOrErr.id })
      }

      case 'switch_workspace': {
        if (!isNonEmptyString(args.workspace_id)) {
          return fail('missing or invalid args.workspace_id')
        }
        store.switchWorkspace(args.workspace_id)
        return ok({ workspace_id: args.workspace_id })
      }

      case 'persist_workspace': {
        handle.flush()
        return ok({ saved: true })
      }

      default: {
        const _exhaustive: never = command
        return fail(`unhandled command: ${_exhaustive}`)
      }
    }
  }

  return {
    dispatch(request: unknown): IPCResponse {
      if (!isObject(request)) return fail('request must be an object')
      if (!isNonEmptyString(request.command)) return fail('missing or invalid command')
      const command = request.command as IPCCommand
      const args = request.args === undefined ? {} : request.args
      if (!isObject(args)) return fail('args must be an object')

      if (command === 'search_web' || command === 'fetch_article') {
        return fail('not handled by window manager')
      }

      if (!WM_SET.has(command)) {
        return fail(`unknown command: ${command}`)
      }

      return dispatchWM(command as WMIPCCommand, args)
    },
  }
}

/** Narrow helper for typed calls in tests / console. */
export function asIPCRequest<C extends IPCCommand>(
  command: C,
  args: IPCRequest<C>['args'],
): IPCRequest<C> {
  return { command, args }
}
