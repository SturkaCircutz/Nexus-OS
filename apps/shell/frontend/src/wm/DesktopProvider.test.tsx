/**
 * @vitest-environment jsdom
 *
 * Provider re-render + A2 persist/restore (WM-A).
 */

import { act, cleanup, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDesktopStore } from '@/wm/DesktopStoreContext'
import { DesktopProvider, useDesktopStoreHandle } from '@/wm/DesktopProvider'
import { createSeedSession } from '@/wm/windowStore'
import {
  DEFAULT_SAVE_DEBOUNCE_MS,
  loadSession,
  SESSION_STORAGE_KEY,
  type SessionStorage,
} from '@/wm/sessionPersistence'

function memoryStorage(): SessionStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

function Probe() {
  const { windows, focusedId } = useDesktopStore()
  return (
    <div>
      <span data-testid="count">{windows.length}</span>
      <span data-testid="focused">{focusedId ?? 'none'}</span>
    </div>
  )
}

function OpenButton() {
  const store = useDesktopStore()
  return (
    <button type="button" onClick={() => store.openApp('nexus.terminal', { title: 'Terminal' })}>
      open
    </button>
  )
}

function HandleProbe() {
  const handle = useDesktopStoreHandle()
  return <span data-testid="handle-count">{handle.store.getState().windows.length}</span>
}

function MutateAndExpose() {
  const store = useDesktopStore()
  const handle = useDesktopStoreHandle()
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          const id = store.openApp('nexus.terminal', { title: 'Terminal' })
          store.moveWindow(id, 120, 80)
          store.focusApp(id)
        }}
      >
        mutate
      </button>
      <button type="button" onClick={() => handle.flush()}>
        flush
      </button>
      <span data-testid="focused">{store.focusedId ?? 'none'}</span>
      <span data-testid="count">{store.windows.length}</span>
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DesktopProvider', () => {
  it('re-renders consumers after openApp', () => {
    const session = createSeedSession()
    const { container } = render(
      <DesktopProvider initialSession={session} persist={false}>
        <Probe />
        <OpenButton />
      </DesktopProvider>,
    )
    const view = within(container)

    expect(view.getByTestId('count').textContent).toBe('2')
    expect(view.getByTestId('focused').textContent).toBe('seed-files')

    act(() => {
      view.getByRole('button', { name: 'open' }).click()
    })

    expect(view.getByTestId('count').textContent).toBe('3')
    expect(view.getByTestId('focused').textContent).not.toBe('seed-files')
    expect(view.getByTestId('focused').textContent).not.toBe('none')
  })

  it('exposes the store handle for IPC', () => {
    const { container } = render(
      <DesktopProvider initialSession={createSeedSession()} persist={false}>
        <HandleProbe />
      </DesktopProvider>,
    )
    expect(within(container).getByTestId('handle-count').textContent).toBe('2')
  })
})

describe('DesktopProvider persist (A2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('restores open/move/focus after unmount and remount with the same storage', () => {
    const storage = memoryStorage()
    const first = render(
      <DesktopProvider persist storage={storage}>
        <MutateAndExpose />
      </DesktopProvider>,
    )
    const firstView = within(first.container)

    act(() => {
      firstView.getByRole('button', { name: 'mutate' }).click()
    })
    const focusedAfterMutate = firstView.getByTestId('focused').textContent
    expect(firstView.getByTestId('count').textContent).toBe('3')

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS)
    })
    const saved = loadSession(storage)!
    expect(saved.windows).toHaveLength(3)
    expect(saved.focusedId).toBe(focusedAfterMutate)

    first.unmount()

    const second = render(
      <DesktopProvider persist storage={storage}>
        <Probe />
      </DesktopProvider>,
    )
    const secondView = within(second.container)

    expect(secondView.getByTestId('count').textContent).toBe('3')
    expect(secondView.getByTestId('focused').textContent).toBe(focusedAfterMutate)
    const terminal = loadSession(storage)!.windows.find((w) => w.appId === 'nexus.terminal')!
    expect(terminal).toMatchObject({ x: 120, y: 80 })
  })

  it('flush writes before the debounce fires', () => {
    const storage = memoryStorage()
    const { container } = render(
      <DesktopProvider persist storage={storage}>
        <MutateAndExpose />
      </DesktopProvider>,
    )
    const view = within(container)

    act(() => {
      view.getByRole('button', { name: 'mutate' }).click()
    })
    expect(loadSession(storage)).toBeNull()

    act(() => {
      view.getByRole('button', { name: 'flush' }).click()
    })
    expect(loadSession(storage)).not.toBeNull()
    expect(loadSession(storage)!.windows).toHaveLength(3)
  })

  it('persist=false never writes', () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')
    const { container } = render(
      <DesktopProvider initialSession={createSeedSession()} persist={false} storage={storage}>
        <MutateAndExpose />
      </DesktopProvider>,
    )
    const view = within(container)

    act(() => {
      view.getByRole('button', { name: 'mutate' }).click()
      view.getByRole('button', { name: 'flush' }).click()
      vi.advanceTimersByTime(DEFAULT_SAVE_DEBOUNCE_MS * 2)
    })

    expect(setItem).not.toHaveBeenCalled()
    expect(loadSession(storage)).toBeNull()
  })

  it('falls back to the seed session when saved data is corrupt', () => {
    const storage = memoryStorage()
    storage.setItem(SESSION_STORAGE_KEY, 'garbage')

    const { container } = render(
      <DesktopProvider persist storage={storage}>
        <Probe />
      </DesktopProvider>,
    )
    const view = within(container)

    expect(view.getByTestId('count').textContent).toBe('2')
    expect(view.getByTestId('focused').textContent).toBe('seed-files')
  })
})
