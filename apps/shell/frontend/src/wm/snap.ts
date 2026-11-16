/**
 * Pure window-geometry helpers for the internal window manager (WM-B / Task B2).
 *
 * Everything here is numbers in, numbers out: no React, no store, no DOM.
 * All coordinates are canvas-relative pixels (0,0 = top-left of WorkspaceCanvas).
 *
 * Examples (canvas 1200x800, grid 12x8 -> each cell is 100x100):
 *   pixelToGrid({ x: 140, y: 260, width: 410, height: 290 }, canvas, grid)
 *     -> { gridCol: 1, gridRow: 3, gridW: 4, gridH: 3 }
 *   gridToPixel({ gridCol: 1, gridRow: 3, gridW: 4, gridH: 3 }, canvas, grid)
 *     -> { x: 100, y: 300, width: 400, height: 300 }
 *   getEdgeZone({ x: 4, y: 400 }, canvas)    -> 'left'
 *   edgeZoneRect('left', canvas)             -> { x: 0, y: 0, width: 600, height: 800 }
 */

import type { DesktopGrid, WindowState } from '@/types/WindowState'
import type { ArrangePreset } from '@/wm/DesktopStoreAPI'

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface GridCell {
  gridCol: number
  gridRow: number
  gridW: number
  gridH: number
}

/** Half-screen left/right, or maximize when dropped on the top edge. */
export type EdgeZone = 'left' | 'right' | 'top'

export const DEFAULT_GRID: DesktopGrid = { cols: 12, rows: 8 }

/** Distance (px) from a canvas edge at which a dragged window triggers an edge snap. */
export const EDGE_SNAP_THRESHOLD = 16

/** Offset (px) between successive windows in the cascade preset. */
export const CASCADE_STEP = 32

/** Fraction of the canvas each window takes in the cascade preset. */
export const CASCADE_SIZE_RATIO = 0.6

/** How much of a window must stay on the canvas so it can always be grabbed again. */
export const KEEP_VISIBLE: Size = { width: 80, height: 32 }

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function hasArea(size: Size): boolean {
  return size.width > 0 && size.height > 0
}

export function cellSize(canvas: Size, grid: DesktopGrid = DEFAULT_GRID): Size {
  return { width: canvas.width / grid.cols, height: canvas.height / grid.rows }
}

/**
 * Nearest grid cell span for a pixel rect. The span is at least 1x1 (or enough
 * cells to cover `minSize`) and always fits inside the grid.
 */
export function pixelToGrid(
  rect: Rect,
  canvas: Size,
  grid: DesktopGrid = DEFAULT_GRID,
  minSize: Size = { width: 0, height: 0 },
): GridCell {
  const cell = cellSize(canvas, grid)
  const minW = Math.max(1, Math.ceil(minSize.width / cell.width - 1e-9))
  const minH = Math.max(1, Math.ceil(minSize.height / cell.height - 1e-9))
  const gridW = clamp(Math.round(rect.width / cell.width), minW, grid.cols)
  const gridH = clamp(Math.round(rect.height / cell.height), minH, grid.rows)
  const gridCol = clamp(Math.round(rect.x / cell.width), 0, grid.cols - gridW)
  const gridRow = clamp(Math.round(rect.y / cell.height), 0, grid.rows - gridH)
  return { gridCol, gridRow, gridW, gridH }
}

/** Pixel rect for a grid span. Edges are rounded so adjacent spans never leave gaps. */
export function gridToPixel(
  cell: GridCell,
  canvas: Size,
  grid: DesktopGrid = DEFAULT_GRID,
): Rect {
  const size = cellSize(canvas, grid)
  const left = Math.round(cell.gridCol * size.width)
  const top = Math.round(cell.gridRow * size.height)
  const right = Math.round((cell.gridCol + cell.gridW) * size.width)
  const bottom = Math.round((cell.gridRow + cell.gridH) * size.height)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Snap a rect's position and size to the nearest grid cells. No-op on an empty canvas. */
export function snapRectToGrid(
  rect: Rect,
  canvas: Size,
  grid: DesktopGrid = DEFAULT_GRID,
  minSize?: Size,
): Rect {
  if (!hasArea(canvas)) return { ...rect }
  return gridToPixel(pixelToGrid(rect, canvas, grid, minSize), canvas, grid)
}

/**
 * Which edge zone (if any) a pointer is in. `point` is canvas-relative and may be
 * outside the canvas (e.g. dragged up over the header), which still counts.
 * Left/right take priority over top so the top corners give half-screen snaps.
 */
export function getEdgeZone(
  point: Point,
  canvas: Size,
  threshold: number = EDGE_SNAP_THRESHOLD,
): EdgeZone | null {
  if (!hasArea(canvas)) return null
  if (point.x <= threshold) return 'left'
  if (point.x >= canvas.width - threshold) return 'right'
  if (point.y <= threshold) return 'top'
  return null
}

/** Target rect for an edge zone. */
export function edgeZoneRect(zone: EdgeZone, canvas: Size): Rect {
  const half = Math.floor(canvas.width / 2)
  switch (zone) {
    case 'left':
      return { x: 0, y: 0, width: half, height: canvas.height }
    case 'right':
      return { x: half, y: 0, width: canvas.width - half, height: canvas.height }
    case 'top':
      return { x: 0, y: 0, width: canvas.width, height: canvas.height }
  }
}

/**
 * Keep enough of a window on the canvas that its titlebar can still be grabbed.
 * The titlebar is never allowed above the canvas top.
 */
export function clampToCanvas(
  rect: Rect,
  canvas: Size,
  keepVisible: Size = KEEP_VISIBLE,
): Rect {
  if (!hasArea(canvas)) return { ...rect }
  const keepW = Math.min(keepVisible.width, rect.width)
  return {
    ...rect,
    x: clamp(rect.x, keepW - rect.width, canvas.width - keepW),
    y: clamp(rect.y, 0, canvas.height - keepVisible.height),
  }
}

function cascadeLayout(count: number, canvas: Size): Rect[] {
  const width = Math.round(canvas.width * CASCADE_SIZE_RATIO)
  const height = Math.round(canvas.height * CASCADE_SIZE_RATIO)
  const room = Math.min(canvas.width - width, canvas.height - height)
  const steps = Math.max(1, Math.floor(room / CASCADE_STEP) + 1)
  return Array.from({ length: count }, (_, i) => {
    const offset = (i % steps) * CASCADE_STEP
    return { x: offset, y: offset, width, height }
  })
}

/**
 * Near-square tiling: cols = ceil(sqrt(n)). A short last row stretches its
 * windows to fill the full width, so the canvas is always fully covered.
 */
function tileLayout(count: number, canvas: Size): Rect[] {
  if (count === 0) return []
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const rects: Rect[] = []
  for (let row = 0; row < rows; row++) {
    const inRow = row < rows - 1 ? cols : count - cols * (rows - 1)
    const top = Math.round((row * canvas.height) / rows)
    const bottom = Math.round(((row + 1) * canvas.height) / rows)
    for (let col = 0; col < inRow; col++) {
      const left = Math.round((col * canvas.width) / inRow)
      const right = Math.round(((col + 1) * canvas.width) / inRow)
      rects.push({ x: left, y: top, width: right - left, height: bottom - top })
    }
  }
  return rects
}

/**
 * Compute new geometry for an arrange preset. Returns a new array the same
 * length and order as `windows`; only windowed (not minimized/fullscreen) windows
 * in `workspaceId` (or all workspaces when omitted) are moved.
 *
 * - cascade: back-to-front by zIndex, each 60% of the canvas, offset 32px.
 * - tile: in the given array order, near-square grid covering the canvas.
 * - snap-all-to-grid: each window snapped to its nearest grid span.
 */
export function computeArrangement(
  windows: WindowState[],
  preset: ArrangePreset,
  canvas: Size,
  grid: DesktopGrid = DEFAULT_GRID,
  workspaceId?: string,
): WindowState[] {
  if (!hasArea(canvas)) return windows.map((w) => ({ ...w }))

  const targets = windows.filter(
    (w) =>
      w.mode === 'windowed' &&
      (workspaceId === undefined || w.workspaceId === workspaceId),
  )

  const placed = new Map<string, Rect>()
  if (preset === 'cascade') {
    const ordered = [...targets].sort((a, b) => a.zIndex - b.zIndex)
    cascadeLayout(ordered.length, canvas).forEach((rect, i) =>
      placed.set(ordered[i].id, rect),
    )
  } else if (preset === 'tile') {
    tileLayout(targets.length, canvas).forEach((rect, i) =>
      placed.set(targets[i].id, rect),
    )
  } else {
    for (const w of targets) placed.set(w.id, snapRectToGrid(w, canvas, grid))
  }

  return windows.map((w) => {
    const rect = placed.get(w.id)
    return rect ? { ...w, ...rect } : { ...w }
  })
}

/** True when two rects have identical geometry. */
export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
