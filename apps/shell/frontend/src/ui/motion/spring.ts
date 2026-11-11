// Spring physics in Apple's terms: damping ratio + response (seconds per oscillation).
// Springs always start from their current value and velocity, so any animation can be
// interrupted or retargeted mid-flight without a jump.

import { useEffect, useRef } from 'react'

export interface SpringConfig {
  /** 1 = no overshoot. Below 1 bounces a little. */
  damping: number
  /** Roughly how long the spring takes to arrive, in seconds. */
  response: number
}

/** Travel between places: fullscreen, dock flights, slow avatar releases. */
export const MOVE: SpringConfig = { damping: 1, response: 0.4 }
/** Sheets appearing and leaving (Spotlight). */
export const SHEET: SpringConfig = { damping: 1, response: 0.3 }
/** A thrown object carrying momentum into place, with a small bounce. */
export const FLING: SpringConfig = { damping: 0.8, response: 0.4 }

export interface SpringState {
  value: number
  velocity: number
}

const MAX_STEP = 1 / 240

/** Advances one spring by `dt` seconds toward `target` (mass 1). */
export function stepSpring(s: SpringState, target: number, cfg: SpringConfig, dt: number) {
  const stiffness = (2 * Math.PI / cfg.response) ** 2
  const friction = (4 * Math.PI * cfg.damping) / cfg.response
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP))
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    const accel = -stiffness * (s.value - target) - friction * s.velocity
    s.velocity += accel * h
    s.value += s.velocity * h
  }
}

/**
 * Where a flung object would come to rest if it slowed down like a scroll view.
 * `velocity` is in px/s. Apple's scroll deceleration rates: 0.998 normal, 0.99 fast.
 */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Resistance past an edge: follows the finger less and less the further it goes. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

interface ToOptions<K extends string> {
  velocity?: Partial<Record<K, number>>
  /** Called every frame; return new targets to follow something that moves. */
  retarget?: () => Partial<Record<K, number>> | null
  onRest?: () => void
}

/**
 * A set of independent springs (e.g. x and y) that write straight to the DOM through
 * `write`, one requestAnimationFrame at a time. React never re-renders per frame.
 */
export class Springs<K extends string> {
  private state = {} as Record<K, SpringState>
  private targets = {} as Record<K, number>
  private cfg: SpringConfig = MOVE
  private raf = 0
  private last = 0
  private opts: ToOptions<K> = {}

  constructor(
    initial: Record<K, number>,
    private write: (v: Record<K, number>) => void,
    /** Distance (in the springs' units) that counts as "arrived". */
    private precision = 0.5,
  ) {
    for (const k of Object.keys(initial) as K[]) {
      this.state[k] = { value: initial[k], velocity: 0 }
      this.targets[k] = initial[k]
    }
  }

  private keys() {
    return Object.keys(this.state) as K[]
  }

  values(): Record<K, number> {
    const out = {} as Record<K, number>
    for (const k of this.keys()) out[k] = this.state[k].value
    return out
  }

  velocities(): Record<K, number> {
    const out = {} as Record<K, number>
    for (const k of this.keys()) out[k] = this.state[k].velocity
    return out
  }

  target(): Record<K, number> {
    return { ...this.targets }
  }

  get moving() {
    return this.raf !== 0
  }

  /** Jumps straight to `values` and stops. */
  set(values: Partial<Record<K, number>>) {
    this.stop()
    for (const k of Object.keys(values) as K[]) {
      this.state[k] = { value: values[k]!, velocity: 0 }
      this.targets[k] = values[k]!
    }
    this.write(this.values())
  }

  /** Springs from wherever things are now toward `target`. */
  to(target: Partial<Record<K, number>>, cfg: SpringConfig, opts: ToOptions<K> = {}) {
    Object.assign(this.targets, target)
    if (opts.velocity) {
      for (const k of Object.keys(opts.velocity) as K[]) {
        if (this.state[k]) this.state[k].velocity = opts.velocity[k] ?? 0
      }
    }
    this.cfg = cfg
    this.opts = opts
    if (!this.raf) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private tick = (now: number) => {
    // Cap the step so a backgrounded tab doesn't fling things on return.
    const dt = Math.min(1 / 30, Math.max(0, (now - this.last) / 1000))
    this.last = now
    const next = this.opts.retarget?.()
    if (next) Object.assign(this.targets, next)

    let rest = true
    for (const k of this.keys()) {
      const s = this.state[k]
      stepSpring(s, this.targets[k], this.cfg, dt)
      if (Math.abs(s.value - this.targets[k]) > this.precision || Math.abs(s.velocity) > this.precision * 10) rest = false
    }

    if (rest) {
      for (const k of this.keys()) this.state[k] = { value: this.targets[k], velocity: 0 }
      this.write(this.values())
      this.raf = 0
      const done = this.opts.onRest
      this.opts = {}
      done?.()
      return
    }
    this.write(this.values())
    this.raf = requestAnimationFrame(this.tick)
  }
}

/** One `Springs` set for the life of a component, stopped on unmount. */
export function useSprings<K extends string>(
  initial: Record<K, number>,
  write: (v: Record<K, number>) => void,
  precision?: number,
) {
  const writeRef = useRef(write)
  writeRef.current = write
  const ref = useRef<Springs<K> | null>(null)
  if (!ref.current) ref.current = new Springs(initial, (v) => writeRef.current(v), precision)
  useEffect(() => () => ref.current?.stop(), [])
  return ref.current
}
