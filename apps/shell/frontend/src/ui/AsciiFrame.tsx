import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useReducedMotion } from '@/theme'

/**
 * Wraps a widget and plays its ASCII motion:
 *  - enter: the border draws itself corner to corner, the content types in line
 *    by line, then the ASCII border settles into the clean card border.
 *  - exit:  the same timeline in reverse, a bit faster.
 *  - move:  when `moveKey` changes (new cell or size), the border flickers back
 *    to ASCII while the widget travels, then settles again.
 */

export type Phase = 'enter' | 'exit'

const DRAW = 540
const FILL = 450
const SETTLE = 280
export const ENTER_MS = DRAW + FILL + SETTLE
const EXIT_SPEED = 1.7
const MOVE = 480

const FONT_PX = 13
const LINE_PX = 16
const FONT = `${FONT_PX}px "JetBrains Mono", ui-monospace, monospace`
const GLYPHS = '.:-=+*#'

interface AsciiFrameProps {
  phase: Phase
  label: string
  /** Changes whenever the widget's cell or size changes. */
  moveKey?: string
  delay?: number
  /** Content sets the height (for panels like the tray) instead of filling a fixed box. */
  fluid?: boolean
  onExited?: () => void
  children: ReactNode
}

export function AsciiFrame({ phase, label, moveKey = '', delay = 0, fluid, onExited, children }: AsciiFrameProps) {
  const reduced = useReducedMotion()
  const boxRef = useRef<HTMLDivElement>(null)
  const { w, h } = useElementSize(boxRef)
  const cw = useCharWidth()

  const [t, setT] = useState(() => (reduced ? ENTER_MS : 0))
  const tRef = useRef(t)
  tRef.current = t
  const [move, setMove] = useState(1)
  const exitedRef = useRef(onExited)
  exitedRef.current = onExited

  // Enter, once on mount.
  useEffect(() => {
    if (phase !== 'enter') return
    if (reduced) {
      setT(ENTER_MS)
      return
    }
    return animate(ENTER_MS, delay, (p) => setT(p * ENTER_MS))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Exit: rewind from wherever the timeline currently is.
  useEffect(() => {
    if (phase !== 'exit') return
    const from = tRef.current
    if (reduced || from <= 0) {
      exitedRef.current?.()
      return
    }
    return animate(from / EXIT_SPEED, 0, (p) => setT(from * (1 - p)), () => exitedRef.current?.())
  }, [phase, reduced])

  // Move / resize.
  const prevKey = useRef(moveKey)
  useEffect(() => {
    if (prevKey.current === moveKey) return
    prevKey.current = moveKey
    if (reduced || phase === 'exit') return
    setMove(0)
    return animate(MOVE, 0, setMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey])

  const drawP = clamp01(t / DRAW)
  const fillP = clamp01((t - DRAW) / FILL)
  const settleP = clamp01((t - DRAW - FILL) / SETTLE)
  const pulse = move < 1 ? Math.sin(Math.PI * move) : 0

  const asciiOpacity = Math.max(1 - settleP, pulse)
  const surfaceOpacity = settleP * (1 - 0.9 * pulse)

  const cols = Math.max(2, Math.floor(w / cw))
  const rows = Math.max(2, Math.floor(h / LINE_PX))
  const showAscii = asciiOpacity > 0.01 && w > 0 && h > 0
  const text = showAscii ? frameText(cols, rows, drawP, pulse * 0.35) : ''
  // Stretch the character grid so its edges land exactly on the box edges.
  const sx = w / (cols * cw)
  const sy = h / (rows * LINE_PX)

  const revealed = Math.floor(fillP * rows) / rows
  const clipPath = fillP >= 1 ? undefined : `inset(0 0 ${(1 - revealed) * 100}% 0)`
  const typed = label.slice(0, Math.ceil(fillP * label.length))
  const typing = fillP > 0 && fillP < 1

  return (
    <div
      ref={boxRef}
      className={fluid ? 'ascii-frame ascii-frame--fluid' : 'ascii-frame'}
      data-exiting={phase === 'exit' || undefined}
    >
      <div className="ascii-frame-surface" style={{ opacity: surfaceOpacity }} />
      {showAscii && (
        <pre
          className="ascii-frame-lines"
          aria-hidden="true"
          style={{ opacity: asciiOpacity, transform: `scale(${sx}, ${sy})` }}
        >
          {text}
        </pre>
      )}
      <div className="ascii-frame-label" aria-hidden="true">
        {typed}
        {typing && <span className="ascii-caret">_</span>}
      </div>
      <div
        className="ascii-frame-content"
        style={{ clipPath, opacity: 1 - 0.35 * pulse }}
        inert={fillP < 1 || phase === 'exit' ? true : undefined}
      >
        {children}
      </div>
    </div>
  )
}

/** Border drawn by two strokes from the top-left corner that meet at the bottom-right. */
function frameText(cols: number, rows: number, p: number, noise: number): string {
  if (p <= 0) return ''
  const buf = Array.from({ length: rows }, () => Array<string>(cols).fill(' '))
  const last = (cols - 1) + (rows - 1)
  const k = Math.round(p * last)
  const along = (i: number): [number, number] => (i <= cols - 1 ? [0, i] : [i - (cols - 1), cols - 1])
  const down = (i: number): [number, number] => (i <= rows - 1 ? [i, 0] : [rows - 1, i - (rows - 1)])
  const glyph = (r: number, c: number) => {
    const edgeRow = r === 0 || r === rows - 1
    const edgeCol = c === 0 || c === cols - 1
    if (edgeRow && edgeCol) return '+'
    return edgeRow ? '-' : '|'
  }

  for (let i = 0; i <= k; i++) {
    for (const [r, c] of [along(i), down(i)]) {
      buf[r][c] = noise > 0 && Math.random() < noise ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : glyph(r, c)
    }
  }
  if (p < 1) {
    for (const [r, c] of [along(k), down(k)]) buf[r][c] = '#'
  }
  return buf.map((row) => row.join('')).join('\n')
}

function animate(duration: number, delay: number, onFrame: (p: number) => void, onDone?: () => void) {
  let raf = 0
  let start: number | null = null
  const step = (now: number) => {
    if (start === null) start = now + delay
    const p = duration <= 0 ? 1 : clamp01((now - start) / duration)
    if (now >= start) onFrame(p)
    if (p < 1) raf = requestAnimationFrame(step)
    else onDone?.()
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function measureCharWidth() {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return FONT_PX * 0.6
  ctx.font = FONT
  return ctx.measureText('M'.repeat(20)).width / 20
}

function useCharWidth() {
  const [width, setWidth] = useState(measureCharWidth)
  useEffect(() => {
    let live = true
    document.fonts?.load(FONT).then(() => live && setWidth(measureCharWidth()))
    return () => {
      live = false
    }
  }, [])
  return width
}

/** Layout size (unaffected by ancestor transforms such as the grid's fit-to-screen scale). */
function useElementSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}
