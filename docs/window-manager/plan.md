# Window Manager Plan (Phase 1 / MVP)

> **Status: Superseded (Nov 2026).** The WM track shipped differently than planned
> here — read this doc for the *contract thinking*, not the implementation map:
> - No free placement, drag-snap or window frames. The desktop is a fixed **6×4
>   widget grid** with pack-style placement: `src/wm/layout.ts` (pure `fits`/`findSlot`/`pack`)
>   rendered by `shell/WidgetGrid.tsx`.
> - No `DesktopStoreAPI` interface or Mock store split. One external store with
>   localStorage persistence + hydration validation: `src/wm/desktopStore.tsx`.
> - No per-window `WindowState` / session file. State is the store's
>   `AppInstance[]`, saved/restored wholesale.
> - Each app renders **once** into a stable detached node that is claimed by the
>   grid / fullscreen / keep-alive containers (FLIP flights): `shell/InstanceHost.tsx`.
>
> The active plan for shell UI work is [`docs/ui-library/plan.md`](../ui-library/plan.md);
> engine-facing integration is specified in `docs/AI-Core/07-api-flow.md`.

## Goal

Ship a working **internal** window manager inside the Nexus React/Tauri shell so app widgets can be opened, focused, moved, resized, snapped, minimized, fullscreened, and restored after restart.

**End output of the whole WM track:** a demo where 2+ widgets are on screen, layout controls work, session survives relaunch, and `get_desktop_state` returns data that matches the UI.

**Not in this track:** native Win32 window control, agent/voice/gestures, building full app UIs (Notes/Files/etc. content).

---

## Owners (exactly 2 people)

| Person | Track | Responsibility in one line |
|--------|--------|----------------------------|
| **Yash** | WM-A | Own the **data + memory**: types, store, save/load, IPC read/persist |
| **Divy** | WM-B | Own the **interaction + UI chrome**: WindowFrame, snap, canvas, taskbar |

**Raghav:** Window Manager inspector app (`nexus.window-manager`) for live status/size checks and IPC API testing.

---

## Parallel work model (minimal waiting)

The bottleneck is **not** the store implementation — it is agreeing on a thin **interface**. After a short contract lock, both tracks run in parallel until a final glue pass.

```text
        ┌─────────────────────────────────────┐
        │  Day 0 — Contract lock (~30–60 min) │
        │  types + DesktopStoreAPI interface  │
        └──────────────┬──────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
   Yash (no wait)              Divy (no wait)
   real store                  UI vs MOCK store
   persist / IPC               snap pure fns
   IPC contracts               Frame / canvas / taskbar
         │                           │
         └─────────────┬─────────────┘
                       ▼
              Glue day — swap mock → real
              Joint demo / sign-off
```

### Day 0 contract lock — 50/50 status

**Purpose:** freeze one shared boundary and provide a reactive mock so both tracks can continue independently.

#### Yash’s 50% — complete

| Deliverable | Status | Output |
|-------------|--------|--------|
| Canonical window/session types | **Done** | `WindowMode`, `WindowState`, `DesktopGrid`, and `DesktopSession` in `modules/window-state/types.ts` |
| Remove shell type duplication | **Done** | Shell `WindowState.ts` type-only re-exports `@nexus/window-state` |
| Frozen store contract | **Done** | `apps/shell/frontend/src/wm/DesktopStoreAPI.ts` |
| Shared context/hook | **Done** | `DesktopStoreContextProvider` + `useDesktopStore()` |
| Build scaffold/verification | **Done** | Type-check and production build pass |

Yash also fixed existing frontend build blockers: the invalid internal-app path alias, missing Vite `@` alias and `index.html`, incorrect `App` import, and untyped Tauri global usage.

Stable imports now available to Divy:

```typescript
import type {
  ArrangePreset,
  DesktopStoreAPI,
  OpenAppOptions,
} from '@/wm/DesktopStoreAPI'
import { useDesktopStore } from '@/wm/DesktopStoreContext'
import type {
  DesktopGrid,
  DesktopSession,
  WindowMode,
  WindowState,
} from '@/types/WindowState'
```

**Frozen rule:** Divy must not rename or change these action signatures without agreeing with Yash.

#### Divy’s 50% — remaining Day 0 work

**Task D0-D1 — Add the reactive mock provider**

Create `apps/shell/frontend/src/wm/MockDesktopProvider.tsx`.

Implementation:
1. Seed two internal windows: Notes and Files (`isExternal: false`).
2. Use default grid `{ cols: 12, rows: 8 }`.
3. Implement every `DesktopStoreAPI` method with React state:
   - `openApp`, `closeApp`, `focusApp`
   - `moveWindow`, `resizeWindow`, `setMode`
   - `arrange`, `switchWorkspace`
   - `hydrate`, `getSnapshot`
4. Enforce: at most one focused window; `focusedId` matches it; focused window gets highest `zIndex`.
5. Keep minimized windows in `windows[]`.
6. Wrap children with Yash’s `DesktopStoreContextProvider`.
7. Do not add persistence or IPC.

Output:
- [x] `<MockDesktopProvider>` compiles and provides the complete frozen API
- [x] `useDesktopStore()` re-renders consumers after state changes
- [x] Two seed windows are available for component work
- [x] `arrange` exists; a documented no-op is acceptable for Day 0

**Task D0-D2 — Validate the contract**

Use a temporary dev harness or the first `WorkspaceCanvas` implementation to verify:

- [x] `openApp` returns an ID and focuses the new window
- [x] `focusApp` clears prior focus and raises z-index
- [x] Move/resize update geometry
- [x] Minimize retains the window in session
- [x] Close removes the window
- [x] `hydrate(getSnapshot())` preserves session state
- [x] `npx tsc --noEmit` passes
- [x] `npm run build` passes

#### Divy's 50% — status

D0-D1 and D0-D2 are implemented; B1–B3 are implemented and now run on the real store after glue.

| Deliverable | Output |
|-------------|--------|
| Mock store | `wm/mockDesktopStore.ts` re-exports Yash's `wm/desktopStore.ts`; `wm/MockDesktopProvider.tsx` still wraps the store for Divy's UI path |
| Contract validation | `wm/mockDesktopStore.test.ts` — parameterized over real + mock; both pass the same D0-D2 checks |
| `arrange` | Fully implemented (not a no-op). Taskbar uses `wm/arrange.ts`, which only calls `moveWindow`/`resizeWindow`, so the real store does not need to know the canvas size |
| Snap helpers | `wm/snap.ts` + `wm/snap.test.ts` |
| UI | `WindowFrame`, `WorkspaceCanvas`, `Taskbar`, `SnapPreview`, `wm/appRegistry.tsx` |

D0-D2 verification (`npm test`, `tsc`, `build`) is complete; those boxes are ticked.

Behaviour notes (still true on the real store):
- Drag/resize geometry is committed once on release, not per pointer move.
- Release snaps to the 12×8 grid; left/right canvas edge snaps to a half; top edge sets `fullscreen` without touching x/y/width/height (so restore returns to the prior size). Hold Alt for free placement.
- `setMode(id, 'minimized')` on the focused window hands focus to the next topmost visible window; `focusApp` on a minimized window is a no-op for focus. Taskbar restore calls `setMode(id, 'windowed')` then `focusApp(id)`.
- Restoring a minimized window always returns it to `windowed` (the API has no "previous mode" field).

**Real store (Yash A1):** `wm/desktopStore.ts` + `wm/DesktopProvider.tsx` implement the frozen API with hardening (finite geometry, mode validation, unique ids after hydrate, zIndex renumbering). Props match `MockDesktopProvider` (`canvasSize`, `persist`, `storage`, `initialSession`). Glue swap in `App.tsx` is done (`DesktopProvider`). Prefer `useDesktopStoreHandle()` for non-React IPC callers (A3).

**Divy Day 0 output:** a mock-backed UI development environment (historical). Production path now uses the real provider.

After Divy completes these two tasks, **Day 0 is complete and neither person blocks the other**.

### How Divy works without Yash’s real store

- Build `WindowFrame` / canvas / taskbar against **`DesktopStoreAPI`**, not against Yash’s hook internals
- During development, wrap UI in Divy’s `MockDesktopProvider`
- Snap/arrange = **pure functions** (`snap.ts`) — zero store dependency; unit-test with numbers only

### How Yash works without Divy’s UI

- Implement real context/reducer behind the **same** `DesktopStoreAPI`
- Persist/restore and IPC can be tested with scripted `openApp` / `moveWindow` calls (no drag UI required)
- Do not edit Divy’s component files

### Glue (only late dependency — ~half day)

1. Replace `MockDesktopProvider` with Yash’s real provider in `App.tsx`
2. Point arrange/snap commit path at real `moveWindow` / `resizeWindow` / `arrange`
3. Run joint sign-off checklist

**Merge rule:** Final product has one live store (Yash’s). `mockDesktopStore.ts` still re-exports the real store for tests. `MockDesktopProvider.tsx` is unused in production and in tests (only mentioned in comments); deleting or moving it under `__mocks__` is left to Divy, who owns that file.

### File ownership (avoid git conflicts)

| Path | Owner | Other person |
|------|--------|----------------|
| `modules/window-state/**` | Yash | Read-only after Day 0 |
| `modules/ipc/contract.ts` | Yash | — |
| `modules/storage/**` + persist helpers | Yash | — |
| `apps/shell/.../hooks/useDesktopState.ts` | Yash | — |
| `apps/shell/.../hooks/useIPC.ts` | Yash | — |
| `src-tauri/src/commands/window.rs` | Yash | — |
| `apps/shell/.../wm/DesktopStoreAPI.ts` | Yash Day 0, then freeze | Divy reviews signatures |
| `apps/shell/.../wm/DesktopStoreContext.tsx` | Yash Day 0, then freeze | Divy consumes hook |
| `apps/shell/.../wm/MockDesktopProvider.tsx` | Divy Day 0 | Yash’s contract is read-only |
| `apps/shell/.../components/WindowFrame.tsx` | Divy | — |
| `apps/shell/.../components/WorkspaceCanvas.tsx` | Divy | — |
| `apps/shell/.../components/Taskbar.tsx` | Divy | — |
| `apps/shell/.../wm/snap.ts` (or `utils/snap.ts`) | Divy | — |
| `apps/shell/.../App.tsx` | **Glue day only** — coordinate; otherwise Divy owns chrome layout, Yash only adds provider wrapper via small PR |

Prefer **two branches** (`wm/yash-store`, `wm/divy-ui`) merging into `wm/integrate` at glue day.

---

## Shared contract

### Types (source of truth)

File: `modules/window-state/types.ts`

```typescript
type WindowMode = 'minimized' | 'windowed' | 'fullscreen'

interface WindowState {
  id: string
  appId: string
  title: string
  mode: WindowMode
  x: number
  y: number
  width: number
  height: number
  workspaceId: string
  monitor: number
  focused: boolean
  zIndex: number
  isExternal: boolean          // always false in Phase 1
  externalHandle?: string
  gridCol?: number
  gridRow?: number
  gridW?: number
  gridH?: number
}

interface DesktopGrid {
  cols: number
  rows: number
}

interface DesktopSession {
  windows: WindowState[]
  focusedId: string | null
  activeWorkspaceId: string
  grid: DesktopGrid
}
```

### `DesktopStoreAPI` (freeze after Day 0)

| Action | Input | Effect |
|--------|--------|--------|
| `openApp(appId, opts?)` | app id (+ optional title/size) | Adds `WindowState`, focuses it |
| `closeApp(id)` | window id | Removes from session |
| `focusApp(id)` | window id | One focused; highest `zIndex` |
| `moveWindow(id, x, y)` | id + position | Updates geometry |
| `resizeWindow(id, w, h)` | id + size | Updates geometry |
| `setMode(id, mode)` | id + mode | minimized / windowed / fullscreen |
| `arrange(preset)` | `'cascade' \| 'tile' \| 'snap-all-to-grid'` | Batch positions |
| `switchWorkspace(id)` | workspace id | Changes `activeWorkspaceId` |
| `hydrate(session)` | full `DesktopSession` | Replaces state (boot) |
| `getSnapshot()` | — | Serializable `DesktopSession` |

Also expose read state to UI: `windows`, `focusedId`, `activeWorkspaceId` (via hook or store subscription).

### IPC tools (Yash; Divy does not wait on these)

| Command | Input | Output |
|---------|--------|--------|
| `get_desktop_state` | optional `{ monitor? }` | Live session snapshot |
| `open_app` / `close_app` / `focus_window` | ids / names | success |
| `move_window` / `resize_window` | id + geometry | success |
| `set_window_mode` | id + mode | success |
| `switch_workspace` | workspace id | success |
| `persist_workspace` | optional name/layout | force flush |

---

## MVP checkpoints

| Checkpoint | Owner | Can start after | Output |
|------------|--------|-----------------|--------|
| Define & store layout/state | Yash | Day 0 | Real store implements API |
| Save opened + focused | Yash | A1 | Disk/cache has session JSON |
| Restore on launch | Yash | A2 save works | Relaunch restores session |
| Move / resize / modes | Divy | Day 0 + mock | Mouse controls work on mock |
| Grid snap | Divy | Day 0 (pure fns) | Snap helpers + wired on drag end |
| Canvas + taskbar | Divy | Mock store | Mini-desktop UI loop |
| Sign-off | Both | Glue day | **Done 2026-11-11** — checklist green on **real** store |

---

# Yash — WM-A tasks (independent after Day 0)

## Task A1 — Real desktop store

### Needed
- Day 0 types + `DesktopStoreAPI`
- Does **not** need Divy’s WindowFrame

### Do
1. Implement `useDesktopState` context/reducer that satisfies `DesktopStoreAPI`
2. Invariants: ≤1 focused; focused has max `zIndex`; `focusedId` in sync; minimized stays in `windows[]`
3. Shell re-exports types from `modules/window-state`
4. Provide `DesktopProvider` Divy will swap in on glue day

### Output
- [x] Real provider + hook implementing the frozen API
- [x] Script/test: `openApp` ×2 → length 2; `focusApp` → single focused
- [x] Divy can switch import from mock → real with no prop renames

**Acceptance:** API-compatible with mock; no UI required.

**Delivered:**
| File | Role |
|------|------|
| `wm/desktopStore.ts` | Framework-free production store (`createDesktopStore`) |
| `wm/DesktopProvider.tsx` | React provider + `useDesktopStoreHandle()` |
| `wm/mockDesktopStore.ts` | Thin re-export of the real store (Divy imports unchanged) |
| `hooks/useDesktopState.ts` | Legacy wrapper around `useDesktopStore()` |
| `wm/mockDesktopStore.test.ts` | Shared contract suite (real + mock) + A1 hardening |
| `wm/DesktopProvider.test.tsx` | Provider re-render + handle context |

---

## Task A2 — Persist + restore

### Needed
- A1 `getSnapshot` / `hydrate` only — **not** Divy’s UI

### Do
1. Debounced save (~300–500ms) of full `DesktopSession` JSON
2. Prefer SQLite `workspaces.layout`; fallback `localStorage` key `nexus.desktopSession` OK for first PR
3. Boot: read → `hydrate()`
4. Test by calling store actions in a small harness / Vitest / manual console — no drag needed

### Output
- [x] Persist + restore path documented
- [x] Test: scripted open/move/focus → save → hydrate → state equal

**Acceptance:** Restart (or hydrate round-trip) restores windows without any WindowFrame.

**Delivered (A2):**
| File | Role |
|------|------|
| `wm/sessionPersistence.ts` | Debounced localStorage save/load (Divy; reused by real provider) |
| `wm/DesktopProvider.tsx` | Boot restore + persister + `useDesktopStoreHandle().flush()` |
| `wm/sessionPersistence.test.ts` | Parameterized over real + mock stores |
| `wm/DesktopProvider.test.tsx` | Provider remount restore, flush, persist=false |
| `modules/window-state/README.md` | Persist path docs |

---

## Task A3 — IPC read + persist

### Needed
- A1 (+ A2 flush). **Not** blocked on Divy.

### Do
1. Typed IPC args in `modules/ipc/contract.ts`; add `focus_window` if missing
2. `get_desktop_state` → live snapshot
3. `persist_workspace` → immediate flush
4. Fix Rust `ipc_dispatch` compile for persist/load if needed

### Output
- [x] `get_desktop_state` JSON matches store after scripted opens
- [x] Contract documented for Agent team

**Acceptance:** IPC works against store alone.

**Delivered (A3):**
| File | Role |
|------|------|
| `modules/ipc/contract.ts` | Single typed contract + `focus_window` + `WM_IPC_COMMANDS` |
| `wm/desktopIPC.ts` | Store-backed dispatcher (validate → act → respond) |
| `wm/useDesktopIPCBridge.ts` | Tauri sync/listen + DEV `window.nexusIPC` |
| `wm/DesktopProvider.tsx` | Mounts the bridge (`ipc` prop for tests) |
| `src-tauri/src/commands/window.rs` | Cache-backed `get_desktop_state`, event-forwarded mutations (source only; cargo unverified) |
| `wm/desktopIPC.test.ts` / `useDesktopIPCBridge.test.tsx` | Vitest coverage |

---

# Divy — WM-B tasks (independent after Day 0)

## Task B1 — Interactive WindowFrame

### Needed
- Divy’s Day 0 `MockDesktopProvider` + Yash’s shared `useDesktopStore()` hook
- Does **not** need Yash’s real reducer or persist

### Do
1. Drag titlebar → `moveWindow`
2. Resize handles → `resizeWindow`
3. Minimize / fullscreen / close → `setMode` / `closeApp`
4. Pointer down → `focusApp`
5. Placeholder content by `appId`

### Output
- [x] `WindowFrame.tsx` wired to API actions (mock provider in Storybook or temp `App`)
- [x] Demo: drag, resize, modes, focus z-order on mock data

**Acceptance:** Fully usable against mock; zero wait on persist/IPC.

---

## Task B2 — Snap + arrange (most independent)

### Needed
- Day 0 types only (geometry numbers). **No store required** for the math.

### Do
1. Pure functions: pixel ↔ grid; edge half/maximize targets
2. Default grid **12×8** unless OS Layout specifies otherwise
3. Preview overlay component can take props `{x,y,w,h}` only
4. `arrange` presets can be pure: `(windows, preset, canvasSize) => WindowState[]` — Yash’s real `arrange` can call Divy’s pure helper later **or** Divy’s UI calls `moveWindow` in a loop after computing layout

### Output
- [x] `snap.ts` (or similar) with pure helpers + example inputs/outputs in comments or tiny tests
- [x] Wired to WindowFrame drag-end against mock

**Acceptance:** Given numbers in / numbers out; no Yash dependency.

---

## Task B3 — WorkspaceCanvas + Taskbar

### Needed
- Mock store with `windows` / `activeWorkspaceId` / minimized
- B1 frames

### Do
1. Canvas: filter by workspace + not minimized
2. Taskbar: list apps, restore minimized, focus; open Notes/Files/Settings stubs
3. Keep provider swap-friendly (`useDesktopStore()` abstract)

### Output
- [x] Canvas + taskbar working on mock
- [x] Open → minimize → restore → close loop without Yash

**Acceptance:** Mini-desktop demo on mock store alone.

---

# Glue day (only time you must sync)

### Needed
- Yash A1 done (A2/A3 nice-to-have same day)
- Divy B1–B3 done on mock

### Do
1. `App.tsx`: real `DesktopProvider` instead of mock
2. Confirm action names still match (should if API frozen)
3. Hook snap commit + arrange into real store
4. Run persist restore with real UI once
5. Sign-off checklist

### Output
- [x] Mock removed from production path (`App.tsx` uses `DesktopProvider`)
- [x] Full demo on real store + persist
- [x] Sign-off checklist green

**Estimate:** half day if Day 0 API was frozen; longer only if someone renamed actions.

---

## Parallel calendar (example)

| When | Yash | Divy | Waiting? |
|------|------|------|----------|
| Day 0 | **Done:** types + API + context + build | Implement + validate mock provider | **No dependency: contract is frozen** |
| Days 1–3 | Real store + persist | WindowFrame + snap pure + canvas | **No** |
| Days 3–4 | IPC | Taskbar + polish on mock | **No** |
| Day 5 | Glue + persist UI test | Glue + demo | **Yes — glue only** |

---

## Joint sign-off checklist (final output)

- [x] Open ≥2 apps from UI
- [x] Drag, resize, snap/grid OK
- [x] Arrange tile/cascade OK
- [x] Minimize → taskbar only; restore works
- [x] Fullscreen → restore prior size
- [x] Focus / z-order correct
- [x] Kill → relaunch restores session
- [x] `get_desktop_state` matches screen

### Sign-off results (2026-11-11)

Ran on `npm run dev` against the **real store** (header badge `real store`) with the Window Manager inspector open.

| Item | Result | Evidence |
|------|--------|----------|
| Open ≥2 apps | Pass | Notes + Files + Window Manager on canvas and taskbar |
| Drag / resize / snap | Pass | `WindowFrame` drag-end path wired to snap + `moveWindow`/`resizeWindow`; `snap.test.ts` covers grid/edge math; Tile/Cascade prove geometry commits from UI |
| Tile / Cascade | Pass | Tile laid windows into non-overlapping regions; Cascade offset positions (e.g. Notes `64,64`, Files `32,32`) |
| Minimize / restore | Pass | Inspector `set_window_mode` minimized Notes (left canvas, stayed on taskbar); Windowed restored it |
| Fullscreen / restore size | Pass | Notes went fullscreen with stored size `664×553`; Windowed restored same size |
| Focus / z-order | Pass | Focus Notes → `focused seed-notes` + taskbar pressed; Focus Files → `focused seed-files` + Files on top |
| Persist / relaunch | Pass | After reload, same geometry restored: Notes `64,64 664×553`, Files `32,32 664×553`, WM `0,0 664×553` |
| `get_desktop_state` | Pass | Inspector IPC returned success; snapshot matched the live table and on-screen frames |

---

## Window Manager inspector (Raghav)

Internal app to inspect live window status/size/mode and exercise the desktop IPC API against the real store.

| Item | Path / detail |
|------|----------------|
| Widget | `apps/shell/frontend/src/internal-apps/window-manager/frontend/src/App.tsx` |
| Tests | `.../App.test.tsx` (jsdom: table, IPC actions, log, errors) |
| Registry | `wm/appRegistry.tsx` → `nexus.window-manager` (default size 760×500) |
| Launch | Taskbar **Window Manager** button |
| IPC path | Every action uses `createDesktopIPCHandler(useDesktopStoreHandle())` |
| Commands exercised | `get_desktop_state`, `persist_workspace`, `open_app`, `close_app`, `focus_window`, `move_window`, `resize_window`, `set_window_mode`, plus an invalid-command probe |
| UI | Live table (title, appId, id, mode, position, size, focus/z, workspace), row actions, last-call log, JSON snapshot panel |
| Commit | `3b30a87` |

---

## Open items

| Item | Status |
|------|--------|
| Rust/Tauri crate build | Unverified — `cargo` not installed on this machine; A3 TypeScript + Rust source are in tree |
| SQLite persistence | Deferred (localStorage envelope is the MVP path) |
| Delete unused `MockDesktopProvider.tsx` | Left to Divy (file owner); unused in production and tests |

---

## Out of scope

| Item | Why |
|------|-----|
| Win32 native control | Phase 5 |
| Real app UIs | OS Layout |
| Agent / voice / gestures / avatar | Other tracks |
| macOS / Linux WM | Post-v1 |

---

## Key files by owner

| File | Owner |
|------|--------|
| `modules/window-state/types.ts` | Yash (Day 0 shared) |
| `apps/shell/.../wm/DesktopStoreAPI.ts` | Yash (Day 0 freeze) |
| `apps/shell/.../wm/DesktopStoreContext.tsx` | Yash (Day 0 freeze) |
| `apps/shell/.../wm/desktopStore.ts` | Yash (A1) |
| `apps/shell/.../wm/DesktopProvider.tsx` | Yash (A1) |
| `apps/shell/.../wm/MockDesktopProvider.tsx` | Divy (unused after glue; delete/move when ready) |
| `hooks/useDesktopState.ts` | Yash |
| `hooks/useIPC.ts` + Rust persist | Yash |
| `WindowFrame.tsx` / `WorkspaceCanvas.tsx` / `Taskbar.tsx` | Divy |
| `wm/snap.ts` | Divy |
| `internal-apps/window-manager/` | Raghav (inspector) |
| `App.tsx` | Glue done — uses Yash `DesktopProvider` |
