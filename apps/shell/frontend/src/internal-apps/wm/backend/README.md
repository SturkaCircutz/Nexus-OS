# Window Manager Backend

The widget is a thin view over the frontend window-manager store
(`src/wm/desktopStore.tsx`), which the WM team will back with the
`persist_workspace` / `get_desktop_state` IPC commands (`src/types/ipc.ts`).
When that lands, the store swaps its `localStorage` save/load for IPC and this
widget needs no changes — it already speaks only in store commands and replies.
