import { beforeEach, describe, expect, it } from 'vitest'
import { COLS, ROWS, SIZE_DIMS, type Size } from './layout'
import { createDesktopStore, defaultDesktop, loadDesktop, type AppInstance } from './desktopStore'

// The desk itself: multi-widget layouts, packing, minimize/fullscreen semantics,
// resize snapping and the localStorage round-trip.

const KEY = 'nexus-desktop-v1'

beforeEach(() => {
  localStorage.clear()
})

describe('default desktop', () => {
  it('opens a rich mixed desk where every widget has its own cells', () => {
    const store = createDesktopStore(defaultDesktop())
    const live = store.getState().instances
    expect(live.length).toBeGreaterThan(8)
    const seen = new Set<string>()
    for (const it of live) {
      const d = SIZE_DIMS[it.size]
      for (let r = it.row; r < it.row + d.h; r++)
        for (let c = it.col; c < it.col + d.w; c++) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThan(COLS)
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThan(ROWS)
          const key = `${c},${r}`
          expect(seen.has(key)).toBe(false) // no overlaps
          seen.add(key)
        }
    }
  })

  it('fills most of the board so multi-widget layouts get exercised', () => {
    const live = defaultDesktop().instances
    const cells = live.reduce((sum, it) => sum + SIZE_DIMS[it.size].w * SIZE_DIMS[it.size].h, 0)
    expect(cells).toBeGreaterThanOrEqual(22)
    expect(cells).toBeLessThanOrEqual(COLS * ROWS)
  })
})

describe('open', () => {
  it('places a new app in the first free slot and focuses it', () => {
    const store = createDesktopStore({ instances: [], focusedId: null })
    expect(store.open('clock')).toContain('placed')
    const clock = store.find('clock')!
    expect(clock.size).toBe('2x2')
    expect(store.getState().focusedId).toBe(clock.id)
  })

  it('answers honestly when nothing fits, then makes room after closing', () => {
    const instances = Array.from({ length: COLS * ROWS }, (_, i) => ({
      id: `t${i}`,
      appId: 'timer' as const,
      size: '1x1' as const,
      col: i % COLS,
      row: Math.floor(i / COLS),
      mode: 'widget' as const,
    }))
    const store = createDesktopStore({ instances, focusedId: null })
    expect(store.open('clock')).toContain('no room')
    // A 2x2 clock needs four cells: close four timers and packing finds room.
    store.close('timer')
    store.close('timer')
    store.close('timer')
    store.close('timer')
    expect(store.open('clock')).toContain('made room')
    expect(store.find('clock')!.size).toBe('2x2')
  })
})

describe('resize', () => {
  it('snaps one step up and down the app size ladder', () => {
    const store = createDesktopStore(defaultDesktop())
    expect(store.resize('monitor', 'up')).toContain('2x1')
    expect(store.find('monitor')!.size).toBe('2x1')
    expect(store.resize('monitor', 'down')).toContain('1x1')
    expect(store.resize('monitor', 'up')).toContain('2x1')
    // Already at the top of its ladder: a polite no.
    expect(store.resize('monitor', 'up')).toContain('already 2x1')
  })

  it('falls back to the nearest supported size', () => {
    const store = createDesktopStore(defaultDesktop())
    // clock supports 1x1/2x1/2x2; 4x2 snaps to 2x2
    expect(store.resize('clock', '4x2')).toContain('2x2')
    expect(store.find('clock')!.size).toBe('2x2')
  })

  it('resizes a minimized app for when it comes back', () => {
    const store = createDesktopStore(defaultDesktop())
    store.minimize('timer')
    expect(store.resize('timer', '2x1')).toContain('when restored')
    expect(store.find('timer')).toMatchObject({ size: '2x1', mode: 'minimized' })
  })
})

describe('minimize', () => {
  it('takes the widget off the grid but keeps the instance running', () => {
    const store = createDesktopStore(defaultDesktop())
    expect(store.minimize('clock')).toContain('minimized')
    const clock = store.find('clock')!
    expect(clock.mode).toBe('minimized')
    expect(clock.size).toBe('2x2') // still holds its place in the workspace
    // Opening something else now fits where the clock used to sit.
    expect(store.open('calc')).toContain('placed')
    // Restoring puts the clock back on the grid.
    expect(store.restore('clock')).toContain('restored')
    expect(store.find('clock')!.mode).toBe('widget')
  })

  it('refuses to double-minimize', () => {
    const store = createDesktopStore(defaultDesktop())
    store.minimize('clock')
    expect(store.minimize('clock')).toContain('already minimized')
  })
})

describe('fullscreen', () => {
  it('keeps the widget cell and demotes the previous fullscreen app', () => {
    const store = createDesktopStore(defaultDesktop())
    const notes = store.find('notes')!
    expect(store.fullscreen('notes')).toContain('fullscreen')
    expect(store.find('notes')).toMatchObject({ mode: 'fullscreen', col: notes.col, row: notes.row })
    // Another fullscreen app takes over; notes returns to the grid.
    expect(store.fullscreen('browser')).toContain('fullscreen')
    expect(store.find('notes')!.mode).toBe('widget')
    expect(store.find('browser')!.mode).toBe('fullscreen')
  })

  it('declines for apps without a fullscreen view', () => {
    const store = createDesktopStore(defaultDesktop())
    expect(store.fullscreen('monitor')).toContain("doesn't have a fullscreen view")
  })
})

describe('close and tidy', () => {
  it('closes by app and clears the desk', () => {
    const store = createDesktopStore(defaultDesktop())
    expect(store.close('clock')).toContain('closed')
    expect(store.find('clock')).toBeUndefined()
    expect(store.close('clock')).toContain("isn't open")
    expect(store.closeAll()).toContain('cleared')
    expect(store.find('notes')).toBeUndefined()
  })

  it('tidies the grid without losing anyone', () => {
    const store = createDesktopStore(defaultDesktop())
    const before = store.getState().instances.map((i) => i.appId)
    expect(store.tidy()).toBeTruthy()
    const after = store.getState().instances.map((i) => i.appId)
    expect([...after].sort()).toEqual([...before].sort())
  })
})

describe('move', () => {
  const mk = (
    id: string,
    appId: AppInstance['appId'],
    size: Size,
    col: number,
    row: number,
    mode: AppInstance['mode'] = 'widget',
  ): AppInstance => ({ id, appId, size, col, row, mode })

  it('moves a widget to a free cell and focuses it', () => {
    const store = createDesktopStore({ instances: [mk('t', 'timer', '1x1', 0, 0)], focusedId: null })
    expect(store.move('timer', 3, 2)).toContain('moved')
    expect(store.find('timer')).toMatchObject({ col: 3, row: 2 })
    expect(store.getState().focusedId).toBe('t')
  })

  it('swaps with an equal-size widget', () => {
    const store = createDesktopStore({
      instances: [mk('t', 'timer', '1x1', 0, 0), mk('m', 'monitor', '1x1', 2, 0)],
      focusedId: null,
    })
    expect(store.move('timer', 2, 0)).toContain('swapped')
    expect(store.find('timer')).toMatchObject({ col: 2, row: 0 })
    expect(store.find('monitor')).toMatchObject({ col: 0, row: 0 })
  })

  it('makes a lone different-size widget step aside instead', () => {
    const store = createDesktopStore({
      instances: [mk('t', 'timer', '1x1', 0, 0), mk('m', 'monitor', '2x1', 2, 0), mk('n', 'notes', '2x1', 0, 1)],
      focusedId: null,
    })
    expect(store.move('timer', 2, 0)).toContain('stepped aside')
    expect(store.find('timer')).toMatchObject({ col: 2, row: 0 })
    expect(store.find('monitor')).toMatchObject({ col: 0, row: 0 }) // the vacated spot fits a 2x1
  })

  it('refuses when the only room for the blocker is its own cells', () => {
    // A board full except for the 2x2's own span: dropping a 1x1 on the 2x2 must
    // be refused — the blocker can't be parked on cells it still holds itself,
    // and the dragged widget counts as sitting at its target.
    const apps = ['notes', 'browser', 'gallery', 'timer', 'files', 'terminal', 'calendar', 'monitor', 'wm'] as const
    const instances: AppInstance[] = [mk('big', 'clock', '2x2', 0, 0)]
    let n = 0
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) {
        if (row < 2 && col < 2) continue // the 2x2's own span
        if (col === COLS - 1 && row === ROWS - 1) continue // the dragged widget's cell
        instances.push(mk(`f${n++}`, apps[n % apps.length]!, '1x1', col, row))
      }
    instances.push(mk('set', 'settings', '1x1', COLS - 1, ROWS - 1))
    const store = createDesktopStore({ instances, focusedId: null })
    expect(store.move('settings', 0, 0)).toContain('no room')
    expect(store.find('settings')).toMatchObject({ col: COLS - 1, row: ROWS - 1 })
    expect(store.find('clock')).toMatchObject({ col: 0, row: 0 })
  })

  it('re-homes the blocker when a half-step swap would collide with the dragged widget', () => {
    // Dragging the 2x1 from (0,0) to (1,0) keeps cell (1,0), so the old spot is
    // not really vacated: the blocker moves aside instead of swapping into it.
    const store = createDesktopStore({
      instances: [mk('t', 'timer', '2x1', 0, 0), mk('m', 'monitor', '2x1', 1, 0)],
      focusedId: null,
    })
    expect(store.move('timer', 1, 0)).toContain('stepped aside')
    expect(store.find('timer')).toMatchObject({ col: 1, row: 0 })
    expect(store.find('monitor')).toMatchObject({ col: 3, row: 0 })
  })

  it('refuses when the target would overlap several widgets', () => {
    const store = createDesktopStore({
      instances: [mk('n', 'notes', '2x1', 0, 0), mk('m', 'monitor', '1x1', 2, 0), mk('c', 'clock', '1x1', 3, 0)],
      focusedId: null,
    })
    expect(store.move('notes', 2, 0)).toContain('no room')
    expect(store.find('notes')).toMatchObject({ col: 0, row: 0 })
  })

  it('clamps off-board targets and answers honestly for locked widgets', () => {
    const store = createDesktopStore({
      instances: [mk('t', 'timer', '1x1', 0, 0), mk('n', 'notes', '2x1', 2, 0)],
      focusedId: null,
    })
    expect(store.move('timer', 99, -4)).toContain('moved')
    expect(store.find('timer')).toMatchObject({ col: COLS - 1, row: 0 })
    store.minimize('timer')
    expect(store.move('timer', 0, 0)).toContain('minimized')
    store.restore('timer')
    store.fullscreen('notes')
    expect(store.move('notes', 0, 0)).toContain('fullscreen')
  })
})

describe('persistence', () => {
  it('round-trips the whole workspace through localStorage', () => {
    const store = createDesktopStore(defaultDesktop())
    store.minimize('clock')
    store.resize('monitor', 'up')
    store.fullscreen('notes')
    const wmId = store.find('wm')!.id
    store.focus(wmId)

    expect(JSON.parse(localStorage.getItem(KEY)!).instances).toHaveLength(11)
    const loaded = loadDesktop()
    expect(loaded.instances).toHaveLength(11)
    expect(loaded.instances.find((i) => i.appId === 'clock')).toMatchObject({ mode: 'minimized', size: '2x2' })
    expect(loaded.instances.find((i) => i.appId === 'monitor')).toMatchObject({ mode: 'widget', size: '2x1' })
    expect(loaded.instances.find((i) => i.appId === 'notes')).toMatchObject({ mode: 'fullscreen' })
    expect(loaded.focusedId).toBe(wmId)
  })

  it('falls back to the default layout on broken storage', () => {
    localStorage.setItem(KEY, 'not json at all')
    expect(loadDesktop().instances.map((i) => i.appId)).toEqual(defaultDesktop().instances.map((i) => i.appId))
  })

  it('drops saved entries that name unknown apps or sizes', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        instances: [
          { id: 'ghost', appId: 'ghost-app', size: '1x1', col: 0, row: 0, mode: 'widget' },
          { id: 'bad-size', appId: 'timer', size: '9x9', col: 0, row: 0, mode: 'widget' },
          { id: 'keep', appId: 'timer', size: '1x1', col: 0, row: 0, mode: 'widget' },
        ],
        focusedId: 'ghost',
      }),
    )
    const loaded = loadDesktop()
    expect(loaded.instances.map((i) => i.appId)).toEqual(['timer'])
    expect(loaded.focusedId).toBeNull()
  })
})
