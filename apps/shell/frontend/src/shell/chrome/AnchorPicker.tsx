import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useAgent } from '../agent/agentStore'
import { anchorLabel, neighborAnchor, type Anchor } from '../agent/anchors'

// 3×3 picture of the screen. The middle row's sides have no anchor.
const CELLS: (Anchor | null)[] = [
  'top-left', 'top-center', 'top-right',
  null, 'center', null,
  'bottom-left', 'bottom-center', 'bottom-right',
]

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Menu bar control for where the avatar rests: a small ASCII map of the screen. */
export function AnchorPicker() {
  const { state, store } = useAgent()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<Anchor, HTMLButtonElement>())
  const panelId = useId()

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  // Focus the current position when the panel opens.
  useEffect(() => {
    if (open) cellRefs.current.get(state.anchor)?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Clicking anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (a: Anchor) => {
    store.setAnchor(a)
    cellRefs.current.get(a)?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    const dir = ARROWS[e.key]
    if (!dir) return
    e.preventDefault()
    pick(neighborAnchor(state.anchor, dir[0], dir[1]))
  }

  return (
    <div className="nx-picker-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="nx-menubar-btn nx-press"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        avatar
      </button>
      {open && (
        <div ref={panelRef} id={panelId} className="nx-picker" onKeyDown={onKeyDown}>
          <p className="nx-picker-title" id={`${panelId}-label`}>
            avatar rests at
          </p>
          <div className="nx-picker-grid" role="radiogroup" aria-labelledby={`${panelId}-label`}>
            {CELLS.map((a, i) =>
              a ? (
                <button
                  key={a}
                  ref={(el) => {
                    if (el) cellRefs.current.set(a, el)
                    else cellRefs.current.delete(a)
                  }}
                  type="button"
                  role="radio"
                  aria-checked={state.anchor === a}
                  aria-label={anchorLabel(a)}
                  tabIndex={state.anchor === a ? 0 : -1}
                  className="nx-picker-cell nx-press"
                  onClick={() => pick(a)}
                >
                  {state.anchor === a ? '[o]' : '[ ]'}
                </button>
              ) : (
                <span key={`gap-${i}`} className="nx-picker-gap" aria-hidden="true">
                  ·
                </span>
              ),
            )}
          </div>
          <p className="nx-picker-foot">{anchorLabel(state.anchor)}</p>
        </div>
      )}
    </div>
  )
}
