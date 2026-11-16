/**
 * Typed JSON-RPC contract between the React shell, Rust Tauri layer, and
 * Python engine. Single source of truth for command names and payload shapes
 * (WM-A / Task A3).
 */

import type { WindowMode } from '../window-state/types'

export type IPCCommand =
  | 'get_desktop_state'
  | 'open_app'
  | 'close_app'
  | 'focus_window'
  | 'move_window'
  | 'resize_window'
  | 'set_window_mode'
  | 'switch_workspace'
  | 'search_web'
  | 'fetch_article'
  | 'persist_workspace'

/** Commands owned by the window-manager / desktop store path. */
export const WM_IPC_COMMANDS = [
  'get_desktop_state',
  'open_app',
  'close_app',
  'focus_window',
  'move_window',
  'resize_window',
  'set_window_mode',
  'switch_workspace',
  'persist_workspace',
] as const satisfies readonly IPCCommand[]

export type WMIPCCommand = (typeof WM_IPC_COMMANDS)[number]

export interface GetDesktopStateArgs {
  monitor?: number
}

export interface OpenAppArgs {
  app_name: string
  title?: string
  mode?: WindowMode
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface WindowIdArgs {
  window_id: string
}

export interface MoveWindowArgs {
  window_id: string
  x: number
  y: number
}

export interface ResizeWindowArgs {
  window_id: string
  width: number
  height: number
}

export interface SetWindowModeArgs {
  window_id: string
  mode: WindowMode
}

export interface SwitchWorkspaceArgs {
  workspace_id: string
}

export interface PersistWorkspaceArgs {
  name?: string
  layout?: unknown
}

export interface SearchWebArgs {
  query: string
  max_results?: number
}

export interface FetchArticleArgs {
  url: string
}

export interface IPCArgsMap {
  get_desktop_state: GetDesktopStateArgs
  open_app: OpenAppArgs
  close_app: WindowIdArgs
  focus_window: WindowIdArgs
  move_window: MoveWindowArgs
  resize_window: ResizeWindowArgs
  set_window_mode: SetWindowModeArgs
  switch_workspace: SwitchWorkspaceArgs
  persist_workspace: PersistWorkspaceArgs
  search_web: SearchWebArgs
  fetch_article: FetchArticleArgs
}

export interface IPCRequest<C extends IPCCommand = IPCCommand> {
  command: C
  args: IPCArgsMap[C]
}

export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
