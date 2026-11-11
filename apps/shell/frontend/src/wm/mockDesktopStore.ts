/**
 * Framework-free mock implementation of the frozen DesktopStoreAPI actions
 * (WM-B / Task D0-D1). MockDesktopProvider wraps this with React; tests use it
 * directly.
 *
 * In-memory only: no persistence, no IPC. Replaced by Yash's real provider on glue day.
 *
 * Invariants enforced after every action:
 *   - at most one window has `focused: true`, and `focusedId` points at it (or is null)
 *   - the focused window has the highest zIndex
 *   - minimized windows stay in `windows[]` and are never focused
 */

import type {
  DesktopGrid,
  DesktopSession,
  WindowMode,
  WindowState,
} from '@/types/WindowState'
import type {
  ArrangePreset,
  DesktopStoreAPI,
  OpenAppOptions,
} from '@/wm/DesktopStoreAPI'
import { computeArrangement, DEFAULT_GRID, type Size } from './snap'

export const DEFAULT_WORKSPACE_ID = 'default'
export const DEFAULT_WINDOW_SIZE: Size = { width: 520, height: 360 }

/** Canvas size `arrange()` falls back to when the provider is not told the real one. */
export const FALLBACK_CANVAS_SIZE: Size = { width: 1280, height: 720 }

const OPEN_OFFSET_START = 48
const OPEN_OFFSET_STEP = 32
const OPEN_OFFSET_STEPS = 8

/** The store's actions: DesktopStoreAPI minus the read-only state fields. */
export type DesktopStoreActions = Omit<
  DesktopStoreAPI,
  'windows' | 'focusedId' | 'activeWorkspaceId' | 'grid'
>

export interface MockDesktopStore extends DesktopStoreActions {
  getState(): DesktopSession
  subscribe(listener: () => void): () => void
}

export interface MockDesktopStoreOptions {
  initialSession?: DesktopSession
  /** Canvas size used by `arrange()`. Falls back to FALLBACK_CANVAS_SIZE when undefined. */
  getCanvasSize?: () => Size | undefined
  /** Override id generation (tests). */
  generateId?: (appId: string) => string
}

function cloneSession(session: DesktopSession): DesktopSession {
  return {
    ...session,
    grid: { ...session.grid },
    windows: session.windows.map((w) => ({ ...w })),
  }
}

/** 'nexus.system-monitor' -> 'System Monitor' */
export function defaultTitleFor(appId: string): string {
  const last = appId.split('.').pop() || appId
  return last
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function maxZ(windows: WindowState[]): number {
  return windows.reduce((max, w) => Math.max(max, w.zIndex), 0)
}

/** Focus `id` (or clear focus when null/unknown/minimized) and raise it to the top. */
function applyFocus(session: DesktopSession, id: string | null): DesktopSession {
  const target = id ? session.windows.find((w) => w.id === id) : undefined

  if (!target || target.mode === 'minimized') {
    return {
      ...session,
      focusedId: null,
      windows: session.windows.map((w) => (w.focused ? { ...w, focused: false } : w)),
    }
  }

  const topOfOthers = maxZ(session.windows.filter((w) => w.id !== target.id))
  const zIndex = target.zIndex > topOfOthers ? target.zIndex : topOfOthers + 1

  return {
    ...session,
    focusedId: target.id,
    windows: session.windows.map((w) => {
      if (w.id === target.id) return { ...w, focused: true, zIndex }
      return w.focused ? { ...w, focused: false } : w
    }),
  }
}

/** Topmost visible window in the active workspace, optionally excluding one id. */
function nextFocusCandidate(session: DesktopSession, excludeId?: string): string | null {
  let best: WindowState | null = null
  for (const w of session.windows) {
    if (w.id === excludeId) continue
    if (w.mode === 'minimized') continue
    if (w.workspaceId !== session.activeWorkspaceId) continue
    if (!best || w.zIndex > best.zIndex) best = w
  }
  return best ? best.id : null
}

/** Re-establish invariants on an arbitrary (e.g. hydrated) session. */
function normalize(session: DesktopSession): DesktopSession {
  const copy = cloneSession(session)
  const requested = copy.focusedId ?? copy.windows.find((w) => w.focused)?.id ?? null
  return applyFocus(copy, requested)
}

function makeWindow(
  id: string,
  appId: string,
  options: OpenAppOptions,
  session: DesktopSession,
): WindowState {
  const offset =
    OPEN_OFFSET_START + (session.windows.length % OPEN_OFFSET_STEPS) * OPEN_OFFSET_STEP
  return {
    id,
    appId,
    title: options.title ?? defaultTitleFor(appId),
    mode: options.mode ?? 'windowed',
    x: options.x ?? offset,
    y: options.y ?? offset,
    width: options.width ?? DEFAULT_WINDOW_SIZE.width,
    height: options.height ?? DEFAULT_WINDOW_SIZE.height,
    workspaceId: options.workspaceId ?? session.activeWorkspaceId,
    monitor: options.monitor ?? 0,
    focused: false,
    zIndex: maxZ(session.windows) + 1,
    isExternal: false,
  }
}

/** Two internal seed windows (Notes, Files) on a 12x8 grid, Files focused. */
export function createSeedSession(grid: DesktopGrid = DEFAULT_GRID): DesktopSession {
  const base = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    monitor: 0,
    isExternal: false,
    mode: 'windowed' as WindowMode,
  }
  return {
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    grid: { ...grid },
    focusedId: 'seed-files',
    windows: [
      {
        ...base,
        id: 'seed-notes',
        appId: 'nexus.notes',
        title: 'Notes',
        x: 48,
        y: 48,
        width: 520,
        height: 360,
        focused: false,
        zIndex: 1,
      },
      {
        ...base,
        id: 'seed-files',
        appId: 'nexus.files',
        title: 'Files',
        x: 620,
        y: 96,
        width: 520,
        height: 380,
        focused: true,
        zIndex: 2,
      },
    ],
  }
}

export function createMockDesktopStore(
  options: MockDesktopStoreOptions = {},
): MockDesktopStore {
  let state = normalize(options.initialSession ?? createSeedSession())
  const listeners = new Set<() => void>()
  let counter = 0

  const generateId =
    options.generateId ??
    ((appId: string) => {
      counter += 1
      return `${appId}-${Date.now().toString(36)}-${counter}`
    })

  function set(next: DesktopSession) {
    if (next === state) return
    state = next
    listeners.forEach((listener) => listener())
  }

  function has(id: string): boolean {
    return state.windows.some((w) => w.id === id)
  }

  function updateWindow(id: string, patch: Partial<WindowState>) {
    if (!has(id)) return
    set({
      ...state,
      windows: state.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    openApp(appId: string, opts: OpenAppOptions = {}) {
      const id = generateId(appId)
      const win = makeWindow(id, appId, opts, state)
      const withWindow = { ...state, windows: [...state.windows, win] }
      set(win.mode === 'minimized' ? withWindow : applyFocus(withWindow, id))
      return id
    },

    closeApp(id: string) {
      if (!has(id)) return
      const wasFocused = state.focusedId === id
      const remaining = { ...state, windows: state.windows.filter((w) => w.id !== id) }
      set(wasFocused ? applyFocus(remaining, nextFocusCandidate(remaining)) : remaining)
    },

    focusApp(id: string) {
      if (!has(id)) return
      set(applyFocus(state, id))
    },

    moveWindow(id: string, x: number, y: number) {
      updateWindow(id, { x, y })
    },

    resizeWindow(id: string, width: number, height: number) {
      updateWindow(id, { width: Math.max(1, width), height: Math.max(1, height) })
    },

    setMode(id: string, mode: WindowMode) {
      if (!has(id)) return
      const next = {
        ...state,
        windows: state.windows.map((w) => (w.id === id ? { ...w, mode } : w)),
      }
      if (mode === 'minimized' && state.focusedId === id) {
        set(applyFocus(next, nextFocusCandidate(next, id)))
      } else {
        set(next)
      }
    },

    arrange(preset: ArrangePreset) {
      const canvas = options.getCanvasSize?.() ?? FALLBACK_CANVAS_SIZE
      set({
        ...state,
        windows: computeArrangement(
          state.windows,
          preset,
          canvas,
          state.grid,
          state.activeWorkspaceId,
        ),
      })
    },

    switchWorkspace(id: string) {
      if (id === state.activeWorkspaceId) return
      const switched = { ...state, activeWorkspaceId: id }
      const focused = state.windows.find((w) => w.id === state.focusedId)
      const keepFocus = focused && focused.workspaceId === id
      set(keepFocus ? switched : applyFocus(switched, nextFocusCandidate(switched)))
    },

    hydrate(session: DesktopSession) {
      set(normalize(session))
    },

    getSnapshot: () => cloneSession(state),
  }
}
