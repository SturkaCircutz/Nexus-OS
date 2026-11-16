// The seven places the agent avatar can rest. Positions are computed from the viewport
// minus the chrome, so the avatar never sits under the menu bar or the dock.

export const ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const

export type Anchor = (typeof ANCHORS)[number]

export const isAnchor = (v: unknown): v is Anchor => typeof v === 'string' && (ANCHORS as readonly string[]).includes(v)

/** Column and row on a 3×3 grid (the middle row only has `center`). */
export const ANCHOR_CELL: Record<Anchor, [col: number, row: number]> = {
  'top-left': [0, 0],
  'top-center': [1, 0],
  'top-right': [2, 0],
  center: [1, 1],
  'bottom-left': [0, 2],
  'bottom-center': [1, 2],
  'bottom-right': [2, 2],
}

export const anchorLabel = (a: Anchor) => a.replace('-', ' ')

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

const EDGE = 16

/** Area the avatar may rest in: the viewport minus the menu bar and dock. */
export function safeBounds(): Bounds {
  const css = getComputedStyle(document.documentElement)
  const top = parseFloat(css.getPropertyValue('--chrome-top')) || 40
  const bottom = parseFloat(css.getPropertyValue('--chrome-bottom')) || 72
  return {
    left: EDGE,
    top: top + EDGE / 2,
    right: window.innerWidth - EDGE,
    bottom: window.innerHeight - bottom,
  }
}

/** Top-left corner of an avatar of `size` px resting at `anchor`. */
export function anchorPoint(anchor: Anchor, size: number, b = safeBounds()): Point {
  if (anchor === 'center') return { x: (window.innerWidth - size) / 2, y: (window.innerHeight - size) / 2 }
  const [col, row] = ANCHOR_CELL[anchor]
  const x = col === 0 ? b.left : col === 1 ? (b.left + b.right - size) / 2 : b.right - size
  const y = row === 0 ? b.top : b.bottom - size
  return { x, y }
}

/** The anchor whose resting spot is closest to `p`. */
export function nearestAnchor(p: Point, size: number): Anchor {
  const b = safeBounds()
  let best: Anchor = 'bottom-right'
  let bestD = Infinity
  for (const a of ANCHORS) {
    const q = anchorPoint(a, size, b)
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < bestD) {
      bestD = d
      best = a
    }
  }
  return best
}

/** The next anchor in an arrow-key direction, or the same one at an edge. */
export function neighborAnchor(from: Anchor, dx: number, dy: number): Anchor {
  const [c0, r0] = ANCHOR_CELL[from]
  let best = from
  let bestScore = Infinity
  for (const a of ANCHORS) {
    const [c, r] = ANCHOR_CELL[a]
    const along = (c - c0) * dx + (r - r0) * dy
    if (along <= 0) continue
    const across = Math.abs((c - c0) * dy) + Math.abs((r - r0) * dx)
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = a
    }
  }
  return best
}

/** Reads an anchor out of words like "top left", "middle" or "bottom". */
export function anchorFromText(text: string): Anchor | undefined {
  const w = (word: string) => new RegExp(`\\b${word}\\b`).test(text)
  const top = w('top') || w('upper')
  const bottom = w('bottom') || w('lower')
  const left = w('left')
  const right = w('right')
  if (!top && !bottom && !left && !right) return w('center') || w('centre') || w('middle') ? 'center' : undefined
  const row = top ? 'top' : 'bottom'
  const col = left ? 'left' : right ? 'right' : 'center'
  return `${row}-${col}` as Anchor
}
