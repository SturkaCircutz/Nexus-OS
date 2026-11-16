import { useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react'

// The popover: a solid card that pops from its button (160ms from .96 scale), closes
// on Escape and outside clicks, and hands focus back. Never glass — a popover inside
// chrome is solid paper (glass never stacks).

export interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>
  onClick: () => void
  'aria-haspopup': 'true'
  'aria-expanded': boolean
  'aria-controls': string | undefined
}

export interface PopoverProps {
  /** Accessible name of the panel. */
  label: string
  /** Renders the trigger with the wiring it needs: spread the props on your button. */
  trigger: (props: PopoverTriggerProps) => ReactNode
  /** Panel content; receives close() when it's a function. */
  children: ReactNode | ((close: () => void) => ReactNode)
  /** Side of the trigger the panel attaches to. */
  align?: 'start' | 'end'
  className?: string
  panelClassName?: string
  panelProps?: HTMLAttributes<HTMLDivElement>
}

/**
 * Uncontrolled popover. Initial focus goes to the first focusable inside; closing
 * returns focus to the trigger.
 */
export function Popover({ label, trigger, children, align = 'end', className, panelClassName, panelProps }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) btnRef.current?.focus()
  }

  // Clicking anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus the first focusable when the panel opens.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('input, button:not(:disabled), [tabindex="0"]')?.focus()
  }, [open])

  return (
    <div className={cx('nx-pop', className)}>
      {trigger({
        ref: (el) => {
          btnRef.current = el
        },
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'true',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
      })}
      {open && (
        <div
          {...panelProps}
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          data-align={align}
          className={cx('nx-popover', panelClassName)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            }
          }}
        >
          {typeof children === 'function' ? children(() => close()) : children}
        </div>
      )}
    </div>
  )
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
