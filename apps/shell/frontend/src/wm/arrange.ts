import type { ArrangePreset, DesktopStoreAPI } from '@/wm/DesktopStoreAPI'
import { computeArrangement, sameRect, type Size } from '@/wm/snap'

/**
 * Apply an arrange preset through the store's per-window actions.
 *
 * This works with ANY DesktopStoreAPI implementation (mock or real) because it
 * only needs moveWindow/resizeWindow: the store does not have to know the
 * canvas size. It is the path the taskbar uses.
 */
export function applyArrangement(
  store: Pick<DesktopStoreAPI, 'windows' | 'grid' | 'activeWorkspaceId' | 'moveWindow' | 'resizeWindow'>,
  preset: ArrangePreset,
  canvas: Size,
): void {
  const next = computeArrangement(
    store.windows,
    preset,
    canvas,
    store.grid,
    store.activeWorkspaceId,
  )
  next.forEach((after, i) => {
    const before = store.windows[i]
    if (sameRect(before, after)) return
    if (before.x !== after.x || before.y !== after.y) {
      store.moveWindow(after.id, after.x, after.y)
    }
    if (before.width !== after.width || before.height !== after.height) {
      store.resizeWindow(after.id, after.width, after.height)
    }
  })
}
