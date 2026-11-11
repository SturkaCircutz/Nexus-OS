// Fixed widget grid. Widgets never move freely: the system places them in cells.

export const COLS = 6
export const ROWS = 4
export const CELL = 160
export const GAP = 16

/** Widget footprint in cells, written columns x rows. */
export type Size = '1x1' | '2x1' | '1x2' | '2x2' | '4x2'
/** Smallest to largest. */
export const SIZE_ORDER: Size[] = ['1x1', '2x1', '1x2', '2x2', '4x2']
export const SIZE_DIMS: Record<Size, { w: number; h: number }> = {
  '1x1': { w: 1, h: 1 },
  '2x1': { w: 2, h: 1 },
  '1x2': { w: 1, h: 2 },
  '2x2': { w: 2, h: 2 },
  '4x2': { w: 4, h: 2 },
}

export const isSize = (v: unknown): v is Size => typeof v === 'string' && v in SIZE_DIMS

export interface Slot {
  col: number
  row: number
}

export interface Placement extends Slot {
  id: string
  size: Size
}

/** Pixel length of a span of cells. */
export const span = (cells: number) => cells * CELL + (cells - 1) * GAP
/** Pixel offset of a cell index. */
export const offset = (index: number) => index * (CELL + GAP)

export const GRID_W = span(COLS)
export const GRID_H = span(ROWS)

function occupancy(items: Placement[], excludeId?: string) {
  const grid = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false))
  for (const it of items) {
    if (it.id === excludeId) continue
    const d = SIZE_DIMS[it.size]
    for (let r = it.row; r < Math.min(ROWS, it.row + d.h); r++)
      for (let c = it.col; c < Math.min(COLS, it.col + d.w); c++) grid[r][c] = true
  }
  return grid
}

export function fits(items: Placement[], size: Size, slot: Slot, excludeId?: string) {
  const d = SIZE_DIMS[size]
  if (slot.col < 0 || slot.row < 0 || slot.col + d.w > COLS || slot.row + d.h > ROWS) return false
  const grid = occupancy(items, excludeId)
  for (let r = slot.row; r < slot.row + d.h; r++)
    for (let c = slot.col; c < slot.col + d.w; c++) if (grid[r][c]) return false
  return true
}

/** First free slot in reading order, trying `prefer` first. */
export function findSlot(items: Placement[], size: Size, excludeId?: string, prefer?: Slot): Slot | null {
  if (prefer && fits(items, size, prefer, excludeId)) return { col: prefer.col, row: prefer.row }
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) if (fits(items, size, { col, row }, excludeId)) return { col, row }
  return null
}

/** Re-places every item, biggest first. Returns null if they can't all fit. */
export function pack<T extends Placement>(items: T[]): T[] | null {
  const area = (p: Placement) => SIZE_DIMS[p.size].w * SIZE_DIMS[p.size].h
  const placed: T[] = []
  for (const it of [...items].sort((a, b) => area(b) - area(a))) {
    const slot = findSlot(placed, it.size)
    if (!slot) return null
    placed.push({ ...it, ...slot })
  }
  return items.map((it) => placed.find((p) => p.id === it.id)!)
}
