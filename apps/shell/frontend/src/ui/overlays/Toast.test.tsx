import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createToastStore, DUR, ToastHost } from '@/ui'

describe('createToastStore', () => {
  it('hands out notices with distinct ids and notifies subscribers', () => {
    const store = createToastStore()
    const seen: number[] = []
    store.subscribe(() => seen.push(store.getState().length))
    act(() => store.show('saved'))
    act(() => store.show('saved'))
    expect(store.getState().map((n) => n.text)).toEqual(['saved', 'saved'])
    expect(store.getState()[0].id).not.toBe(store.getState()[1].id)
    expect(seen).toEqual([1, 2])
  })

  it('carries error and timing options', () => {
    const store = createToastStore()
    store.show('nope', { error: true, timeoutMs: 500 })
    expect(store.getState()[0]).toMatchObject({ error: true, timeoutMs: 500 })
  })

  it('dismisses by id', () => {
    const store = createToastStore()
    store.show('one')
    store.show('two')
    store.dismiss(store.getState()[0].id)
    expect(store.getState().map((n) => n.text)).toEqual(['two'])
  })
})

describe('<ToastHost>', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // The toast <p> shares its text with the sr-only live region, so query by class.
  const toast = () => document.querySelector('.nx-toast')

  it('renders nothing while empty', () => {
    const store = createToastStore()
    render(<ToastHost store={store} />)
    expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull()
  })

  it('types a notice in, holds it, then dismisses it', () => {
    const store = createToastStore()
    render(<ToastHost store={store} />)
    act(() => store.show('saved', { timeoutMs: 100 }))

    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument()
    expect(toast()).toHaveClass('nx-toast')

    // The dismissal is a timer chain: type in (DUR.pop/2 per char) → stay → leave.
    const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))
    for (let i = 0; i < 5; i++) tick(DUR.pop / 2)
    expect(toast()).not.toHaveAttribute('data-leaving')
    tick(100) // the stay expires
    expect(toast()).toHaveAttribute('data-leaving', 'true')
    tick(DUR.toast) // the leave ends
    expect(toast()).toBeNull()
  })

  it('marks failures without a second colour', () => {
    const store = createToastStore()
    render(<ToastHost store={store} />)
    act(() => store.show('nope', { error: true, timeoutMs: 100 }))
    expect(toast()).toHaveClass('nx-toast--error')
    expect(document.querySelector('.nx-toast-mark')?.textContent).toBe('x ')
  })

  it('stays while someone is reading it', () => {
    const store = createToastStore()
    render(<ToastHost store={store} />)
    act(() => store.show('saved', { timeoutMs: 100 }))
    const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))
    for (let i = 0; i < 5; i++) tick(DUR.pop / 2)
    fireEvent.pointerEnter(toast()!)
    tick(2000) // the stay would have expired long ago
    expect(toast()).not.toBeNull()
    fireEvent.pointerLeave(toast()!)
    tick(100) // the stay expires
    tick(DUR.toast)
    expect(toast()).toBeNull()
  })

  it('announces the full text politely for screen readers', () => {
    const store = createToastStore()
    render(<ToastHost store={store} />)
    act(() => store.show('saved'))
    expect(screen.getByText('saved', { selector: '.sr-only' })).toBeInTheDocument()
    store.dismiss(store.getState()[0].id)
  })
})
