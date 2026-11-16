import { useCallback, useEffect, useRef } from 'react'
import { useTheme } from '@/theme'
import type { AgentStatus } from '../agent/agentStore'
import { startOrbit, type OrbitHandle, type OrbitState, type RampStop } from './orbitEngine'

/** The canvas square: wider than the 72px hit area so the orb can breathe past it. */
export const ORB_SIZE = 176
/** Idle this long and the orb dissolves into the dot field until something wakes it. */
const DORMANT_AFTER_MS = 24_000

type LiveState = Exclude<OrbitState, 'dormant'>

const STATE: Record<AgentStatus, LiveState> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  error: 'error',
}

type RGB = [number, number, number]

const toward = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

function parseColor(v: string): RGB | null {
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

/**
 * The orb's palette comes straight from the theme tokens: the accent ramp shades
 * the body, ink is the secondary hue. Reading them here keeps the One-Accent rule
 * and lets light/dark themes recolor the orb without touching the engine.
 */
function readRamps(canvas: HTMLCanvasElement): { accent: RampStop[]; ink: RampStop[] } {
  const s = getComputedStyle(canvas)
  const accent = parseColor(s.getPropertyValue('--accent')) ?? [116, 184, 173]
  const ink = parseColor(s.getPropertyValue('--ink')) ?? [232, 230, 223]
  const bg = parseColor(s.getPropertyValue('--bg')) ?? [12, 12, 13]
  const white: RGB = [237, 246, 244]
  return {
    accent: [
      [0, toward(accent, bg, 0.55)],
      [0.35, accent],
      [0.72, toward(accent, white, 0.55)],
      [1, white],
    ],
    ink: [
      [0, toward(ink, bg, 0.6)],
      [0.4, ink],
      [0.75, toward(ink, [255, 255, 255], 0.35)],
      [1, [255, 255, 255]],
    ],
  }
}

export interface OrbitArtProps {
  status: AgentStatus
  reduced: boolean
}

/**
 * The orb. Runs the engine on one canvas and manages dormancy around it: after
 * 24s of idle it dissolves outward into the dot field, and any status change,
 * pointer-down or focus on the avatar wakes it again.
 */
export function OrbitArt({ status, reduced }: OrbitArtProps) {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbRef = useRef<OrbitHandle | null>(null)
  const liveRef = useRef<LiveState>('idle')
  const dormantRef = useRef(false)
  const timerRef = useRef(0)

  const dissolve = useCallback(() => {
    dormantRef.current = true
    orbRef.current?.setState('dormant')
    // The engine leaves a pilot-light ember; CSS breathes it while dormant.
    canvasRef.current?.setAttribute('data-dormant', '')
  }, [])

  /** Cancel the dissolve and (if dissolved) re-form at the current status. */
  const wake = useCallback(() => {
    window.clearTimeout(timerRef.current)
    dormantRef.current = false
    canvasRef.current?.removeAttribute('data-dormant')
    orbRef.current?.setState(liveRef.current)
    timerRef.current = window.setTimeout(dissolve, DORMANT_AFTER_MS)
  }, [dissolve])

  // Build the orb. Rebuilt when the theme changes: the ramps read the CSS tokens.
  useEffect(() => {
    liveRef.current = STATE[status]
    const canvas = canvasRef.current
    canvas?.removeAttribute('data-dormant') // rebuilt: start awake
    if (!canvas || !canvas.getContext('2d')) return // test DOM: no painting, stay decorative
    const ramps = readRamps(canvas)
    const orb = startOrbit(canvas, {
      fontSize: 9,
      state: STATE[status],
      reduced,
      accent: ramps.accent,
      ink: ramps.ink,
    })
    orbRef.current = orb
    dormantRef.current = false
    timerRef.current = window.setTimeout(dissolve, DORMANT_AFTER_MS)
    return () => {
      window.clearTimeout(timerRef.current)
      orbRef.current = null
      orb.dispose()
    }
    // `status` is read once at mount; later changes go through setState below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, reduced, dissolve])

  // A status change is activity: clear the dissolve and show the new state.
  useEffect(() => {
    liveRef.current = STATE[status]
    wake()
    return () => window.clearTimeout(timerRef.current)
  }, [status, wake])

  // Pointer-down, focus or merely resting the pointer on the avatar wakes it too.
  useEffect(() => {
    const onActivity = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.nx-agent')) wake()
    }
    window.addEventListener('pointerdown', onActivity, true)
    window.addEventListener('pointerover', onActivity, true)
    window.addEventListener('focusin', onActivity, true)
    return () => {
      window.removeEventListener('pointerdown', onActivity, true)
      window.removeEventListener('pointerover', onActivity, true)
      window.removeEventListener('focusin', onActivity, true)
    }
  }, [wake])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return <canvas ref={canvasRef} className="nx-orb" width={ORB_SIZE} height={ORB_SIZE} aria-hidden="true" />
}
