/**
 * Checkpoints "Save opened and focused app" and "Restore open and focused apps
 * on launch". Mirrors the WM plan's A2 test: scripted open/move/focus -> save ->
 * relaunch (new store) -> state equal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopSession } from '@/types/WindowState'
import { createMockDesktopStore, createSeedSession } from './mockDesktopStore'
import {
  clearSavedSession,
  createSessionPersister,
  DEFAULT_SAVE_DEBOUNCE_MS,
  loadSession,
  parseSession,
  saveSession,
  SESSION_SCHEMA_VERSION,
  SESSION_STORAGE_KEY,
  type SessionStorage,
} from './sessionPersistence'

function memoryStorage(): SessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

/** Simulates relaunch: a brand-new store booted from whatever is saved. */
function relaunch(storage: SessionStorage) {
  return createMockDesktopStore({ initialSession: loadSession(storage) ?? undefined })
}

describe('saveSession / loadSession', () => {
  it('round-trips a session', () => {
    const storage = memoryStorage()
    const session = createSeedSession()
    expect(saveSession(session, storage)).toBe(true)
    expect(loadSession(storage)).toEqual(session)
  })

  it('wraps the session in a versioned envelope', () => {
    const storage = memoryStorage()
    saveSession(createSeedSession(), storage, () => new Date('2026-10-31T00:00:00Z'))
    const envelope = JSON.parse(storage.data.get(SESSION_STORAGE_KEY)!)
    expect(envelope.version).toBe(SESSION_SCHEMA_VERSION)
    expect(envelope.savedAt).toBe('2026-10-31T00:00:00.000Z')
  })

  it('returns null when nothing is saved or storage is unavailable', () => {
    expect(loadSession(memoryStorage())).toBeNull()
    expect(loadSession(null)).toBeNull()
    expect(saveSession(createSeedSession(), null)).toBe(false)
  })

  it('returns null for corrupt JSON or an unknown schema version', () => {
    const storage = memoryStorage()
    storage.setItem(SESSION_STORAGE_KEY, '{not json')
    expect(loadSession(storage)).toBeNull()
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ version: 999, session: createSeedSession() }))
    expect(loadSession(storage)).toBeNull()
  })

  it('does not throw when storage throws (quota, privacy mode)', () => {
    const throwing: SessionStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadSession(throwing)).toBeNull()
    expect(saveSession(createSeedSession(), throwing)).toBe(false)
    expect(() => clearSavedSession(throwing)).not.toThrow()
  })

  it('clearSavedSession removes the saved session', () => {
    const storage = memoryStorage()
    saveSession(createSeedSession(), storage)
    clearSavedSession(storage)
    expect(loadSession(storage)).toBeNull()
  })
})

describe('parseSession', () => {
  it('rejects a wrong top-level shape', () => {
    expect(parseSession(null)).toBeNull()
    expect(parseSession({ windows: 'nope' })).toBeNull()
    expect(parseSession({ ...createSeedSession(), grid: { cols: 0, rows: 8 } })).toBeNull()
  })

  it('drops malformed and duplicate windows but keeps the rest', () => {
    const seed = createSeedSession()
    const raw = {
      ...seed,
      windows: [seed.windows[0], { ...seed.windows[1], width: 'wide' }, { ...seed.windows[0] }],
    }
    const parsed = parseSession(raw)!
    expect(parsed.windows.map((w) => w.id)).toEqual([seed.windows[0].id])
  })

  it('clears a focusedId that points at a dropped window', () => {
    const seed = createSeedSession()
    const focused = seed.windows.find((w) => w.id === seed.focusedId)!
    const raw = {
      ...seed,
      windows: seed.windows.map((w) => (w.id === focused.id ? { ...w, mode: 'maximized' } : w)),
    }
    expect(parseSession(raw)!.focusedId).toBeNull()
  })
})

describe('createSessionPersister', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves opened apps and the focused app after the debounce', () => {
    const storage = memoryStorage()
    const store = createMockDesktopStore()
    createSessionPersister(store, { storage })

    const id = store.openApp('nexus.terminal')
    expect(loadSession(storage)).toBeNull()

    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS)
    const saved = loadSession(storage)!
    expect(saved.windows.map((w) => w.appId)).toContain('nexus.terminal')
    expect(saved.focusedId).toBe(id)
  })

  it('coalesces a burst of changes into one write', () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    const store = createMockDesktopStore()
    createSessionPersister(store, { storage })

    const id = store.openApp('nexus.notes')
    store.moveWindow(id, 10, 20)
    store.resizeWindow(id, 400, 300)
    store.arrange('tile')
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS)

    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('flush writes pending changes immediately; dispose flushes then stops', () => {
    const storage = memoryStorage()
    const store = createMockDesktopStore()
    const persister = createSessionPersister(store, { storage })

    store.openApp('nexus.files')
    persister.flush()
    expect(loadSession(storage)).toEqual(store.getSnapshot())

    const id = store.openApp('nexus.terminal')
    persister.dispose()
    expect(loadSession(storage)!.focusedId).toBe(id)

    store.closeApp(id)
    vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS * 2)
    expect(loadSession(storage)!.windows.some((w) => w.id === id)).toBe(true)
  })
})

describe('restore on launch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('scripted open/move/focus -> save -> relaunch restores the same session', () => {
    const storage = memoryStorage()
    const store = createMockDesktopStore()
    const persister = createSessionPersister(store, { storage })

    const terminal = store.openApp('nexus.terminal')
    store.moveWindow(terminal, 120, 80)
    store.resizeWindow(terminal, 640, 400)
    const notes = store.getSnapshot().windows[0].id
    store.focusApp(notes)
    persister.dispose()

    const before: DesktopSession = store.getSnapshot()
    const after = relaunch(storage).getSnapshot()

    expect(after).toEqual(before)
    expect(after.focusedId).toBe(notes)
    expect(after.windows.find((w) => w.id === terminal)).toMatchObject({
      x: 120,
      y: 80,
      width: 640,
      height: 400,
    })
  })

  it('restores minimized and fullscreen modes', () => {
    const storage = memoryStorage()
    const store = createMockDesktopStore()
    const [a, b] = store.getSnapshot().windows.map((w) => w.id)
    store.setMode(a, 'minimized')
    store.setMode(b, 'fullscreen')
    saveSession(store.getSnapshot(), storage)

    const restored = relaunch(storage).getSnapshot()
    expect(restored.windows.find((w) => w.id === a)!.mode).toBe('minimized')
    expect(restored.windows.find((w) => w.id === b)!.mode).toBe('fullscreen')
  })

  it('restores an empty desktop if every app was closed', () => {
    const storage = memoryStorage()
    const store = createMockDesktopStore()
    for (const w of store.getSnapshot().windows) store.closeApp(w.id)
    saveSession(store.getSnapshot(), storage)

    const restored = relaunch(storage).getSnapshot()
    expect(restored.windows).toEqual([])
    expect(restored.focusedId).toBeNull()
  })

  it('falls back to the seed session when the saved data is corrupt', () => {
    const storage = memoryStorage()
    storage.setItem(SESSION_STORAGE_KEY, 'garbage')
    expect(relaunch(storage).getSnapshot()).toEqual(createMockDesktopStore().getSnapshot())
  })

  it('repairs invariants in a saved session (two windows marked focused)', () => {
    const storage = memoryStorage()
    const seed = createSeedSession()
    const broken = { ...seed, windows: seed.windows.map((w) => ({ ...w, focused: true })) }
    saveSession(broken, storage)

    const restored = relaunch(storage).getSnapshot()
    expect(restored.windows.filter((w) => w.focused)).toHaveLength(1)
    expect(restored.focusedId).toBe(restored.windows.find((w) => w.focused)!.id)
  })
})
