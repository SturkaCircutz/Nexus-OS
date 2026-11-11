/**
 * Save / restore of the desktop session (checkpoints "Save opened and focused
 * app" and "Restore open and focused apps on launch").
 *
 * Phase 1 storage is localStorage under `nexus.desktopSession`, the fallback the
 * WM plan allows for the first PR (Task A2). The SQLite `workspaces.layout` path
 * can replace `SessionStorage` later without touching callers.
 *
 * Works against any store exposing `getSnapshot` + `subscribe`, so the real
 * provider can reuse it on glue day.
 */

import type { DesktopSession, WindowMode, WindowState } from '@/types/WindowState'

export const SESSION_STORAGE_KEY = 'nexus.desktopSession'
export const SESSION_SCHEMA_VERSION = 1
export const DEFAULT_SAVE_DEBOUNCE_MS = 400

/** The subset of the Web Storage API we use. Lets tests pass an in-memory fake. */
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

interface PersistedEnvelope {
  version: number
  savedAt: string
  session: DesktopSession
}

const WINDOW_MODES: readonly WindowMode[] = ['minimized', 'windowed', 'fullscreen']

/** window.localStorage, or null when unavailable (SSR, tests, privacy mode throwing on access). */
export function getDefaultStorage(): SessionStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isOptional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v)

function parseWindow(raw: unknown): WindowState | null {
  if (!isObject(raw)) return null
  const ok =
    isString(raw.id) &&
    raw.id.length > 0 &&
    isString(raw.appId) &&
    isString(raw.title) &&
    WINDOW_MODES.includes(raw.mode as WindowMode) &&
    isFiniteNumber(raw.x) &&
    isFiniteNumber(raw.y) &&
    isFiniteNumber(raw.width) &&
    raw.width > 0 &&
    isFiniteNumber(raw.height) &&
    raw.height > 0 &&
    isString(raw.workspaceId) &&
    isFiniteNumber(raw.monitor) &&
    typeof raw.focused === 'boolean' &&
    isFiniteNumber(raw.zIndex) &&
    typeof raw.isExternal === 'boolean' &&
    isOptional(raw.externalHandle, isString) &&
    isOptional(raw.gridCol, isFiniteNumber) &&
    isOptional(raw.gridRow, isFiniteNumber) &&
    isOptional(raw.gridW, isFiniteNumber) &&
    isOptional(raw.gridH, isFiniteNumber)
  return ok ? ({ ...raw } as unknown as WindowState) : null
}

/**
 * Validate an untrusted value as a DesktopSession. Returns null if the
 * top-level shape is wrong. Individual malformed windows are dropped (and
 * duplicate ids de-duplicated) rather than discarding the whole session.
 * A focusedId that no longer matches a window is cleared.
 * Focus/z-order invariants are left to the store's hydrate().
 */
export function parseSession(raw: unknown): DesktopSession | null {
  if (!isObject(raw)) return null
  if (!Array.isArray(raw.windows)) return null
  if (!isString(raw.activeWorkspaceId)) return null
  if (!isObject(raw.grid)) return null
  const { cols, rows } = raw.grid
  if (!isFiniteNumber(cols) || cols < 1 || !isFiniteNumber(rows) || rows < 1) return null
  if (raw.focusedId !== null && !isString(raw.focusedId)) return null

  const seen = new Set<string>()
  const windows: WindowState[] = []
  for (const item of raw.windows) {
    const w = parseWindow(item)
    if (!w || seen.has(w.id)) continue
    seen.add(w.id)
    windows.push(w)
  }

  const focusedId = isString(raw.focusedId) && seen.has(raw.focusedId) ? raw.focusedId : null

  return {
    windows,
    focusedId,
    activeWorkspaceId: raw.activeWorkspaceId,
    grid: { cols, rows },
  }
}

/** Read the saved session. Null when nothing is saved, storage is unavailable, or the data is corrupt. */
export function loadSession(storage: SessionStorage | null = getDefaultStorage()): DesktopSession | null {
  if (!storage) return null
  let text: string | null
  try {
    text = storage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
  if (!text) return null

  let envelope: unknown
  try {
    envelope = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(envelope) || envelope.version !== SESSION_SCHEMA_VERSION) return null
  return parseSession(envelope.session)
}

/** Write the session. Returns false if storage is unavailable or the write failed (e.g. quota). */
export function saveSession(
  session: DesktopSession,
  storage: SessionStorage | null = getDefaultStorage(),
  now: () => Date = () => new Date(),
): boolean {
  if (!storage) return false
  const envelope: PersistedEnvelope = {
    version: SESSION_SCHEMA_VERSION,
    savedAt: now().toISOString(),
    session,
  }
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export function clearSavedSession(storage: SessionStorage | null = getDefaultStorage()): void {
  try {
    storage?.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export interface PersistableStore {
  getSnapshot(): DesktopSession
  subscribe(listener: () => void): () => void
}

export interface SessionPersister {
  /** Write any pending change immediately (e.g. on page hide, or `persist_workspace`). */
  flush(): void
  /** Flush, then stop listening. */
  dispose(): void
}

export interface SessionPersisterOptions {
  storage?: SessionStorage | null
  debounceMs?: number
}

/**
 * Save the store's session on every change, debounced so a burst of actions
 * (arrange, drag release + focus) is one write.
 */
export function createSessionPersister(
  store: PersistableStore,
  options: SessionPersisterOptions = {},
): SessionPersister {
  const storage = options.storage === undefined ? getDefaultStorage() : options.storage
  const debounceMs = options.debounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function flush() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    saveSession(store.getSnapshot(), storage)
  }

  const unsubscribe = store.subscribe(() => {
    if (disposed) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      saveSession(store.getSnapshot(), storage)
    }, debounceMs)
  })

  return {
    flush,
    dispose() {
      if (disposed) return
      flush()
      disposed = true
      unsubscribe()
    },
  }
}
