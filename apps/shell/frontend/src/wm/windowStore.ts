/**
 * Production desktop store implementing the frozen DesktopStoreAPI actions
 * (WM-A / Task A1). DesktopProvider wraps this with React; tests use it
 * directly. Persistence is wired by the provider (A2); IPC by A3.
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

/** When max zIndex exceeds this, windows are renumbered 1..n keeping order. */
export const Z_INDEX_RENUMBER_THRESHOLD = 10_000

const OPEN_OFFSET_START = 48
const OPEN_OFFSET_STEP = 32
const OPEN_OFFSET_STEPS = 8

const WINDOW_MODES: readonly WindowMode[] = ['minimized', 'windowed', 'fullscreen']

/** The store's actions: DesktopStoreAPI minus the read-only state fields. */
export type DesktopStoreActions = Omit<
  DesktopStoreAPI,
  'windows' | 'focusedId' | 'activeWorkspaceId' | 'grid'
>

export interface DesktopStore extends DesktopStoreActions {
  getState(): DesktopSession
  subscribe(listener: () => void): () => void
}

export interface DesktopStoreOptions {
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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isValidMode(mode: unknown): mode is WindowMode {
  return typeof mode === 'string' && WINDOW_MODES.includes(mode as WindowMode)
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

/** Renumber zIndex to 1..n while preserving relative order. */
function renumberZIndexes(windows: WindowState[]): WindowState[] {
  const ordered = [...windows].sort((a, b) => a.zIndex - b.zIndex)
  const rank = new Map(ordered.map((w, i) => [w.id, i + 1]))
  return windows.map((w) => ({ ...w, zIndex: rank.get(w.id)! }))
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
  let zIndex = target.zIndex > topOfOthers ? target.zIndex : topOfOthers + 1
  let windows = session.windows.map((w) => {
    if (w.id === target.id) return { ...w, focused: true, zIndex }
    return w.focused ? { ...w, focused: false } : w
  })

  if (zIndex > Z_INDEX_RENUMBER_THRESHOLD) {
    windows = renumberZIndexes(windows)
  }

  return {
    ...session,
    focusedId: target.id,
    windows,
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
  const mode = isValidMode(options.mode) ? options.mode : 'windowed'
  const workspaceId =
    typeof options.workspaceId === 'string' && options.workspaceId.length > 0
      ? options.workspaceId
      : session.activeWorkspaceId
  const monitor = isFiniteNumber(options.monitor) ? Math.round(options.monitor) : 0
  const x = isFiniteNumber(options.x) ? Math.round(options.x) : offset
  const y = isFiniteNumber(options.y) ? Math.round(options.y) : offset
  const width = isFiniteNumber(options.width)
    ? Math.max(1, Math.round(options.width))
    : DEFAULT_WINDOW_SIZE.width
  const height = isFiniteNumber(options.height)
    ? Math.max(1, Math.round(options.height))
    : DEFAULT_WINDOW_SIZE.height

  return {
    id,
    appId,
    title: typeof options.title === 'string' && options.title.length > 0
      ? options.title
      : defaultTitleFor(appId),
    mode,
    x,
    y,
    width,
    height,
    workspaceId,
    monitor,
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

function defaultGenerateId(appId: string, counter: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${appId}-${crypto.randomUUID()}`
  }
  return `${appId}-${Date.now().toString(36)}-${counter}`
}

export function createDesktopStore(options: DesktopStoreOptions = {}): DesktopStore {
  let state = normalize(options.initialSession ?? createSeedSession())
  const listeners = new Set<() => void>()
  let counter = 0

  const externalGenerateId = options.generateId

  function allocateId(appId: string): string {
    counter += 1
    let id = externalGenerateId
      ? externalGenerateId(appId)
      : defaultGenerateId(appId, counter)
    // Custom generateId may collide with hydrated/seed ids; fall back to a unique one.
    if (state.windows.some((w) => w.id === id)) {
      counter += 1
      id = defaultGenerateId(appId, counter)
      while (state.windows.some((w) => w.id === id)) {
        counter += 1
        id = defaultGenerateId(appId, counter)
      }
    }
    return id
  }

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
      const id = allocateId(appId)
      const win = makeWindow(id, appId, opts, state)
      // Bound zIndex after open as well (seed + many opens).
      let withWindow = { ...state, windows: [...state.windows, win] }
      if (maxZ(withWindow.windows) > Z_INDEX_RENUMBER_THRESHOLD) {
        withWindow = { ...withWindow, windows: renumberZIndexes(withWindow.windows) }
      }
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
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) return
      updateWindow(id, { x: Math.round(x), y: Math.round(y) })
    },

    resizeWindow(id: string, width: number, height: number) {
      if (!isFiniteNumber(width) || !isFiniteNumber(height)) return
      updateWindow(id, {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      })
    },

    setMode(id: string, mode: WindowMode) {
      if (!has(id)) return
      if (!isValidMode(mode)) return
      const current = state.windows.find((w) => w.id === id)
      if (!current || current.mode === mode) return
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
      if (typeof id !== 'string' || id.length === 0) return
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
