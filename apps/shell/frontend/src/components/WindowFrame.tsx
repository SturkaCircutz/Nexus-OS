/**
 * Interactive window chrome (WM-B / Task B1).
 *
 * - Pointer down anywhere          -> focusApp
 * - Drag titlebar                  -> moveWindow on release (snapped, see below)
 * - Drag an edge/corner handle     -> moveWindow + resizeWindow on release
 * - Minimize / fullscreen / close  -> setMode / closeApp
 * - Double-click titlebar          -> toggle fullscreen
 *
 * Snapping on release (Task B2): dropping with the pointer on the left/right
 * canvas edge snaps to that half; the top edge goes fullscreen (the windowed
 * geometry is kept, so restore returns to it). Anywhere else snaps to the
 * grid. Hold Alt while releasing to place freely.
 *
 * While dragging, geometry is kept locally and only committed to the store on
 * release, so persistence/IPC sees one update per gesture rather than one per frame.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import type { DesktopGrid, WindowState } from '@/types/WindowState'
import { getAppDefinition } from '@/wm/appRegistry'
import { useDesktopStore } from '@/wm/DesktopStoreContext'
import {
  clampToCanvas,
  edgeZoneRect,
  getEdgeZone,
  snapRectToGrid,
  type EdgeZone,
  type Rect,
  type Size,
} from '@/wm/snap'

export const MIN_WINDOW_SIZE: Size = { width: 240, height: 160 }

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_DIRECTIONS: ResizeDirection[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface Gesture {
  kind: 'move' | 'resize'
  direction?: ResizeDirection
  startClientX: number
  startClientY: number
  startRect: Rect
  canvasLeft: number
  canvasTop: number
  /** Latest computed state; null until the pointer actually moves. */
  rect: Rect | null
  zone: EdgeZone | null
  free: boolean
}

interface WindowFrameProps {
  window: WindowState
  /** Size of the WorkspaceCanvas this frame is positioned in. */
  canvasSize: Size
  grid: DesktopGrid
  /** Called with the rect a release would commit, or null when nothing is pending. */
  onSnapPreview?: (rect: Rect | null) => void
}

function resizeRect(start: Rect, direction: ResizeDirection, dx: number, dy: number): Rect {
  let { x, y, width, height } = start
  if (direction.includes('e')) width = Math.max(MIN_WINDOW_SIZE.width, start.width + dx)
  if (direction.includes('s')) height = Math.max(MIN_WINDOW_SIZE.height, start.height + dy)
  if (direction.includes('w')) {
    width = Math.max(MIN_WINDOW_SIZE.width, start.width - dx)
    x = start.x + start.width - width
  }
  if (direction.includes('n')) {
    height = Math.max(MIN_WINDOW_SIZE.height, start.height - dy)
    y = start.y + start.height - height
  }
  if (y < 0) {
    height += y
    y = 0
  }
  return { x, y, width, height }
}

function PlaceholderContent({ appId }: { appId: string }) {
  return (
    <div className="nexus-app-placeholder">
      <p>No widget registered for</p>
      <code>{appId}</code>
    </div>
  )
}

export function WindowFrame({ window: win, canvasSize, grid, onSnapPreview }: WindowFrameProps) {
  const { focusApp, moveWindow, resizeWindow, setMode, closeApp } = useDesktopStore()
  const frameRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const [draft, setDraft] = useState<Rect | null>(null)

  const isFullscreen = win.mode === 'fullscreen'
  const app = getAppDefinition(win.appId)
  const Content = app?.Component

  const rect: Rect = isFullscreen
    ? { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }
    : (draft ?? { x: win.x, y: win.y, width: win.width, height: win.height })

  function snapTarget(g: Gesture): Rect | null {
    if (!g.rect) return null
    if (g.zone) return edgeZoneRect(g.zone, canvasSize)
    if (g.free) return null
    return snapRectToGrid(g.rect, canvasSize, grid, MIN_WINDOW_SIZE)
  }

  function startGesture(
    event: ReactPointerEvent<HTMLElement>,
    kind: Gesture['kind'],
    direction?: ResizeDirection,
  ) {
    if (event.button !== 0 || isFullscreen) return
    const canvasEl = frameRef.current?.offsetParent as HTMLElement | null
    const canvasBox = canvasEl?.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    gestureRef.current = {
      kind,
      direction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: { x: win.x, y: win.y, width: win.width, height: win.height },
      canvasLeft: canvasBox?.left ?? 0,
      canvasTop: canvasBox?.top ?? 0,
      rect: null,
      zone: null,
      free: event.altKey,
    }
  }

  function updateGesture(event: ReactPointerEvent<HTMLElement>) {
    const g = gestureRef.current
    if (!g) return
    const dx = event.clientX - g.startClientX
    const dy = event.clientY - g.startClientY
    if (!g.rect && Math.abs(dx) < 2 && Math.abs(dy) < 2) return

    g.free = event.altKey
    if (g.kind === 'move') {
      g.rect = clampToCanvas(
        { ...g.startRect, x: g.startRect.x + dx, y: g.startRect.y + dy },
        canvasSize,
      )
      g.zone = g.free
        ? null
        : getEdgeZone(
            { x: event.clientX - g.canvasLeft, y: event.clientY - g.canvasTop },
            canvasSize,
          )
    } else {
      g.rect = resizeRect(g.startRect, g.direction!, dx, dy)
      g.zone = null
    }
    setDraft(g.rect)
    onSnapPreview?.(snapTarget(g))
  }

  function endGesture(event: ReactPointerEvent<HTMLElement>, commit: boolean) {
    const g = gestureRef.current
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraft(null)
    onSnapPreview?.(null)
    if (!commit || !g || !g.rect) return

    g.free = event.altKey
    if (g.free) g.zone = null

    if (g.zone === 'top') {
      setMode(win.id, 'fullscreen')
      return
    }

    const target = snapTarget(g) ?? g.rect
    if (target.x !== win.x || target.y !== win.y) moveWindow(win.id, target.x, target.y)
    if (target.width !== win.width || target.height !== win.height) {
      resizeWindow(win.id, target.width, target.height)
    }
  }

  const gestureHandlers = {
    onPointerMove: updateGesture,
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => endGesture(e, true),
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => endGesture(e, false),
  }

  const stopDrag = (e: { stopPropagation(): void }) => e.stopPropagation()

  return (
    <div
      ref={frameRef}
      className={`nexus-window-frame${win.focused ? ' is-focused' : ''}${isFullscreen ? ' is-fullscreen' : ''}`}
      role="dialog"
      aria-label={win.title}
      data-window-id={win.id}
      data-mode={win.mode}
      data-focused={win.focused}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: win.zIndex,
      }}
      onPointerDownCapture={() => {
        if (!win.focused) focusApp(win.id)
      }}
    >
      <div
        className="nexus-window-titlebar"
        onPointerDown={(e) => startGesture(e, 'move')}
        onDoubleClick={() => setMode(win.id, isFullscreen ? 'windowed' : 'fullscreen')}
        {...gestureHandlers}
      >
        <span className="nexus-window-title">{win.title}</span>
        <div className="nexus-window-controls" onPointerDown={stopDrag} onDoubleClick={stopDrag}>
          <button
            type="button"
            className="nexus-window-button"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => setMode(win.id, 'minimized')}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 9h8" />
            </svg>
          </button>
          <button
            type="button"
            className="nexus-window-button"
            aria-label={isFullscreen ? 'Restore' : 'Fullscreen'}
            title={isFullscreen ? 'Restore' : 'Fullscreen'}
            onClick={() => setMode(win.id, isFullscreen ? 'windowed' : 'fullscreen')}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3.5 4.5h4v4h-4z M4.5 4.5V2.5h5v5h-2" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 2.5h7v7h-7z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="nexus-window-button is-close"
            aria-label="Close"
            title="Close"
            onClick={() => closeApp(win.id)}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="nexus-window-content">
        {Content ? <Content /> : <PlaceholderContent appId={win.appId} />}
      </div>

      {!isFullscreen &&
        RESIZE_DIRECTIONS.map((direction) => (
          <div
            key={direction}
            className={`nexus-resize-handle nexus-resize-${direction}`}
            data-resize={direction}
            onPointerDown={(e) => startGesture(e, 'resize', direction)}
            {...gestureHandlers}
          />
        ))}
    </div>
  )
}
