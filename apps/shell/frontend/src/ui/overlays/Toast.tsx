import { useEffect, useState, useSyncExternalStore } from 'react'
import { DUR } from '../tokens/motion'
import { Mono } from '../components/Text'

// Toasts: brief notices stacked below the menu bar. Generalizes the agent bubble's
// timing: they type in, stay, and stay longer while hovered. Errors get an ink edge
// and a bold mono `x` — no second color (the One-Accent rule).

export interface Notice {
  /** A distinct id so repeated notices retype instead of glitching. */
  id: number
  text: string
  error?: boolean
  /** Overrides the default 6s stay. */
  timeoutMs?: number
}

export interface ToastStore {
  getState: () => Notice[]
  subscribe: (listener: () => void) => () => void
  /** Shows a notice; pass `error: true` for failures. */
  show: (text: string, opts?: { error?: boolean; timeoutMs?: number }) => void
  dismiss: (id: number) => void
}

/** A tiny external toast store, same pattern as the desktop and agent stores. */
export function createToastStore(): ToastStore {
  let state: Notice[] = []
  const listeners = new Set<() => void>()
  let nextId = 1

  const set = (next: Notice[]) => {
    state = next
    listeners.forEach((l) => l())
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    show: (text, opts = {}) => {
      const notice: Notice = { id: nextId++, text, error: opts.error, timeoutMs: opts.timeoutMs }
      set([...state, notice])
    },
    dismiss: (id) => set(state.filter((n) => n.id !== id)),
  }
}

/** Reads the store from React. */
export function useToasts(store: ToastStore): Notice[] {
  return useSyncExternalStore(store.subscribe, store.getState)
}

export interface ToastHostProps {
  store: ToastStore
  className?: string
}

/** Renders the stack. Mount it once, near the top of the app. */
export function ToastHost({ store, className }: ToastHostProps) {
  const notices = useToasts(store)
  if (!notices.length) return null
  return (
    <div className={className ?? 'nx-toasts'} role="region" aria-label="Notifications">
      {notices.map((n) => (
        <Toast key={n.id} notice={n} onDismiss={() => store.dismiss(n.id)} />
      ))}
    </div>
  )
}

/** One notice. Useful for custom hosts; most callers use ToastHost. */
export function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [shown, setShown] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [held, setHeld] = useState(false)
  const done = shown >= notice.text.length

  useEffect(() => {
    if (done) return
    const id = window.setTimeout(() => setShown((n) => n + 1), DUR.pop / 2)
    return () => window.clearTimeout(id)
  }, [done, shown])

  // Once fully shown, it leaves after a while unless someone is reading it.
  useEffect(() => {
    if (!done || held) return
    const id = window.setTimeout(() => setLeaving(true), notice.timeoutMs ?? 6000)
    return () => window.clearTimeout(id)
  }, [done, held, notice.timeoutMs])

  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(onDismiss, DUR.toast)
    return () => window.clearTimeout(id)
  }, [leaving, onDismiss])

  return (
    <>
      <Mono
        as="p"
        className={notice.error ? 'nx-toast nx-toast--error' : 'nx-toast'}
        data-leaving={leaving || undefined}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
      >
        {notice.error && <span className="nx-toast-mark">x </span>}
        {notice.text.slice(0, shown)}
        <span className="nx-toast-rest">{notice.text.slice(shown)}</span>
      </Mono>
      <p className="sr-only" aria-live="polite">
        {notice.text}
      </p>
    </>
  )
}
