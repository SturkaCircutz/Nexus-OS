import { useEffect, useRef } from 'react'
import type { Theme } from '@/theme'

/**
 * Full-screen dot grid behind the widgets (inspired by Google Stitch).
 * Dots near the cursor are pushed away and spring back when it leaves.
 * The dot color comes from the `--dot` token, so themes can recolor it.
 */

const SPACING = 18 // px between dots
const RADIUS = 1.2 // dot radius
const REACH = 120 // how far from the cursor dots react
const PUSH = 18 // max push distance, right under the cursor
const SPRING = 0.08 // pull back toward the target position
const DAMPING = 0.82 // lower = less wobble

// Pointer over these doesn't push dots: they cover the field anyway.
const COVERING = '.nx-slot, .nx-glass, .nx-fullscreen-panel, .nx-agent'

export function DotField({ theme, reduced }: { theme: Theme; reduced: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const color = getComputedStyle(canvas).getPropertyValue('--dot').trim() || '#cccccc'
    // Per dot: home x, home y, offset x, offset y, velocity x, velocity y.
    let dots = new Float32Array(0)
    let count = 0
    let dpr = 1
    let width = 0
    let height = 0
    const pointer = { x: 0, y: 0, active: false }
    let raf = 0

    const build = () => {
      dpr = window.devicePixelRatio || 1
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      const cols = Math.ceil(width / SPACING) + 1
      const rows = Math.ceil(height / SPACING) + 1
      // Center the grid so the margins are even on both sides.
      const x0 = (width - (cols - 1) * SPACING) / 2
      const y0 = (height - (rows - 1) * SPACING) / 2
      count = cols * rows
      dots = new Float32Array(count * 6)
      for (let i = 0; i < count; i++) {
        dots[i * 6] = x0 + (i % cols) * SPACING
        dots[i * 6 + 1] = y0 + Math.floor(i / cols) * SPACING
      }
      draw()
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color
      ctx.beginPath()
      for (let i = 0; i < count; i++) {
        const x = dots[i * 6] + dots[i * 6 + 2]
        const y = dots[i * 6 + 1] + dots[i * 6 + 3]
        ctx.moveTo(x + RADIUS, y)
        ctx.arc(x, y, RADIUS, 0, Math.PI * 2)
      }
      ctx.fill()
    }

    /** Advances the springs one frame. Returns true while anything is still moving. */
    const step = () => {
      let moving = false
      for (let i = 0; i < count; i++) {
        const o = i * 6
        let tx = 0
        let ty = 0
        if (pointer.active) {
          const dx = dots[o] - pointer.x
          const dy = dots[o + 1] - pointer.y
          const d2 = dx * dx + dy * dy
          if (d2 < REACH * REACH) {
            const d = Math.sqrt(d2) || 0.001
            const f = (1 - d / REACH) ** 2 * PUSH
            tx = (dx / d) * f
            ty = (dy / d) * f
          }
        }
        let vx = dots[o + 4]
        let vy = dots[o + 5]
        // Skip dots already at rest at their target.
        if (vx === 0 && vy === 0 && dots[o + 2] === tx && dots[o + 3] === ty) continue
        vx = (vx + (tx - dots[o + 2]) * SPRING) * DAMPING
        vy = (vy + (ty - dots[o + 3]) * SPRING) * DAMPING
        let ox = dots[o + 2] + vx
        let oy = dots[o + 3] + vy
        if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01 && Math.abs(tx - ox) < 0.05 && Math.abs(ty - oy) < 0.05) {
          ox = tx
          oy = ty
          vx = 0
          vy = 0
        } else {
          moving = true
        }
        dots[o + 2] = ox
        dots[o + 3] = oy
        dots[o + 4] = vx
        dots[o + 5] = vy
      }
      return moving
    }

    const loop = () => {
      const moving = step()
      draw()
      // Targets only change when the pointer moves, which wakes the loop again.
      raf = moving ? requestAnimationFrame(loop) : 0
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop)
    }

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.active = !(e.target instanceof Element && e.target.closest(COVERING))
      wake()
    }
    const onLeave = () => {
      pointer.active = false
      wake()
    }

    build()
    window.addEventListener('resize', build)
    if (!reduced) {
      window.addEventListener('pointermove', onMove)
      document.documentElement.addEventListener('pointerleave', onLeave)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', build)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [theme, reduced])

  return <canvas ref={canvasRef} className="nx-dots" aria-hidden="true" />
}
