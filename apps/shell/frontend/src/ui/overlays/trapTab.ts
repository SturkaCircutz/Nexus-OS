import type { KeyboardEvent } from 'react'

/** Keeps Tab inside `container` while it's open (Spotlight's rule, generalized). */
export function trapTabKey(e: KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled), [tabindex="0"]')]
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
