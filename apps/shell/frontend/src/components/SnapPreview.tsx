import type { Rect } from '@/wm/snap'

/** Translucent outline of where a window will land on release (Task B2). Props only. */
export function SnapPreview({ x, y, width, height }: Rect) {
  return (
    <div
      className="nexus-snap-preview"
      data-testid="snap-preview"
      aria-hidden="true"
      style={{ left: x, top: y, width, height }}
    />
  )
}
