# Window-State Module (Cross-Cutting)

## Purpose
Shared `WindowState` abstraction consumed by the React shell (TS), Rust layer, and Python engine. Guarantees a single data contract for internal widgets and external Win32 windows.

## Tech Stack
- TypeScript

## Folder Layout
```
modules/window-state/
├── types.ts             # WindowState + WindowMode + DesktopSession
└── README.md
```

## How to Use
Import `WindowState` in `apps/shell/frontend/src/types/WindowState.ts` (re-export from here).

## How to Add a Feature
Add a field to `WindowState` and update all three consumers (TS, Rust struct, Pydantic model).

## IPC / API Contracts
See `types.ts`.

## Session persistence (Phase 1 / Task A2)

The shell owns save/restore of a full `DesktopSession`. Implementation lives in
`apps/shell/frontend/src/wm/sessionPersistence.ts` and is wired by
`DesktopProvider`.

| Detail | Value |
|--------|--------|
| Storage | `localStorage` (SQLite `workspaces.layout` deferred) |
| Key | `nexus.desktopSession` |
| Schema version | `1` (versioned JSON envelope with `savedAt` + `session`) |
| Debounce | 400ms (`DEFAULT_SAVE_DEBOUNCE_MS`) |
| Boot | `loadSession()` → `createDesktopStore({ initialSession })` |
| Immediate flush | `pagehide`, `visibilitychange` (hidden), persister `dispose()`, and `useDesktopStoreHandle().flush()` (for A3 `persist_workspace`) |

Corrupt or unknown-version data is ignored and the seed session is used.
Malformed individual windows are dropped; focus/z-order invariants are repaired by the store on hydrate.
