import { describe, expect, it } from 'vitest'

import type { WindowState } from '@/types/WindowState'
import {
  clampToCanvas,
  computeArrangement,
  edgeZoneRect,
  getEdgeZone,
  gridToPixel,
  pixelToGrid,
  snapRectToGrid,
} from './snap'

const canvas = { width: 1200, height: 800 } // 12x8 grid -> 100x100 cells
const grid = { cols: 12, rows: 8 }

function win(id: string, patch: Partial<WindowState> = {}): WindowState {
  return {
    id,
    appId: 'nexus.notes',
    title: id,
    mode: 'windowed',
    x: 0,
    y: 0,
    width: 300,
    height: 200,
    workspaceId: 'default',
    monitor: 0,
    focused: false,
    zIndex: 1,
    isExternal: false,
    ...patch,
  }
}

describe('pixelToGrid / gridToPixel', () => {
  it('rounds to the nearest cell span', () => {
    expect(pixelToGrid({ x: 140, y: 260, width: 410, height: 290 }, canvas, grid)).toEqual({
      gridCol: 1,
      gridRow: 3,
      gridW: 4,
      gridH: 3,
    })
  })

  it('round-trips to pixels', () => {
    expect(gridToPixel({ gridCol: 1, gridRow: 3, gridW: 4, gridH: 3 }, canvas, grid)).toEqual({
      x: 100,
      y: 300,
      width: 400,
      height: 300,
    })
  })

  it('keeps spans at least 1x1 and inside the grid', () => {
    expect(pixelToGrid({ x: 5000, y: -50, width: 10, height: 10 }, canvas, grid)).toEqual({
      gridCol: 11,
      gridRow: 0,
      gridW: 1,
      gridH: 1,
    })
    expect(pixelToGrid({ x: 0, y: 0, width: 9999, height: 9999 }, canvas, grid)).toEqual({
      gridCol: 0,
      gridRow: 0,
      gridW: 12,
      gridH: 8,
    })
  })

  it('honours a minimum pixel size', () => {
    const cell = pixelToGrid({ x: 0, y: 0, width: 50, height: 50 }, canvas, grid, {
      width: 240,
      height: 160,
    })
    expect(cell.gridW).toBe(3)
    expect(cell.gridH).toBe(2)
  })

  it('leaves no gaps between adjacent spans on fractional cells', () => {
    const odd = { width: 1000, height: 700 } // 83.33 x 87.5 cells
    const a = gridToPixel({ gridCol: 0, gridRow: 0, gridW: 5, gridH: 1 }, odd, grid)
    const b = gridToPixel({ gridCol: 5, gridRow: 0, gridW: 7, gridH: 1 }, odd, grid)
    expect(a.x + a.width).toBe(b.x)
    expect(b.x + b.width).toBe(1000)
  })
})

describe('snapRectToGrid', () => {
  it('snaps position and size', () => {
    expect(snapRectToGrid({ x: 130, y: 70, width: 460, height: 330 }, canvas, grid)).toEqual({
      x: 100,
      y: 100,
      width: 500,
      height: 300,
    })
  })

  it('is a no-op on an unmeasured canvas', () => {
    const rect = { x: 13, y: 7, width: 46, height: 33 }
    expect(snapRectToGrid(rect, { width: 0, height: 0 }, grid)).toEqual(rect)
  })
})

describe('edge snapping', () => {
  it('detects zones, preferring left/right over top in corners', () => {
    expect(getEdgeZone({ x: 4, y: 400 }, canvas)).toBe('left')
    expect(getEdgeZone({ x: 1195, y: 400 }, canvas)).toBe('right')
    expect(getEdgeZone({ x: 600, y: 3 }, canvas)).toBe('top')
    expect(getEdgeZone({ x: 600, y: -40 }, canvas)).toBe('top')
    expect(getEdgeZone({ x: 2, y: 2 }, canvas)).toBe('left')
    expect(getEdgeZone({ x: 600, y: 400 }, canvas)).toBeNull()
  })

  it('maps zones to halves / full canvas', () => {
    expect(edgeZoneRect('left', canvas)).toEqual({ x: 0, y: 0, width: 600, height: 800 })
    expect(edgeZoneRect('right', { width: 1201, height: 800 })).toEqual({
      x: 600,
      y: 0,
      width: 601,
      height: 800,
    })
    expect(edgeZoneRect('top', canvas)).toEqual({ x: 0, y: 0, width: 1200, height: 800 })
  })
})

describe('clampToCanvas', () => {
  it('keeps the titlebar reachable', () => {
    expect(clampToCanvas({ x: -1000, y: -50, width: 300, height: 200 }, canvas)).toMatchObject({
      x: -220,
      y: 0,
    })
    expect(clampToCanvas({ x: 5000, y: 5000, width: 300, height: 200 }, canvas)).toMatchObject({
      x: 1120,
      y: 768,
    })
  })
})

describe('computeArrangement', () => {
  it('tiles 3 windows as 2 on top, 1 stretched below', () => {
    const result = computeArrangement([win('a'), win('b'), win('c')], 'tile', canvas, grid)
    expect(result.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual([
      { x: 0, y: 0, width: 600, height: 400 },
      { x: 600, y: 0, width: 600, height: 400 },
      { x: 0, y: 400, width: 1200, height: 400 },
    ])
  })

  it('cascades back-to-front by zIndex', () => {
    const result = computeArrangement(
      [win('top', { zIndex: 5 }), win('bottom', { zIndex: 1 })],
      'cascade',
      canvas,
      grid,
    )
    const byId = Object.fromEntries(result.map((w) => [w.id, w]))
    expect(byId.bottom).toMatchObject({ x: 0, y: 0, width: 720, height: 480 })
    expect(byId.top).toMatchObject({ x: 32, y: 32, width: 720, height: 480 })
  })

  it('snaps every window to the grid', () => {
    const result = computeArrangement(
      [win('a', { x: 130, y: 70, width: 460, height: 330 })],
      'snap-all-to-grid',
      canvas,
      grid,
    )
    expect(result[0]).toMatchObject({ x: 100, y: 100, width: 500, height: 300 })
  })

  it('leaves minimized, fullscreen and other-workspace windows alone', () => {
    const input = [
      win('min', { mode: 'minimized', x: 7 }),
      win('full', { mode: 'fullscreen', x: 8 }),
      win('other', { workspaceId: 'workspace-2', x: 9 }),
      win('moved', { x: 10 }),
    ]
    const result = computeArrangement(input, 'tile', canvas, grid, 'default')
    expect(result.map((w) => w.x)).toEqual([7, 8, 9, 0])
    expect(result[3]).toMatchObject({ width: 1200, height: 800 })
  })

  it('does not mutate its input', () => {
    const input = [win('a', { x: 130 })]
    computeArrangement(input, 'snap-all-to-grid', canvas, grid)
    expect(input[0].x).toBe(130)
  })
})
