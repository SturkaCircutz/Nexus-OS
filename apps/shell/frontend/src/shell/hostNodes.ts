// Every open app renders once, into its own detached <div> (see InstanceHost).
// Containers (a grid cell, the fullscreen panel, the hidden keep-alive box) claim that
// div with `useHostSlot`. Moving the div between containers keeps the app's React state,
// so minimizing or going fullscreen never remounts it.
//
// Moves between containers fly with a spring: we remember each div's on-screen rect just
// before every store change, then animate from that rect to the new one (FLIP).

import { useCallback } from 'react'
import { MOVE, Springs } from '@/ui'

/** Which container holds an instance: a grid cell, fullscreen, or minimized (hidden). */
export type HostKind = 'grid' | 'full' | 'away'

type Rect = { x: number; y: number; w: number; h: number }
type Channel = keyof Rect

const nodes = new Map<string, HTMLDivElement>()
const where = new Map<string, HostKind>()
const lastRects = new Map<string, Rect>()
const chipRects = new Map<string, Rect>()
const flights = new Map<string, Springs<Channel>>()
let flightLayer: HTMLElement | null = null
let lastFocus: { id: string; el: HTMLElement } | null = null

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height })

/** The stable div an instance renders into. */
export function hostNode(id: string) {
  let node = nodes.get(id)
  if (!node) {
    node = document.createElement('div')
    node.className = 'nx-instance'
    nodes.set(id, node)
  }
  return node
}

const FOCUSABLE = 'textarea, input, select, button, [href], [tabindex]:not([tabindex="-1"])'

/** Where keyboard focus goes inside an app: its first control, else the app itself. */
export function focusTarget(id: string): HTMLElement | null {
  const node = nodes.get(id)
  if (!node) return null
  return node.querySelector<HTMLElement>(FOCUSABLE) ?? node.querySelector<HTMLElement>('.nx-instance-inner')
}

const dockChip = (id: string) => document.querySelector<HTMLElement>(`[data-dock-chip="${CSS.escape(id)}"]`)

/** Forgets an instance once it has left the desktop. */
export function releaseHostNode(id: string) {
  flights.get(id)?.stop()
  nodes.get(id)?.remove()
  for (const map of [nodes, where, lastRects, chipRects, flights]) map.delete(id)
}

export function setFlightLayer(el: HTMLElement | null) {
  flightLayer = el
}

/**
 * Remembers where every app and dock chip is on screen. Runs synchronously on each
 * store change, before React moves anything, so flights start from the true position
 * (including mid-flight).
 */
export function captureRects() {
  // React may remove the old container (and blur the app) before the new one claims it,
  // so note who has focus now, while it's still inside.
  lastFocus = null
  const active = document.activeElement
  for (const [id, node] of nodes) {
    if (active instanceof HTMLElement && node.contains(active)) lastFocus = { id, el: active }
    if (!node.isConnected) continue
    const r = node.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) lastRects.set(id, toRect(r))
  }
  document.querySelectorAll<HTMLElement>('[data-dock-chip]').forEach((el) => {
    chipRects.set(el.dataset.dockChip!, toRect(el.getBoundingClientRect()))
  })
}

/** Ref callback that puts the instance's div inside this element. */
export function useHostSlot(id: string, kind: HostKind) {
  return useCallback((el: HTMLElement | null) => {
    if (el) attach(id, el, kind)
  }, [id, kind])
}

function attach(id: string, container: HTMLElement, kind: HostKind) {
  const node = hostNode(id)
  const prev = where.get(id)
  // StrictMode re-runs ref callbacks; nothing to do if it's already here.
  if (prev === kind && node.parentElement === container) return
  where.set(id, kind)

  const old = flights.get(id)
  const velocity = old?.velocities()
  old?.stop()
  flights.delete(id)
  resetFlight(node)

  // Moving a div drops focus inside it, so remember who had it.
  const active = document.activeElement
  const lostFocus = (!active || active === document.body) && lastFocus?.id === id ? lastFocus.el : null
  const hadFocus = active instanceof HTMLElement && node.contains(active) ? active : lostFocus
  if (lastFocus?.id === id) lastFocus = null

  const moved = prev !== undefined && prev !== kind
  if (kind === 'away') {
    const from = lastRects.get(id)
    if (moved && from && flightLayer && !reducedMotion()) flyToDock(id, node, from, container, velocity)
    else container.appendChild(node)
    // Focus follows the app into the dock, to its chip.
    if (hadFocus) requestAnimationFrame(() => dockChip(id)?.focus({ preventScroll: true }))
    return
  }

  container.appendChild(node)
  hadFocus?.focus({ preventScroll: true })
  // Restored from the dock: its chip is gone, so focus comes back with the app.
  if (prev === 'away') {
    requestAnimationFrame(() => {
      const now = document.activeElement
      if (!now || now === document.body || (now instanceof HTMLElement && now.dataset.dockChip)) {
        focusTarget(id)?.focus({ preventScroll: true })
      }
    })
  }
  if (!moved) return
  if (reducedMotion()) {
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
    return
  }
  // Restoring from the dock starts at the dock chip; everything else from its last rect.
  const from = prev === 'away' ? chipRects.get(id) ?? dockFallback() : lastRects.get(id)
  if (from) flip(id, node, from, prev === 'away', velocity)
}

/** Animates `node` from `from` into wherever it now sits. */
function flip(id: string, node: HTMLDivElement, from: Rect, fadeIn: boolean, velocity?: Record<Channel, number>) {
  const to = toRect(node.getBoundingClientRect())
  if (!to.w || !to.h) return
  // The grid may be scaled to fit; translate in the container's own units.
  const k = to.w / (node.offsetWidth || to.w)
  const host = node.parentElement
  if (host) host.style.zIndex = '5'
  node.style.transformOrigin = '0 0'

  const springs = new Springs<Channel>(from, (v) => {
    node.style.transform = `translate(${(v.x - to.x) / k}px, ${(v.y - to.y) / k}px) scale(${v.w / to.w}, ${v.h / to.h})`
  })
  flights.set(id, springs)
  springs.to(to, MOVE, {
    velocity,
    onRest: () => {
      resetFlight(node)
      if (host) host.style.zIndex = ''
      flights.delete(id)
    },
  })
  if (fadeIn) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
}

/** Minimizing: the app shrinks into its dock chip, then waits in the hidden container. */
function flyToDock(
  id: string,
  node: HTMLDivElement,
  from: Rect,
  away: HTMLElement,
  velocity?: Record<Channel, number>,
) {
  Object.assign(node.style, {
    position: 'fixed',
    left: `${from.x}px`,
    top: `${from.y}px`,
    width: `${from.w}px`,
    height: `${from.h}px`,
    transformOrigin: '0 0',
  })
  flightLayer!.appendChild(node)

  // The dock slides in while we fly, so follow the chip every frame.
  const target = (): Rect => {
    const chip = dockChip(id)
    return chip ? toRect(chip.getBoundingClientRect()) : dockFallback()
  }
  const springs = new Springs<Channel>(from, (v) => {
    node.style.transform = `translate(${v.x - from.x}px, ${v.y - from.y}px) scale(${v.w / from.w}, ${v.h / from.h})`
  })
  flights.set(id, springs)
  const fade = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: 'ease-in', fill: 'forwards' })
  springs.to(target(), MOVE, {
    velocity,
    retarget: target,
    onRest: () => {
      fade.cancel()
      resetFlight(node)
      flights.delete(id)
      if (where.get(id) === 'away') away.appendChild(node)
    },
  })
}

function resetFlight(node: HTMLDivElement) {
  node.getAnimations().forEach((a) => a.cancel())
  for (const prop of ['position', 'left', 'top', 'width', 'height', 'transform', 'transformOrigin'] as const) {
    node.style[prop] = ''
  }
}

/** Where the dock sits when it isn't on screen: a small spot at the bottom centre. */
function dockFallback(): Rect {
  return { x: window.innerWidth / 2 - 48, y: window.innerHeight - 50, w: 96, h: 34 }
}
