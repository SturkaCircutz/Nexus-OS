/**
 * Task D0-D2 + A1: validates the frozen DesktopStoreAPI contract against both
 * the production store and the mock re-export. Each `it` maps to one checklist
 * item in docs/window-manager/plan.md. Hardening tests (A1) run against the
 * real store only.
 */

import { describe, expect, it } from 'vitest'

import type { DesktopSession, WindowMode } from '@/types/WindowState'
import {
  createDesktopStore,
  createSeedSession,
  Z_INDEX_RENUMBER_THRESHOLD,
  type DesktopStore,
  type DesktopStoreOptions,
} from './windowStore'
import { createMockDesktopStore } from './mockDesktopStore'

type StoreFactory = (options?: DesktopStoreOptions) => DesktopStore

function assertInvariants(session: DesktopSession) {
  const focused = session.windows.filter((w) => w.focused)
  expect(focused.length).toBeLessThanOrEqual(1)
  expect(session.focusedId).toBe(focused[0]?.id ?? null)
  if (focused.length === 1) {
    const top = Math.max(...session.windows.map((w) => w.zIndex))
    expect(focused[0].zIndex).toBe(top)
    expect(session.windows.filter((w) => w.zIndex === top)).toHaveLength(1)
    expect(focused[0].mode).not.toBe('minimized')
  }
}

function makeStore(create: StoreFactory): DesktopStore {
  let n = 0
  return create({ generateId: (appId) => `${appId}#${++n}` })
}

const factories: Array<[string, StoreFactory]> = [
  ['real', createDesktopStore],
  ['mock', createMockDesktopStore],
]

describe.each(factories)('seed session (%s)', (_label, create) => {
  it('has Notes + Files, internal, on a 12x8 grid', () => {
    const s = makeStore(create).getSnapshot()
    expect(s.windows.map((w) => w.appId)).toEqual(['nexus.notes', 'nexus.files'])
    expect(s.windows.every((w) => !w.isExternal)).toBe(true)
    expect(s.grid).toEqual({ cols: 12, rows: 8 })
    assertInvariants(s)
  })
})

describe.each(factories)('DesktopStoreAPI contract (D0-D2) (%s)', (_label, create) => {
  it('openApp returns an id and focuses the new window', () => {
    const store = makeStore(create)
    const id = store.openApp('nexus.terminal', { title: 'Terminal' })
    const s = store.getSnapshot()
    expect(typeof id).toBe('string')
    expect(s.windows.find((w) => w.id === id)).toMatchObject({ title: 'Terminal', focused: true })
    expect(s.focusedId).toBe(id)
    assertInvariants(s)
  })

  it('openApp without a title derives one from the appId', () => {
    const store = makeStore(create)
    const id = store.openApp('nexus.system-monitor')
    expect(store.getState().windows.find((w) => w.id === id)?.title).toBe('System Monitor')
  })

  it('focusApp clears prior focus and raises z-index', () => {
    const store = makeStore(create)
    store.focusApp('seed-notes')
    const s = store.getSnapshot()
    expect(s.focusedId).toBe('seed-notes')
    expect(s.windows.find((w) => w.id === 'seed-files')?.focused).toBe(false)
    assertInvariants(s)
  })

  it('moveWindow / resizeWindow update geometry', () => {
    const store = makeStore(create)
    store.moveWindow('seed-notes', 10, 20)
    store.resizeWindow('seed-notes', 300, 200)
    expect(store.getState().windows.find((w) => w.id === 'seed-notes')).toMatchObject({
      x: 10,
      y: 20,
      width: 300,
      height: 200,
    })
  })

  it('minimize keeps the window in the session and hands focus to the next window', () => {
    const store = makeStore(create)
    store.setMode('seed-files', 'minimized')
    const s = store.getSnapshot()
    expect(s.windows.find((w) => w.id === 'seed-files')?.mode).toBe('minimized')
    expect(s.windows).toHaveLength(2)
    expect(s.focusedId).toBe('seed-notes')
    assertInvariants(s)
  })

  it('focusApp on a minimized window does not focus it', () => {
    const store = makeStore(create)
    store.setMode('seed-notes', 'minimized')
    store.focusApp('seed-notes')
    expect(store.getState().focusedId).toBeNull()
    assertInvariants(store.getState())
  })

  it('fullscreen keeps the windowed geometry for restore', () => {
    const store = makeStore(create)
    const before = store.getState().windows.find((w) => w.id === 'seed-notes')!
    store.setMode('seed-notes', 'fullscreen')
    store.setMode('seed-notes', 'windowed')
    expect(store.getState().windows.find((w) => w.id === 'seed-notes')).toMatchObject({
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
    })
  })

  it('closeApp removes the window and refocuses the next one', () => {
    const store = makeStore(create)
    store.closeApp('seed-files')
    const s = store.getSnapshot()
    expect(s.windows.map((w) => w.id)).toEqual(['seed-notes'])
    expect(s.focusedId).toBe('seed-notes')
    assertInvariants(s)
  })

  it('hydrate(getSnapshot()) preserves session state', () => {
    const store = makeStore(create)
    store.openApp('nexus.terminal')
    store.moveWindow('seed-notes', 1, 2)
    store.setMode('seed-files', 'minimized')
    const snapshot = store.getSnapshot()

    const other = makeStore(create)
    other.hydrate(snapshot)
    expect(other.getSnapshot()).toEqual(snapshot)
  })

  it('getSnapshot returns a detached copy', () => {
    const store = makeStore(create)
    const snapshot = store.getSnapshot()
    snapshot.windows[0].x = 9999
    expect(store.getState().windows[0].x).not.toBe(9999)
  })

  it('hydrate repairs a session that breaks the invariants', () => {
    const broken = createSeedSession()
    broken.windows.forEach((w) => (w.focused = true))
    broken.focusedId = 'seed-notes'
    const store = makeStore(create)
    store.hydrate(broken)
    expect(store.getState().focusedId).toBe('seed-notes')
    assertInvariants(store.getState())
  })

  it('arrange tiles windows in the active workspace', () => {
    const store = create({ getCanvasSize: () => ({ width: 1200, height: 800 }) })
    store.arrange('tile')
    const [notes, files] = store.getState().windows
    expect(notes).toMatchObject({ x: 0, y: 0, width: 600, height: 800 })
    expect(files).toMatchObject({ x: 600, y: 0, width: 600, height: 800 })
  })

  it('switchWorkspace moves focus to that workspace', () => {
    const store = makeStore(create)
    store.switchWorkspace('workspace-2')
    expect(store.getState()).toMatchObject({ activeWorkspaceId: 'workspace-2', focusedId: null })
    const id = store.openApp('nexus.notes')
    expect(store.getState().windows.find((w) => w.id === id)?.workspaceId).toBe('workspace-2')
    store.switchWorkspace('default')
    expect(store.getState().focusedId).toBe('seed-files')
    assertInvariants(store.getState())
  })

  it('notifies subscribers on change and ignores unknown ids', () => {
    const store = makeStore(create)
    let calls = 0
    const unsubscribe = store.subscribe(() => calls++)
    store.moveWindow('does-not-exist', 1, 1)
    store.closeApp('does-not-exist')
    expect(calls).toBe(0)
    store.moveWindow('seed-notes', 5, 5)
    expect(calls).toBe(1)
    unsubscribe()
    store.moveWindow('seed-notes', 6, 6)
    expect(calls).toBe(1)
  })
})

describe('A1 hardening (real store)', () => {
  it('openApp twice yields two windows with exactly one focused', () => {
    const store = createDesktopStore({
      initialSession: { ...createSeedSession(), windows: [], focusedId: null },
      generateId: (() => {
        let n = 0
        return (appId: string) => `${appId}#${++n}`
      })(),
    })
    const a = store.openApp('nexus.notes')
    const b = store.openApp('nexus.files')
    const s = store.getSnapshot()
    expect(s.windows).toHaveLength(2)
    expect(s.focusedId).toBe(b)
    expect(s.windows.find((w) => w.id === a)?.focused).toBe(false)
    expect(s.windows.find((w) => w.id === b)?.focused).toBe(true)
    assertInvariants(s)
  })

  it('ignores non-finite geometry on moveWindow / resizeWindow', () => {
    const store = makeStore(createDesktopStore)
    const before = store.getState().windows.find((w) => w.id === 'seed-notes')!
    let calls = 0
    store.subscribe(() => calls++)

    store.moveWindow('seed-notes', Number.NaN, 10)
    store.moveWindow('seed-notes', 10, Number.POSITIVE_INFINITY)
    store.resizeWindow('seed-notes', Number.NaN, 200)
    store.resizeWindow('seed-notes', 300, Number.NEGATIVE_INFINITY)
    expect(calls).toBe(0)
    expect(store.getState().windows.find((w) => w.id === 'seed-notes')).toMatchObject({
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
    })
  })

  it('rounds finite geometry to integers', () => {
    const store = makeStore(createDesktopStore)
    store.moveWindow('seed-notes', 10.7, 20.2)
    store.resizeWindow('seed-notes', 300.9, 200.1)
    expect(store.getState().windows.find((w) => w.id === 'seed-notes')).toMatchObject({
      x: 11,
      y: 20,
      width: 301,
      height: 200,
    })
  })

  it('ignores invalid modes and same-mode setMode does not notify', () => {
    const store = makeStore(createDesktopStore)
    let calls = 0
    store.subscribe(() => calls++)

    store.setMode('seed-notes', 'not-a-mode' as WindowMode)
    expect(calls).toBe(0)
    expect(store.getState().windows.find((w) => w.id === 'seed-notes')?.mode).toBe('windowed')

    store.setMode('seed-notes', 'windowed')
    expect(calls).toBe(0)

    store.setMode('seed-notes', 'fullscreen')
    expect(calls).toBe(1)
  })

  it('never collides ids after hydrate when generateId returns a taken id', () => {
    const store = createDesktopStore({
      generateId: () => 'seed-notes',
    })
    const id = store.openApp('nexus.terminal')
    expect(id).not.toBe('seed-notes')
    expect(store.getState().windows.filter((w) => w.id === id)).toHaveLength(1)
    expect(store.getState().windows.filter((w) => w.id === 'seed-notes')).toHaveLength(1)
  })

  it('renumbers zIndex when the threshold is exceeded and keeps focus on top', () => {
    const seed = createSeedSession()
    seed.windows = seed.windows.map((w) =>
      w.id === 'seed-files'
        ? { ...w, zIndex: Z_INDEX_RENUMBER_THRESHOLD }
        : { ...w, zIndex: Z_INDEX_RENUMBER_THRESHOLD - 1 },
    )
    const store = createDesktopStore({ initialSession: seed })
    store.focusApp('seed-notes')
    const s = store.getSnapshot()
    expect(Math.max(...s.windows.map((w) => w.zIndex))).toBeLessThanOrEqual(
      s.windows.length,
    )
    expect(s.focusedId).toBe('seed-notes')
    assertInvariants(s)
  })
})
