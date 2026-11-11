import { useEffect, useState } from 'react'
import { getApp } from '@/apps/registry'
import { GRID_H, GRID_W, SIZE_DIMS, offset, span } from '@/wm/layout'
import { useDesktop, type AppInstance } from '@/wm/desktopStore'
import { useHostSlot } from './hostNodes'

// Stage padding on each side of the grid.
const STAGE_PAD = 24

/**
 * Snap grid: every open app sits in cells the system picks. No dragging or free resizing.
 * Cells only position things; the apps themselves render in InstanceHost.
 */
export function WidgetGrid() {
  const { state } = useDesktop()
  const scale = useFitScale(GRID_W, GRID_H)

  // Minimized apps leave the grid. A fullscreen app keeps its cell for when it returns.
  const shown = state.instances.filter((it) => it.mode !== 'minimized')

  return (
    <div className="nx-grid-box" style={{ width: GRID_W * scale, height: GRID_H * scale }}>
      <div className="nx-grid" style={{ width: GRID_W, height: GRID_H, transform: `scale(${scale})` }}>
        {shown.map((it) => (
          <GridSlot key={it.id} instance={it} />
        ))}
      </div>
    </div>
  )
}

function GridSlot({ instance: it }: { instance: AppInstance }) {
  const d = SIZE_DIMS[it.size]
  const hosting = it.mode === 'widget'
  const hostRef = useHostSlot(it.id, 'grid')
  return (
    <section
      ref={hosting ? hostRef : undefined}
      className="nx-slot"
      data-slot={it.id}
      aria-label={getApp(it.appId).label}
      aria-hidden={hosting ? undefined : true}
      style={{
        width: span(d.w),
        height: span(d.h),
        transform: `translate(${offset(it.col)}px, ${offset(it.row)}px)`,
      }}
    />
  )
}

/** Room the chrome takes above and below the stage, from the theme tokens. */
function chromeRoom() {
  const css = getComputedStyle(document.documentElement)
  const top = parseFloat(css.getPropertyValue('--chrome-top')) || 40
  const bottom = parseFloat(css.getPropertyValue('--chrome-bottom')) || 72
  return top + bottom
}

/** Shrinks the grid to fit small windows; never scales it up. */
function useFitScale(w: number, h: number) {
  const calc = () =>
    Math.max(
      0.3,
      Math.min(1, (window.innerWidth - STAGE_PAD * 2) / w, (window.innerHeight - chromeRoom() - STAGE_PAD * 2) / h),
    )
  const [scale, setScale] = useState(calc)
  useEffect(() => {
    const onResize = () => setScale(calc())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return scale
}
