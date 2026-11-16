import { useEffect, useRef } from 'react'
import type { Theme } from '@/theme'
import type { AgentStatus } from './agent/agentStore'

/**
 * Full-screen dot grid behind the widgets (inspired by Google Stitch).
 * Dots near the cursor are pushed away and spring back when it leaves.
 * The avatar is the field's soul: dots around its anchor glow in the accent
 * color and move with the agent's status — slow breathing at idle, expanding
 * ripples while working, one sharp shockwave on error. Dot colors come from
 * the `--dot`/`--accent` tokens, so themes can recolor the field.
 */

const SPACING = 18 // px between dots
const RADIUS = 1.2 // dot radius
const REACH = 120 // how far from the cursor dots react
const PUSH = 18 // max push distance, right under the cursor
const SPRING = 0.08 // pull back toward the target position
const DAMPING = 0.82 // lower = less wobble

// --- soul glow ---
const GLOW_REACH = 120 // radius of the steady breathing glow
const RIPPLE_PERIOD = 2.6 // seconds between ripples while the agent works
const RIPPLE_SPEED = 90 // px/s
const RIPPLE_WIDTH = 55 // wave band width, px
const BURST_SPEED = 340 // the error shockwave
const BURST_AMP = 22
const BURST_LIFE = 0.9
const MAX_REACH = 340 // dots beyond this never feel the soul

// Pointer over these doesn't push dots: they cover the field anyway.
const COVERING = '.nx-slot, .nx-glass, .nx-fullscreen-panel, .nx-agent'

/** Where the soul sits and what it's doing. */
export interface Soul {
  /** Centre of the avatar's anchor, in viewport px. */
  x: number
  y: number
  status: AgentStatus
}

interface Ripple {
  born: number
  speed: number
  amp: number
  life: number
}

const WORKING: AgentStatus[] = ['listening', 'thinking', 'speaking']

function parseRGB(v: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim())
  if (hex) {
    const h = hex[1]
    const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
  }
  const m = /rgba?\(([^)]+)\)/.exec(v)
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    if (p.length >= 3 && p.every(Number.isFinite)) return [p[0], p[1], p[2]]
  }
  return null
}

export function DotField({ theme, reduced, soul }: { theme: Theme; reduced: boolean; soul?: Soul | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Latest soul without restarting the field; the loop reads it every frame.
  const soulRef = useRef<Soul | null>(soul ?? null)
  const wakeRef = useRef<(() => void) | null>(null)
  const paintRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const style = getComputedStyle(canvas)
    const color = style.getPropertyValue('--dot').trim() || '#cccccc'
    const accent = parseRGB(style.getPropertyValue('--accent')) ?? [116, 184, 173]
    // Per dot: home x, home y, offset x, offset y, velocity x, velocity y.
    let dots = new Float32Array(0)
    let energy = new Float32Array(0)
    let count = 0
    let dpr = 1
    let width = 0
    let height = 0
    const pointer = { x: 0, y: 0, active: false }
    let raf = 0
    let last = 0
    let t = 0
    const ripples: Ripple[] = []
    let nextRipple = 0
    let prevStatus: AgentStatus | null = soulRef.current?.status ?? null

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
      energy = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        dots[i * 6] = x0 + (i % cols) * SPACING
        dots[i * 6 + 1] = y0 + Math.floor(i / cols) * SPACING
      }
      paint()
    }

    /** How lit a dot at (x, y) is right now: 0…1, drives color and size. */
    const energyAt = (x: number, y: number) => {
      const s = soulRef.current
      if (!s) return 0
      const dx = x - s.x
      const dy = y - s.y
      const d = Math.hypot(dx, dy)
      if (d >= MAX_REACH) return 0
      const working = WORKING.includes(s.status)
      let e =
        Math.exp(-(d * d) / (GLOW_REACH * GLOW_REACH)) *
        (working ? 0.35 : 0.55) *
        (0.75 + 0.25 * Math.sin(t * 1.9))
      for (const rp of ripples) {
        const age = t - rp.born
        const band = Math.exp(-Math.pow((d - age * rp.speed) / RIPPLE_WIDTH, 2))
        e = Math.max(e, band * (1 - age / rp.life))
      }
      return e
    }

    /** Advances the springs one frame. Returns true while anything is still moving. */
    const step = (dt: number) => {
      t += dt
      const s = soulRef.current
      if (s) {
        // A change into error fires one sharp shockwave.
        if (s.status === 'error' && prevStatus !== 'error') {
          ripples.push({ born: t, speed: BURST_SPEED, amp: BURST_AMP, life: BURST_LIFE })
          nextRipple = t + RIPPLE_PERIOD
        }
        // While working, expanding rings keep rolling out of the avatar.
        if (WORKING.includes(s.status) && t >= nextRipple) {
          ripples.push({ born: t, speed: RIPPLE_SPEED, amp: 8, life: 2.6 })
          nextRipple = t + RIPPLE_PERIOD
        }
        prevStatus = s.status
      }
      for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].born > ripples[i].life) ripples.splice(i, 1)

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
        if (s) {
          const dx = dots[o] - s.x
          const dy = dots[o + 1] - s.y
          const d = Math.hypot(dx, dy)
          if (d < MAX_REACH && d > 0.001) {
            // Slow breathing: a gentle steady push in the accent color.
            let a = (WORKING.includes(s.status) ? 2 : 4) * Math.exp(-(d * d) / (GLOW_REACH * GLOW_REACH)) * (0.6 + 0.4 * Math.sin(t * 1.9))
            for (const rp of ripples) {
              const age = t - rp.born
              a += rp.amp * Math.exp(-Math.pow((d - age * rp.speed) / RIPPLE_WIDTH, 2)) * (1 - age / rp.life)
            }
            if (a > 0.01) {
              tx += (dx / d) * a
              ty += (dy / d) * a
            }
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

    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const s = soulRef.current
      // The halo: a soft accent light under the dots, breathing with the soul.
      if (s) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 1.9)
        const haloR = GLOW_REACH * (0.8 + 0.3 * pulse)
        const alpha = 0.05 + 0.05 * pulse
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, haloR)
        grad.addColorStop(0, `rgba(${accent[0]},${accent[1]},${accent[2]},${alpha})`)
        grad.addColorStop(1, `rgba(${accent[0]},${accent[1]},${accent[2]},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(s.x - haloR, s.y - haloR, haloR * 2, haloR * 2)
      }
      // How lit each dot is, then three draw buckets: plain, lit, hot.
      if (s) {
        for (let i = 0; i < count; i++) energy[i] = energyAt(dots[i * 6], dots[i * 6 + 1])
      } else {
        energy.fill(0)
      }
      ctx.fillStyle = color
      ctx.beginPath()
      for (let i = 0; i < count; i++) {
        if (energy[i] > 0.05) continue
        const x = dots[i * 6] + dots[i * 6 + 2]
        const y = dots[i * 6 + 1] + dots[i * 6 + 3]
        ctx.moveTo(x + RADIUS, y)
        ctx.arc(x, y, RADIUS, 0, Math.PI * 2)
      }
      ctx.fill()
      if (s) {
        ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.55)`
        ctx.beginPath()
        for (let i = 0; i < count; i++) {
          const e = energy[i]
          if (e <= 0.05 || e > 0.45) continue
          const x = dots[i * 6] + dots[i * 6 + 2]
          const y = dots[i * 6 + 1] + dots[i * 6 + 3]
          const r = RADIUS * (1 + 0.9 * e)
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.fill()
        ctx.fillStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},0.9)`
        ctx.beginPath()
        for (let i = 0; i < count; i++) {
          const e = energy[i]
          if (e <= 0.45) continue
          const x = dots[i * 6] + dots[i * 6 + 2]
          const y = dots[i * 6 + 1] + dots[i * 6 + 3]
          const r = RADIUS * (1 + 1.2 * e)
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016
      last = now
      const moving = step(dt)
      paint()
      // The loop stays alive while the soul breathes, sleeps when all is still.
      raf = moving || (soulRef.current && !reduced) ? requestAnimationFrame(frame) : 0
    }
    const wake = () => {
      if (!raf && soulRef.current && !reduced) raf = requestAnimationFrame(frame)
    }
    // Under reduced motion (or with no soul) the field is a still picture.
    const staticPaint = () => {
      if (!raf) paint()
    }
    wakeRef.current = wake
    paintRef.current = staticPaint

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
      wake()
    } else {
      paint()
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', build)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      if (wakeRef.current === wake) wakeRef.current = null
      if (paintRef.current === staticPaint) paintRef.current = null
    }
  }, [theme, reduced])

  // Soul updates flow into the running loop without touching the field itself.
  useEffect(() => {
    soulRef.current = soul ?? null
    if (soul) wakeRef.current?.()
    else paintRef.current?.()
  }, [soul])

  return <canvas ref={canvasRef} className="nx-dots" aria-hidden="true" />
}
