# IPC Module (Cross-Cutting)

## Purpose
Typed JSON-RPC contract between the React shell, Rust Tauri layer, and Python engine. Single source of truth for command names and payload shapes.

## Tech Stack
- TypeScript interfaces + Rust serde structs

## Folder Layout
```
modules/ipc/
├── contract.ts        # TS command + request/response types (source of truth)
└── README.md
```

## How to Use
Import from `@nexus/ipc` in the shell (aliased to this file). The shell also re-exports via `@/types/ipc`.

```typescript
import type { IPCRequest, IPCResponse } from '@nexus/ipc'
import { WM_IPC_COMMANDS } from '@nexus/ipc'
```

## Window-manager commands (Task A3)

| Command | Args | Success `data` |
|---------|------|----------------|
| `get_desktop_state` | `{ monitor? }` | Live `DesktopSession` (shell store snapshot; filter by monitor when set) |
| `open_app` | `{ app_name, title?, mode?, x?, y?, width?, height? }` | `{ window_id }` |
| `close_app` | `{ window_id }` | `{ window_id }` |
| `focus_window` | `{ window_id }` | `{ window_id }` |
| `move_window` | `{ window_id, x, y }` | `{ window_id }` |
| `resize_window` | `{ window_id, width, height }` | `{ window_id }` |
| `set_window_mode` | `{ window_id, mode }` | `{ window_id }` |
| `switch_workspace` | `{ workspace_id }` | `{ workspace_id }` |
| `persist_workspace` | `{ name?, layout? }` (ignored in Phase 1) | `{ saved: true }` after immediate flush |

Non-WM commands `search_web` / `fetch_article` remain in `IPCCommand` but are rejected by the window-manager dispatcher with `error: "not handled by window manager"`.

### Error shape
Always `{ success: false, error: string }` — never thrown. Covers unknown command, bad/missing args (field named in the message), unknown `window_id`, invalid mode, and non-finite numbers.

### Data flow (Phase 1)
1. React `DesktopStore` is the source of truth for the internal desktop session.
2. `createDesktopIPCHandler` maps IPC requests onto store actions / `getSnapshot` / `flush`.
3. Under Tauri, the shell pushes snapshots via `sync_desktop_state` into a Rust cache.
4. Rust `ipc_dispatch` serves `get_desktop_state` from that cache and forwards mutations as `nexus://ipc-request` events back to the shell.

**Agent team note:** Prefer `get_desktop_state` against the shell cache (not raw Win32 enumeration) for Phase 1 internal widgets.

## How to Add a Feature
1. Add a variant to `IPCCommand` and `IPCArgsMap` in `contract.ts`.
2. If it is a WM command, add it to `WM_IPC_COMMANDS` and handle it in `apps/shell/frontend/src/wm/desktopIPC.ts`.
3. Add a match arm in Rust `src-tauri/src/commands/window.rs`.
4. Add a handler in the Python engine when the agent should call it.
