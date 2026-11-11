/**
 * The desktop surface (WM-B / Task B3). Renders every non-minimized window in
 * the active workspace, plus the snap preview and a grid overlay while a
 * window is being dragged. Reads everything through useDesktopStore(), so it
 * works unchanged with the mock or the real provider.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

import { SnapPreview } from '@/components/SnapPreview'
import { WindowFrame } from '@/components/WindowFrame'
import { useDesktopStore } from '@/wm/DesktopStoreContext'
import type { Rect, Size } from '@/wm/snap'

interface WorkspaceCanvasProps {
  /** Reports the canvas size whenever it changes (used by the taskbar's arrange buttons). */
  onSizeChange?: (size: Size) => void
}

export function WorkspaceCanvas({ onSizeChange }: WorkspaceCanvasProps) {
  const { windows, activeWorkspaceId, grid } = useDesktopStore()
  const canvasRef = useRef<HTMLElement>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  const [preview, setPreview] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const measure = () => {
      const next = { width: el.clientWidth, height: el.clientHeight }
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    onSizeChange?.(size)
  }, [size, onSizeChange])

  const handlePreview = useCallback((rect: Rect | null) => setPreview(rect), [])

  const visible = windows.filter(
    (w) => w.workspaceId === activeWorkspaceId && w.mode !== 'minimized',
  )

  const style = {
    '--nexus-grid-cols': grid.cols,
    '--nexus-grid-rows': grid.rows,
  } as CSSProperties

  return (
    <main
      ref={canvasRef}
      className={`nexus-canvas${preview ? ' is-dragging' : ''}`}
      data-workspace={activeWorkspaceId}
      style={style}
    >
      {size.width > 0 &&
        size.height > 0 &&
        visible.map((w) => (
          <WindowFrame
            key={w.id}
            window={w}
            canvasSize={size}
            grid={grid}
            onSnapPreview={handlePreview}
          />
        ))}
      {preview && <SnapPreview {...preview} />}
      {visible.length === 0 && (
        <div className="empty-state">No open windows on this workspace. Launch an app from the taskbar.</div>
      )}
    </main>
  )
}
