/**
 * Shell re-export of the shared IPC contract (modules/ipc/contract.ts).
 * Prefer importing from `@nexus/ipc` in new code.
 */

export type {
  FetchArticleArgs,
  GetDesktopStateArgs,
  IPCArgsMap,
  IPCCommand,
  IPCRequest,
  IPCResponse,
  MoveWindowArgs,
  OpenAppArgs,
  PersistWorkspaceArgs,
  ResizeWindowArgs,
  SearchWebArgs,
  SetWindowModeArgs,
  SwitchWorkspaceArgs,
  WMIPCCommand,
  WindowIdArgs,
} from '@nexus/ipc'

export { WM_IPC_COMMANDS } from '@nexus/ipc'
