# Window Manager (inspector)

## Purpose
Internal shell app for inspecting live window state and exercising the window-manager IPC APIs (Task for Raghav / API testing). Shows every open window's mode, geometry, focus, and workspace — including minimized windows and other workspaces that the canvas hides.

## How to launch
1. Run the shell: `cd apps/shell/frontend && npm run dev`
2. Click **Window Manager** in the taskbar (or open `nexus.window-manager` via IPC).

## What it exercises
All actions go through `createDesktopIPCHandler` (the same dispatcher as A3):

| UI control | IPC command |
|------------|-------------|
| Focus | `focus_window` |
| Minimize / Windowed / Fullscreen | `set_window_mode` |
| Nudge | `move_window` |
| Grow | `resize_window` |
| Close | `close_app` |
| get_desktop_state | `get_desktop_state` |
| persist_workspace | `persist_workspace` |
| Open Terminal | `open_app` |
| Send invalid request | deliberately bad `move_window` |

The bottom panel shows the last request and response JSON so you can verify success and error shapes without the browser console.

## Tech
- React widget under `frontend/src/App.tsx` (`WindowManagerWidget`)
- Reads: `useDesktopStore()`
- Writes: `useDesktopStoreHandle()` + `createDesktopIPCHandler`
- Requires `DesktopProvider` (already used by `App.tsx`)
