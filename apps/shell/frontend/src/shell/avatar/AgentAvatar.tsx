import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useReducedMotion } from '@/theme'
import { FLING, MOVE, project, rubberband, useSprings } from '@/ui'
import { useAgent } from '../agent/agentStore'
import { ANCHOR_CELL, anchorLabel, anchorPoint, nearestAnchor, neighborAnchor, safeBounds } from '../agent/anchors'
import { AgentBubble } from './AgentBubble'
import { AvatarArt } from './AvatarArt'

/** The avatar's square size in px. */
export const AVATAR_SIZE = 72
// Movement under this is a click, not a drag.
const DRAG_START = 10
// Release velocity is measured over the last stretch of the drag.
const VELOCITY_WINDOW = 80
// A release faster than this is a throw: it lands with a little bounce.
const FLING_SPEED = 300

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

type Sample = { t: number; x: number; y: number }

interface Drag {
  pointer: number
  // Grab offset inside the avatar, so it doesn't jump under the pointer.
  dx: number
  dy: number
  startX: number
  startY: number
  moved: boolean
  wasMoving: boolean
  samples: Sample[]
}

/**
 * The agent's body. Click it to ask; drag or flick it and it carries its momentum to the
 * resting spot it was thrown toward. Arrow keys move it between spots too.
 */
export function AgentAvatar({ onOpen }: { onOpen: (origin: HTMLElement) => void }) {
  const { state, store } = useAgent()
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const swallowClick = useRef(false)
  // Set when a throw already started the flight to this anchor.
  const landing = useRef<string | null>(null)
  const mounted = useRef(false)

  const springs = useSprings(anchorPoint(state.anchor, AVATAR_SIZE), ({ x, y }) => {
    if (wrapRef.current) wrapRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
  })

  // Travel to the anchor whenever it changes (picker, command, arrow keys).
  useLayoutEffect(() => {
    const target = anchorPoint(state.anchor, AVATAR_SIZE)
    if (!mounted.current) {
      mounted.current = true
      springs.set(target)
      return
    }
    if (landing.current === state.anchor) {
      landing.current = null
      return
    }
    if (reduced) {
      springs.set(target)
      wrapRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
    } else springs.to(target, MOVE)
  }, [state.anchor, reduced, springs])

  // Stay on the anchor when the window changes size.
  useEffect(() => {
    const onResize = () => {
      if (!drag.current) springs.set(anchorPoint(store.getState().anchor, AVATAR_SIZE))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [springs, store])

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const wasMoving = springs.moving
    springs.stop()
    const { x, y } = springs.values()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      pointer: e.pointerId,
      dx: e.clientX - x,
      dy: e.clientY - y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      wasMoving,
      samples: [{ t: e.timeStamp, x, y }],
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_START) return
      d.moved = true
      wrapRef.current?.setAttribute('data-dragging', '')
    }
    // Follow the pointer 1:1, with growing resistance past the edges.
    const b = safeBounds()
    const x = resist(e.clientX - d.dx, b.left, b.right - AVATAR_SIZE, window.innerWidth)
    const y = resist(e.clientY - d.dy, b.top, b.bottom - AVATAR_SIZE, window.innerHeight)
    springs.set({ x, y })
    d.samples.push({ t: e.timeStamp, x, y })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW) d.samples.shift()
  }

  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    drag.current = null
    wrapRef.current?.removeAttribute('data-dragging')

    if (!d.moved) {
      // Tapping it mid-flight catches it; let it carry on to where it was going.
      if (d.wasMoving || cancelled) {
        swallowClick.current = !cancelled
        springs.to(anchorPoint(state.anchor, AVATAR_SIZE), MOVE)
      }
      return
    }
    swallowClick.current = !cancelled

    const { vx, vy } = releaseVelocity(d.samples, e.timeStamp)
    const here = springs.values()
    const anchor = nearestAnchor({ x: here.x + project(vx), y: here.y + project(vy) }, AVATAR_SIZE)
    const target = anchorPoint(anchor, AVATAR_SIZE)

    if (reduced) {
      springs.set(target)
      wrapRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
    } else {
      const fast = Math.hypot(vx, vy) > FLING_SPEED
      springs.to(target, fast ? FLING : MOVE, { velocity: { x: vx, y: vy } })
    }
    if (anchor !== state.anchor) {
      landing.current = anchor
      store.setAnchor(anchor)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = ARROWS[e.key]
    if (!dir) return
    e.preventDefault()
    store.setAnchor(neighborAnchor(state.anchor, dir[0], dir[1]))
  }

  const [col, row] = ANCHOR_CELL[state.anchor]
  return (
    <div
      ref={wrapRef}
      className="nx-agent"
      data-anchor={state.anchor}
      data-status={state.status}
      data-h={col === 0 ? 'start' : col === 2 ? 'end' : 'mid'}
      data-v={row === 2 ? 'above' : 'below'}
    >
      <button
        type="button"
        className="nx-avatar nx-glass"
        aria-label={`Nexus, ${anchorLabel(state.anchor)}. Click to ask; arrow keys move it.`}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
        onClick={(e) => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          onOpen(e.currentTarget)
        }}
        onKeyDown={onKeyDown}
      >
        <AvatarArt status={state.status} reduced={reduced} />
      </button>
      <AgentBubble reply={state.reply} replyId={state.replyId} error={state.replyError} reduced={reduced} />
    </div>
  )
}

/** Clamps softly: inside [min, max] moves 1:1, past it rubber-bands. */
function resist(v: number, min: number, max: number, dim: number) {
  if (v < min) return min - rubberband(min - v, dim)
  if (v > max) return max + rubberband(v - max, dim)
  return v
}

/** px/s over the last samples. A pause before letting go means no throw. */
function releaseVelocity(samples: Sample[], now: number) {
  const last = samples[samples.length - 1]
  const first = samples[0]
  const dt = (last.t - first.t) / 1000
  if (dt <= 0.008 || now - last.t > VELOCITY_WINDOW) return { vx: 0, vy: 0 }
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt }
}
