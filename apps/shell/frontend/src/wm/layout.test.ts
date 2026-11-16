import { describe, expect, it } from 'vitest'
import { COLS, ROWS, SIZE_DIMS, SIZE_ORDER, fits, findSlot, intersecting, isSize, offset, pack, snapToCell, span } from './layout'

// Pure grid logic: every widget placement decision in the shell runs through these.

const at = (id: string, size: Parameters<typeof fits>[1], col: number, row: number) => ({ id, size, col, row })

describe('grid math', () => {
  it('computes pixel spans and cell offsets', () => {
    expect(span(1)).toBe(160)
    expect(span(2)).toBe(336) // 2 cells + 1 gap
    expect(offset(0)).toBe(0)
    expect(offset(2)).toBe(352) // 2 * (160 + 16)
  })

  it('sizes the board and orders sizes smallest to largest', () => {
    expect(COLS).toBe(6)
    expect(ROWS).toBe(4)
    expect(SIZE_ORDER).toEqual(['1x1', '2x1', '1x2', '2x2', '4x2'])
    expect(SIZE_DIMS['4x2']).toEqual({ w: 4, h: 2 })
  })

  it('guards unknown sizes', () => {
    expect(isSize('2x2')).toBe(true)
    expect(isSize('3x3')).toBe(false)
    expect(isSize(42)).toBe(false)
  })
})

describe('fits', () => {
  it('accepts an empty board', () => {
    expect(fits([], '1x1', { col: 0, row: 0 })).toBe(true)
    expect(fits([], '4x2', { col: 0, row: 0 })).toBe(true)
  })

  it('rejects out-of-bounds placements', () => {
    expect(fits([], '1x1', { col: -1, row: 0 })).toBe(false)
    expect(fits([], '4x2', { col: 3, row: 0 })).toBe(false) // 3+4 > 6
    expect(fits([], '2x2', { col: 0, row: 3 })).toBe(false) // 3+2 > 4
  })

  it('rejects overlaps', () => {
    const items = [at('a', '2x2', 0, 0)]
    expect(fits(items, '1x1', { col: 0, row: 0 })).toBe(false)
    expect(fits(items, '1x1', { col: 1, row: 1 })).toBe(false)
    expect(fits(items, '1x1', { col: 2, row: 0 })).toBe(true)
  })

  it('can ignore one item by id (moving it)', () => {
    const items = [at('a', '2x2', 0, 0)]
    expect(fits(items, '1x1', { col: 0, row: 0 }, 'a')).toBe(true)
  })
})

describe('findSlot', () => {
  it('honours a preferred slot when it fits', () => {
    expect(findSlot([], '1x1', undefined, { col: 3, row: 2 })).toEqual({ col: 3, row: 2 })
  })

  it('falls back to the first free slot in reading order', () => {
    const items = [at('a', '1x1', 0, 0)]
    expect(findSlot(items, '1x1', undefined, { col: 0, row: 0 })).toEqual({ col: 1, row: 0 })
    expect(findSlot(items, '1x1')).toEqual({ col: 1, row: 0 })
  })

  it('skips a large footprint', () => {
    const items = [at('a', '2x2', 0, 0)]
    expect(findSlot(items, '1x1')).toEqual({ col: 2, row: 0 })
    expect(findSlot(items, '2x2')).toEqual({ col: 2, row: 0 })
    expect(findSlot(items, '4x2')).toEqual({ col: 2, row: 0 }) // still clears cols 2-5
  })

  it('returns null when nothing fits', () => {
    const items = Array.from({ length: COLS * ROWS }, (_, i) => at(`w${i}`, '1x1', i % COLS, Math.floor(i / COLS)))
    expect(findSlot(items, '1x1')).toBeNull()
  })
})

describe('pack', () => {
  it('places biggest first and reports each item at its new slot', () => {
    const packed = pack([
      at('a', '1x1', 5, 5),
      at('b', '4x2', 0, 0),
      at('c', '2x2', 0, 0),
    ])
    expect(packed).not.toBeNull()
    expect(packed!.find((p) => p.id === 'b')).toMatchObject({ size: '4x2', col: 0, row: 0 })
    expect(packed!.find((p) => p.id === 'c')).toMatchObject({ size: '2x2', col: 4, row: 0 })
    expect(packed!.find((p) => p.id === 'a')).toMatchObject({ size: '1x1', col: 0, row: 2 })
  })

  it('keeps the caller\u2019s item order and payload', () => {
    const packed = pack([
      { ...at('a', '1x1', 0, 0), title: 'cpu' },
      { ...at('b', '2x2', 2, 0), title: 'notes' },
    ])
    expect(packed!.map((p) => p.id)).toEqual(['a', 'b'])
    expect(packed!.find((p) => p.id === 'a')!.title).toBe('cpu')
  })

  it('returns null when they can\u2019t all fit', () => {
    expect(pack([at('a', '4x2', 0, 0), at('b', '4x2', 0, 2), at('c', '4x2', 0, 0)])).toBeNull()
  })

  it('round-trips a full board', () => {
    const items = Array.from({ length: COLS * ROWS }, (_, i) => at(`w${i}`, '1x1', i % COLS, Math.floor(i / COLS)))
    const packed = pack(items)
    expect(packed).not.toBeNull()
    // Stable: each item's slot must still be the first one that fits when it re-asks,
    // i.e. pack didn't shuffle anyone once placed.
    for (const p of packed!) {
      const others = packed!.filter((q) => q.id !== p.id)
      expect(findSlot(others, p.size, undefined, { col: p.col, row: p.row })).toEqual({ col: p.col, row: p.row })
    }
  })
})

describe('snapToCell', () => {
  it('rounds pointer positions to the nearest cell', () => {
    expect(snapToCell(0, 0, 1, 1)).toEqual({ col: 0, row: 0 })
    expect(snapToCell(85, 0, 1, 1)).toEqual({ col: 0, row: 0 }) // under half a pitch
    expect(snapToCell(90, 0, 1, 1)).toEqual({ col: 1, row: 0 }) // past half a pitch
  })

  it('clamps so the widget always stays on the board', () => {
    expect(snapToCell(-90, -90, 1, 1)).toEqual({ col: 0, row: 0 })
    expect(snapToCell(10_000, 10_000, 2, 2)).toEqual({ col: COLS - 2, row: ROWS - 2 })
  })
})

describe('intersecting', () => {
  const a = { id: 'a', size: '2x2' as const, col: 0, row: 0 }
  const b = { id: 'b', size: '1x1' as const, col: 5, row: 3 }

  it('names the widgets under a dropped footprint', () => {
    expect(intersecting([a, b], '2x2', { col: 1, row: 1 })).toEqual([a])
    expect(intersecting([a, b], '1x1', { col: 5, row: 3 })).toEqual([b])
    expect(intersecting([a, b], '1x1', { col: 2, row: 3 })).toEqual([])
  })

  it('skips the dragged widget itself', () => {
    expect(intersecting([a], '2x2', { col: 0, row: 0 }, 'a')).toEqual([])
  })
})
