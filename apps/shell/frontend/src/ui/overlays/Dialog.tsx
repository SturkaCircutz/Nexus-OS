import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from '@/theme'
import { SHEET, useSprings, type SpringConfig } from '../motion/spring'
import { trapTabKey } from './trapTab'

// With reduced motion the dialog only fades, quickly.
const FADE: SpringConfig = { damping: 1, response: 0.15 }

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name of the dialog. */
  title: string
  /** What opened it: the dialog grows out of this and focus returns to it. */
  origin?: HTMLElement | null
  className?: string
  children?: ReactNode
}

/**
 * A modal surface: scrim, focus trap, `role="dialog"`, same-path exit. It grows
 * from whatever opened it and shrinks back, returning focus. The stage goes inert
 * around it (the overlay host's job, like Spotlight does).
 */
export function Dialog({ open, onClose, title, origin, className, children }: DialogProps) {
  const [present, setPresent] = useState(open)
  const reduced = useReducedMotion()
  const scrimRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const springs = useSprings({ p: 0 }, ({ p }) => {
    const panel = panelRef.current
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, p)))
    if (!panel) return
    panel.style.opacity = String(Math.max(0, Math.min(1, p * 1.6)))
    panel.style.transform = reduced ? '' : `scale(${0.5 + 0.5 * p})`
  }, 0.002)

  if (open && !present) setPresent(true)

  // Grow out of the origin on open, shrink back into it on close.
  useLayoutEffect(() => {
    if (!present) return
    const panel = panelRef.current
    if (open && panel) {
      returnFocus.current = (document.activeElement as HTMLElement | null) ?? origin ?? null
      const r = origin?.getBoundingClientRect()
      panel.style.transformOrigin = r
        ? `${r.left + r.width / 2 - panel.offsetLeft}px ${r.top + r.height / 2 - panel.offsetTop}px`
        : '50% 50%'
      panel.querySelector<HTMLElement>('input, button:not(:disabled), [tabindex="0"]')?.focus()
    }
    springs.to({ p: open ? 1 : 0 }, reduced ? FADE : SHEET, {
      onRest: open
        ? undefined
        : () => {
            setPresent(false)
            const back = returnFocus.current
            if (back?.isConnected) back.focus({ preventScroll: true })
          },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, present])

  if (!present) return null
  return (
    <div className={className ? `nx-dialog ${className}` : 'nx-dialog'} data-open={open || undefined}>
      <div ref={scrimRef} className="nx-dialog-scrim" aria-hidden="true" onPointerDown={onClose} style={{ opacity: 0 }} />
      <div
        ref={panelRef}
        className="nx-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ opacity: 0 }}
        inert={!open}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          } else if (e.key === 'Tab') {
            trapTabKey(e)
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
