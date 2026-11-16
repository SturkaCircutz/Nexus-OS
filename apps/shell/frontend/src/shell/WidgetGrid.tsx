import { useEffect, useRef, useState } from 'react'
import { getApp, type AppId } from '@/apps/registry'
import {
  COLS,
  ROWS,
  SIZE_DIMS,
  fitGrid,
  fits,
  intersecting,
  offset,
  snapToCell,
  span,
  type GridGeometry,
  type Size,
  type Slot,
} from '@/wm/layout'
import { useDesktop, type AppInstance, type DesktopStore } from '@/wm/desktopStore'
import { useAgent } from './agent/agentStore'
import { useHostSlot } from './hostNodes'

// Stage padding on each side of the grid.
const STAGE_PAD = 24
// A press becomes a drag after this many screen pixels of travel.
const DRAG_THRESHOLD = 7

type PreviewKind = 'free' | 'swap' | 'blocked'

interface Preview {
  slot: Slot
  kind: PreviewKind
  size: Size
}

interface Dragging {
  id: string
  appId: AppId
  size: Size
  col: number
  row: number
  slotEl: HTMLElement
  home: string
  /** Pointer offset from the slot origin, in logical grid pixels. */
  grabX: number
  grabY: number
  startX: number
  startY: number
  pointerId: number
  moved: boolean
}

/**
 * Snap grid: every open app sits in cells the system picks. Drag a widget by any
 * blank part of its card — drop on a free cell to move it, on an equal-size widget
 * to swap, and the orb speaks when a drop doesn't fit. Cells only position things;
 * the apps themselves render in InstanceHost. Hover chips offer size, fullscreen,
 * minimize, close — the same store commands the agent speaks.
 */
export function WidgetGrid() {
  const { state, store } = useDesktop()
  const { store: agent } = useAgent()
  const { geo, resizing } = useGridGeometry()
  const { scale, cellW, cellH } = geo
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Dragging | null>(null)
  const previewRef = useRef<Preview | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // The drag handlers are native listeners attached once; they read the current
  // geometry through this ref instead of closing over a stale render's value.
  const geoRef = useRef(geo)
  useEffect(() => {
    geoRef.current = geo
  }, [geo])

  // Minimized apps leave the grid. A fullscreen app keeps its cell for when it returns.
  const shown = state.instances.filter((it) => it.mode !== 'minimized')
  const dragging = dragId !== null

  // Drag plumbing lives on native listeners: app content is portaled into the
  // slots, so React's synthetic events on a slot never see the app's presses.
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    /** What a drop at `slot` would do, given the desk right now. */
    const landKind = (size: Size, slot: Slot, draggedId: string): PreviewKind => {
      const others = store
        .getState()
        .instances.filter((i) => i.mode !== 'minimized' && !i.exiting && i.id !== draggedId)
      if (fits(others, size, slot)) return 'free'
      const hit = intersecting(others, size, slot)
      return hit.length === 1 && hit[0].size === size ? 'swap' : 'blocked'
    }

    const stopListeners = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
      window.removeEventListener('keydown', onKey)
    }

    const clearChrome = (drag: Dragging) => {
      drag.slotEl.removeAttribute('data-dragging')
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    function onDown(e: PointerEvent) {
      if (e.button !== 0 || dragRef.current) return
      const target = e.target instanceof Element ? e.target : null
      const slotEl = target?.closest<HTMLElement>('.nx-slot[data-grab]')
      if (!slotEl || !gridRef.current?.contains(slotEl)) return
      if (
        target?.closest(
          'button, a, input, textarea, select, label, [contenteditable="true"], [role="button"], [role="radio"], [role="switch"]',
        )
      )
        return
      const it = store.getState().instances.find((i) => i.id === slotEl.dataset.slot)
      if (!it || it.mode !== 'widget' || it.exiting) return
      const rect = slotEl.getBoundingClientRect()
      const s = geoRef.current.scale
      dragRef.current = {
        id: it.id,
        appId: it.appId,
        size: it.size,
        col: it.col,
        row: it.row,
        slotEl,
        home: slotEl.style.transform,
        grabX: (e.clientX - rect.left) / s,
        grabY: (e.clientY - rect.top) / s,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        moved: false,
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('blur', onUp)
      window.addEventListener('keydown', onKey)
    }

    function onMove(e: PointerEvent) {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return
      const { scale: s, cellW: cw, cellH: ch } = geoRef.current
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return
        drag.moved = true
        drag.slotEl.setAttribute('data-dragging', '')
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'grabbing'
        setDragId(drag.id)
      }
      // Carry the real card: the instance div rides inside the slot.
      const dx = (e.clientX - drag.startX) / s
      const dy = (e.clientY - drag.startY) / s
      drag.slotEl.style.transform = `translate(${offset(drag.col, cw) + dx}px, ${offset(drag.row, ch) + dy}px)`
      // Where would the card's origin land, in cells?
      const gridEl = gridRef.current
      if (!gridEl) return
      const gridRect = gridEl.getBoundingClientRect()
      const ox = (e.clientX - gridRect.left) / s - drag.grabX
      const oy = (e.clientY - gridRect.top) / s - drag.grabY
      const d = SIZE_DIMS[drag.size]
      const slot = snapToCell(ox, oy, d.w, d.h, cw, ch)
      const kind = landKind(drag.size, slot, drag.id)
      const cur = previewRef.current
      if (!cur || cur.slot.col !== slot.col || cur.slot.row !== slot.row || cur.kind !== kind) {
        const next: Preview = { slot, kind, size: drag.size }
        previewRef.current = next
        setPreview(next)
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(true)
    }

    function onUp(e: Event) {
      finish(e.type !== 'pointerup')
    }

    function finish(cancelled: boolean) {
      const drag = dragRef.current
      if (!drag) return
      dragRef.current = null
      stopListeners()
      clearChrome(drag)
      setDragId(null)
      const target = previewRef.current?.slot ?? null
      previewRef.current = null
      setPreview(null)
      if (!drag.moved) return
      const back = () => (drag.slotEl.style.transform = drag.home)
      if (cancelled || !target) return back()
      if (target.col === drag.col && target.row === drag.row) return back()
      const reply = store.move(drag.appId, target.col, target.row)
      const after = store.find(drag.appId)
      const ok = !!after && !after.exiting && (after.col !== drag.col || after.row !== drag.row)
      if (ok) {
        // The store write re-renders the slot at its new cell; the transition glides it in.
      } else {
        agent.say(reply)
        back()
      }
    }

    grid.addEventListener('pointerdown', onDown)
    return () => {
      grid.removeEventListener('pointerdown', onDown)
      stopListeners()
    }
  }, [store, agent])

  return (
    <div className="nx-grid-box" style={{ width: span(COLS, cellW) * scale, height: span(ROWS, cellH) * scale }}>
      <div
        className="nx-grid"
        ref={gridRef}
        data-resizing={resizing || undefined}
        style={{ width: span(COLS, cellW), height: span(ROWS, cellH), transform: `scale(${scale})` }}
      >
        {shown.map((it) => (
          <GridSlot key={it.id} instance={it} store={store} geo={geo} />
        ))}
        {dragging && preview && (
          <div
            className="nx-drop"
            data-kind={preview.kind}
            style={{
              width: span(SIZE_DIMS[preview.size].w, cellW),
              height: span(SIZE_DIMS[preview.size].h, cellH),
              transform: `translate(${offset(preview.slot.col, cellW)}px, ${offset(preview.slot.row, cellH)}px)`,
            }}
          />
        )}
      </div>
    </div>
  )
}

function GridSlot({ instance: it, store, geo }: { instance: AppInstance; store: DesktopStore; geo: GridGeometry }) {
  const d = SIZE_DIMS[it.size]
  const hosting = it.mode === 'widget'
  const hostRef = useHostSlot(it.id, 'grid')
  return (
    <section
      ref={hosting ? hostRef : undefined}
      className="nx-slot"
      data-slot={it.id}
      data-grab={hosting || undefined}
      aria-label={getApp(it.appId).label}
      aria-hidden={hosting ? undefined : true}
      style={{
        width: span(d.w, geo.cellW),
        height: span(d.h, geo.cellH),
        transform: `translate(${offset(it.col, geo.cellW)}px, ${offset(it.row, geo.cellH)}px)`,
      }}
    >
      {hosting && <SlotChips instance={it} store={store} />}
    </section>
  )
}

/** Hover controls for one widget: same commands, same replies, shell-owned chrome. */
function SlotChips({ instance: it, store }: { instance: AppInstance; store: DesktopStore }) {
  const app = getApp(it.appId)
  return (
    <div className="nx-slot-chips" role="toolbar" aria-label={`${app.label} controls`}>
      <button type="button" aria-label={`make ${app.label} smaller`} onClick={() => store.resize(it.appId, 'down')}>
        −
      </button>
      <button type="button" aria-label={`make ${app.label} bigger`} onClick={() => store.resize(it.appId, 'up')}>
        +
      </button>
      {app.fullscreen && (
        <button
          type="button"
          aria-label={it.mode === 'fullscreen' ? `leave ${app.label} fullscreen` : `${app.label} fullscreen`}
          onClick={() => (it.mode === 'fullscreen' ? store.exitFullscreen() : store.fullscreen(it.appId))}
        >
          {it.mode === 'fullscreen' ? 'v' : '^'}
        </button>
      )}
      <button type="button" aria-label={`minimize ${app.label}`} onClick={() => store.minimize(it.appId)}>
        _
      </button>
      <button type="button" aria-label={`close ${app.label}`} onClick={() => store.close(it.appId)}>
        x
      </button>
    </div>
  )
}

/** Room the chrome takes above and below the stage, from the theme tokens. */
function chromeRoom() {
  const css = getComputedStyle(document.documentElement)
  const top = parseFloat(css.getPropertyValue('--chrome-top')) || 40
  const bottom = parseFloat(css.getPropertyValue('--chrome-bottom')) || 72
  return top + bottom
}

/** The stage the grid may fill: the window minus the chrome and stage padding. */
function stageRoom() {
  return {
    width: window.innerWidth - STAGE_PAD * 2,
    height: window.innerHeight - chromeRoom() - STAGE_PAD * 2,
  }
}

// Slots glide when they move; during a live window resize that glide would make
// every card trail the edge, so it pauses until the resize settles.
const RESIZE_SETTLE = 150

/** Fits the grid to the window: zoom plus stretched cells (see fitGrid), live on resize. */
function useGridGeometry() {
  const [geo, setGeo] = useState<GridGeometry>(() => {
    const { width, height } = stageRoom()
    return fitGrid(width, height)
  })
  const [resizing, setResizing] = useState(false)
  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      const { width, height } = stageRoom()
      setGeo(fitGrid(width, height))
      setResizing(true)
      clearTimeout(settle)
      settle = setTimeout(() => setResizing(false), RESIZE_SETTLE)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      clearTimeout(settle)
    }
  }, [])
  return { geo, resizing }
}
