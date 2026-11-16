// ORBIT: the avatar's picture. A glyph-shaded energy orb — three rotating shells,
// a pulsing core, an expanding ring — drawn as ASCII density on a canvas grid.
// Ported from the team's ORBIT reference with the shell's own palette: the accent
// ramp shades the body, the ink ramp is the secondary hue, and "dormant" dissolves
// the orb radially outward so it reads as merging into the dot field behind it.

export type OrbitState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'dormant'

export type RampStop = [at: number, rgb: [number, number, number]]

export interface OrbitOptions {
  fontSize?: number
  speed?: number
  /** Gaze follows the pointer. */
  gaze?: boolean
  state?: OrbitState
  /** Overrides the prefers-reduced-motion media query (the caller may already know). */
  reduced?: boolean
  /** Ramp for the body hue — the accent color. Stops at 0…1. */
  accent?: RampStop[]
  /** Ramp for the secondary hue — ink. Stops at 0…1. */
  ink?: RampStop[]
}

export interface OrbitHandle {
  setState(state: OrbitState): void
  /** External energy 0…1 (speech level, audio), held for ~300ms. */
  setLevel(v: number): void
  dispose(): void
}

/** The shape knobs. One per agent state; `cur` eases toward the active one. */
interface Preset {
  amp: number
  gain: number
  spin: number
  flow: number
  coreK: number
  spiral: number
  ring: number
  /** Weight of the ink ramp over the accent ramp. */
  violet: number
  scale: number
  warp: number
  lean: number
  exK: number
  spk: number
}

const PRESETS: Record<Exclude<OrbitState, 'dormant'>, Preset> = {
  idle: { amp: 1, gain: 1, spin: 1, flow: 1, coreK: 1, spiral: 3.2, ring: 0.29, violet: 1, scale: 1, warp: 1, lean: 1, exK: 1, spk: 0 },
  listening: { amp: 0.65, gain: 1.12, spin: 0.45, flow: 0.7, coreK: 1.35, spiral: 1.6, ring: -0.6, violet: 0.4, scale: 1.05, warp: 0.8, lean: 2.4, exK: 0.25, spk: 0 },
  thinking: { amp: 0.5, gain: 1.05, spin: 2.3, flow: 1.6, coreK: 0.85, spiral: 6.5, ring: 0.06, violet: 2.2, scale: 0.9, warp: 1.7, lean: 0.5, exK: 0.5, spk: 0 },
  speaking: { amp: 1.3, gain: 1.15, spin: 1.1, flow: 1.35, coreK: 1.2, spiral: 3.8, ring: 0.55, violet: 0.8, scale: 1, warp: 1.1, lean: 1, exK: 0.6, spk: 1 },
  // Agitated: tense and compressed, a hot core, a fast ring, sharp accent (no soft
  // ink mixing) and frequent expansion bursts. Same palette — error is motion.
  error: { amp: 0.3, gain: 1.1, spin: 2.6, flow: 1.6, coreK: 1.55, spiral: 4.5, ring: 0.9, violet: 0, scale: 0.92, warp: 1.9, lean: 0.4, exK: 1.6, spk: 1 },
}

const RAMP = ' .,:;!+*ox%#@'
const NR = RAMP.length - 1
const LV = 28
const HUES = 4
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
// The shell's self-hosted mono, matching the `--mono` token stack (canvas font
// strings can't use CSS variables).
const FONT = (px: number) => `700 ${px}px "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`

// Fallback ramps ≈ the dark theme's accent/ink when the caller passes none.
const ACCENT: RampStop[] = [
  [0, [26, 62, 57]],
  [0.35, [116, 184, 173]],
  [0.72, [187, 224, 218]],
  [1, [237, 246, 244]],
]
const INK: RampStop[] = [
  [0, [87, 86, 81]],
  [0.4, [232, 230, 223]],
  [0.75, [246, 245, 241]],
  [1, [255, 255, 255]],
]

const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const ridge = (g: number) => {
  const r = 1 - Math.abs(g)
  const r2 = r * r
  const r4 = r2 * r2
  return r4 * r4
}

function ramp(stops: RampStop[], e: number): [number, number, number] {
  for (let i = 1; i < stops.length; i++) {
    if (e <= stops[i][0]) {
      const [a, ca] = stops[i - 1]
      const [b, cb] = stops[i]
      const t = (e - a) / (b - a)
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]
    }
  }
  return stops[stops.length - 1][1]
}

function buildAtlas(cw: number, ch: number, px: number, accent: RampStop[], ink: RampStop[]) {
  const c = document.createElement('canvas')
  c.width = cw * LV
  c.height = ch * NR * HUES
  const g = c.getContext('2d')
  if (!g) return c
  g.font = FONT(px)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let h = 0; h < HUES; h++)
    for (let k = 1; k <= NR; k++)
      for (let l = 0; l < LV; l++) {
        const e = l / (LV - 1)
        const m = h / (HUES - 1)
        const a = ramp(accent, e)
        const b = ramp(ink, e)
        const col = a.map((v, n) => Math.round(v + (b[n] - v) * m))
        g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.3 + 0.7 * Math.pow(e, 0.7)})`
        g.fillText(RAMP[k], l * cw + cw / 2, (h * NR + k - 1) * ch + ch / 2)
      }
  return c
}

const SHELLS: Array<[radius: number, parallax: number]> = [
  [1, 0],
  [0.66, 0.6],
  [0.38, 1.3],
]

// The pilot light: when fully dormant the orb leaves this faint ember behind, so
// it never vanishes from the desk outright. Cells: [dx, dy, ramp char, density].
const EMBER: Array<[number, number, number, number]> = [
  [0, 0, 7, 0.55],
  [0, -1, 4, 0.2],
  [0, 1, 4, 0.2],
  [-1, 0, 4, 0.2],
  [1, 0, 4, 0.2],
  [-1, -1, 2, 0.09],
  [1, -1, 2, 0.09],
  [-1, 1, 2, 0.09],
  [1, 1, 2, 0.09],
]

export function startOrbit(canvas: HTMLCanvasElement, opts: OrbitOptions = {}): OrbitHandle {
  const noop: OrbitHandle = { setState() {}, setLevel() {}, dispose() {} }
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) return noop // test DOM or unsupported: stay silent, the button still works

  const fs = opts.fontSize ?? 9
  const speed = opts.speed ?? 1
  const follow = opts.gaze ?? true
  const slow = (opts.reduced ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ? 0.4 : 1
  const accentRamp = opts.accent ?? ACCENT
  const inkRamp = opts.ink ?? INK

  let W = 1
  let H = 1
  let cw = 4
  let ch = 8
  let cols = 0
  let rows = 0
  let R = 1
  let prev = new Float32Array(0)
  let atlas = document.createElement('canvas')
  let raf = 0
  let last = 0
  let T = 0
  let Tr = 0
  let Ts = 0
  let ringPh = 0
  let dormant = opts.state === 'dormant'
  let pres = dormant ? 1 : 0
  let ign = 0
  let blank = false
  let disposed = false
  let lvl = 0
  let extLevel = 0
  let extAt = -1e9
  // Per-cell dissolve noise (radial: every cell leaves on its own schedule).
  let hs = new Float32Array(0)
  let hd = new Float32Array(0)
  let hp = new Float32Array(0)
  let tgt = PRESETS[opts.state && opts.state !== 'dormant' ? opts.state : 'idle']
  const cur = { ...tgt }
  const gz = { x: 0, y: 0, tx: 0, ty: 0 }
  const rot = new Float64Array(18)

  const layout = () => {
    const dpr = window.devicePixelRatio || 1
    const rc = canvas.getBoundingClientRect()
    W = Math.max(1, Math.round(rc.width * dpr))
    H = Math.max(1, Math.round(rc.height * dpr))
    canvas.width = W
    canvas.height = H
    const px = fs * dpr
    const m = document.createElement('canvas').getContext('2d')
    if (m) {
      m.font = FONT(px)
      cw = Math.max(3, Math.round(m.measureText('M').width))
    }
    ch = Math.max(5, Math.round(px * 1.1))
    cols = Math.ceil(W / cw)
    rows = Math.ceil(H / ch)
    const hash = (k: number, z: number) => {
      const v = Math.sin(k * 12.9898 + z * 78.233) * 43758.5453
      return v - Math.floor(v)
    }
    const n = Math.max(1, cols * rows)
    hs = new Float32Array(n)
    hd = new Float32Array(n)
    hp = new Float32Array(n)
    for (let k = 0; k < n; k++) {
      hs[k] = hash(k, 1)
      hd[k] = hash(k, 2)
      hp[k] = hash(k, 3)
    }
    R = Math.min(W, H) * 0.3
    atlas = buildAtlas(cw, ch, px, accentRamp, inkRamp)
    prev = new Float32Array(cols * rows)
    // A resize during dormancy must redraw the ember — no rAF is running then.
    if (dormant && pres > 0.999) drawEmber()
  }

  /** Draws the dormant pilot light (once; CSS breathes its opacity). */
  const drawEmber = () => {
    if (cols < 3 || rows < 3) return
    const cx = cols >> 1
    const cy = rows >> 1
    for (const [dx, dy, k, dens] of EMBER) {
      const i = cx + dx
      const j = cy + dy
      if (i < 0 || j < 0 || i >= cols || j >= rows) continue
      // Hue row 0 (accent); atlas columns are fill level, rows are ramp chars.
      const lv = Math.round(dens * (LV - 1))
      ctx.drawImage(atlas, lv * cw, (k - 1) * ch, cw, ch, i * cw, j * ch, cw, ch)
    }
  }

  const onMove = (e: PointerEvent) => {
    const rc = canvas.getBoundingClientRect()
    gz.tx = clamp((e.clientX - rc.left - rc.width / 2) / (rc.width * 0.9), -1, 1)
    gz.ty = clamp((e.clientY - rc.top - rc.height / 2) / (rc.height * 0.9), -1, 1)
  }

  const wake = () => {
    if (disposed || raf) return
    last = 0
    raf = requestAnimationFrame(frame)
  }

  const frame = (now: number) => {
    raf = 0
    const dt = Math.min(0.05, (now - (last || now)) / 1e3)
    last = now
    const k0 = 1 - Math.exp(-dt * 2.6)
    for (const key in cur) cur[key as keyof Preset] += (tgt[key as keyof Preset] - cur[key as keyof Preset]) * k0
    const base = dt * speed * slow
    T += base * cur.flow
    Tr += base * cur.spin
    Ts += base * cur.spiral
    ringPh += base * cur.ring
    const t = T
    const goal = dormant ? 1 : 0
    const rt = dt / (goal ? 1.8 : 2.3)
    pres = pres < goal ? Math.min(goal, pres + rt) : Math.max(goal, pres - rt)
    ign *= Math.exp(-dt * 2.2)
    const d = pres
    gz.x += (gz.tx - gz.x) * 0.04
    gz.y += (gz.ty - gz.y) * 0.04
    const synth = (0.5 + 0.5 * Math.sin(t * 8.3 + 2 * Math.sin(t * 2.1))) * (0.5 + 0.5 * Math.sin(t * 2.9 + 1))
    lvl += ((now - extAt < 300 ? extLevel : synth) - lvl) * 0.35
    const L = lvl * cur.spk
    const ex = Math.max(Math.pow(0.5 + 0.5 * Math.sin(t * 0.43 + 1.7 * Math.sin(t * 0.17)), 4) * cur.exK, ign, L * 0.8)
    const ringR = 1.4 * (((ringPh % 1) + 1) % 1)
    const amp = cur.amp + 0.35 * L
    const wf = cur.warp
    const vio = cur.violet
    const gn = cur.gain
    const ck = cur.coreK
    const breath =
      cur.scale * (1 + 0.045 * Math.sin(t * 0.9) + 0.025 * Math.sin(t * 1.73 + 1.3) + 0.012 * Math.sin(t * 3.1) + 0.1 * ex + 0.07 * L)
    const ccx = 0.16 * Math.sin(t * 0.52) + 0.09 * Math.sin(t * 1.21 + 2) + gz.x * 0.14 * cur.lean
    const ccy = 0.15 * Math.cos(t * 0.43 + 1) + 0.08 * Math.sin(t * 1.07) + gz.y * 0.14 * cur.lean
    let lx = Math.cos(t * 0.21) * 0.6 - 0.35 + gz.x * 0.2
    let ly = -0.55 + Math.sin(t * 0.17) * 0.25 + gz.y * 0.2
    let lz = 0.75
    const ll = Math.hypot(lx, ly, lz)
    lx /= ll
    ly /= ll
    lz /= ll
    const phi = t * 0.21 + 0.5 * Math.sin(t * 0.3)
    const cph = Math.cos(phi)
    const sph = Math.sin(phi)
    const sq = 0.2 * Math.sin(t * 0.61) + 0.08 * Math.sin(t * 1.7 + 1)
    const twist = 1.6 * Math.sin(t * 0.27) + 0.7 * Math.sin(t * 0.61)
    for (let k = 0; k < 3; k++) {
      const ax = Tr * (0.11 + 0.09 * k) + k
      const ay = Tr * (0.15 + 0.11 * k) + 2 * k
      const az = Tr * (0.05 + 0.03 * k)
      rot.set([Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)], k * 6)
    }

    // Fully dissolved: a dormant orb sleeps (no rAF) leaving only its pilot-light
    // ember. A waking orb must keep the loop alive while presence drains back.
    if (d > 0.999 && dormant) {
      if (!blank) {
        ctx.clearRect(0, 0, W, H)
        prev.fill(0)
        drawEmber()
        blank = true
      }
      return
    }
    blank = false
    raf = requestAnimationFrame(frame)
    ctx.clearRect(0, 0, W, H)
    const cx = W / 2
    const cy = H / 2
    for (let j = 0; j < rows; j++) {
      const v0 = ((j + 0.5) * ch - cy) / R
      for (let i = 0; i < cols; i++) {
        const u0 = ((i + 0.5) * cw - cx) / R
        if (d <= 1e-3 && u0 * u0 + v0 * v0 > 3.1) continue
        let su = u0
        let sv = v0
        let fade = 1
        if (d > 1e-3) {
          // Radial dissolve: each cell's sample drifts outward along its own ray and
          // the pattern stretches as it goes, so the orb diffuses into the dot field.
          const key = j * cols + i
          const c = clamp((d - 0.4 * hd[key]) / 0.6)
          const e = Math.pow(c, 1.8)
          const disp = e * 11 * (0.85 + 0.3 * hs[key])
          const sx = 1 + 4 * c
          const r0 = Math.hypot(u0, v0)
          const s = (r0 * sx + disp) / (r0 || 1)
          su = u0 * s
          sv = v0 * s
          const m = 0.5 + 0.5 * Math.sin((r0 * sx + disp) * 5 + hp[key] * 6.283)
          fade = (1 - Math.pow(c, 1.3)) * sstep(c * 0.8 - 0.35, c * 0.8 - 0.15, m)
        }
        const idx = j * cols + i
        const w = su * cph + sv * sph
        const wp = -su * sph + sv * cph
        const u = su - sq * w * cph - 0.5 * sq * wp * sph
        const v = sv - sq * w * sph + 0.5 * sq * wp * cph
        const a = Math.atan2(v, u)
        const r = Math.hypot(u, v)
        const B =
          breath *
          (1 +
            amp *
              (0.13 * Math.sin(2 * a + t * 0.9 + 1.1 * Math.sin(t * 0.31 + a)) +
                0.09 * Math.sin(3 * a - t * 1.2 + 1.7 + 0.8 * Math.sin(2 * a + t * 0.5)) +
                0.06 * Math.sin(5 * a + t * 1.9 - 0.9 * Math.sin(3 * a + t * 0.5)) +
                0.04 * Math.sin(7 * a - t * 2.6 + Math.sin(t * 0.9)) +
                ex * 0.07 * Math.sin(4 * a - t * 5)))
        const q = r / B
        let I = 0
        let core = 0
        let hm = 0
        const dxc = u - ccx * 0.7
        const dyc = v - ccy * 0.7
        const d2c = dxc * dxc + dyc * dyc
        const dc = Math.sqrt(d2c)
        const er = (dc - ringR) * 5
        const ring = Math.exp(-er * er)
        if (q < 1) {
          let acc = 0
          let trans = 1
          for (let k = 0; k < 3; k++) {
            const sc = SHELLS[k][0]
            const par = SHELLS[k][1]
            const Bk = 1 + (B - 1) * (1 - 0.3 * k)
            const uk = (u - ccx * par) / (Bk * sc)
            const vk = (v - ccy * par) / (Bk * sc)
            const q2 = uk * uk + vk * vk
            if (q2 >= 1) continue
            const z = Math.sqrt(1 - q2)
            const qq = Math.sqrt(q2)
            const diff = Math.max(0, uk * lx + vk * ly + z * lz)
            const tw = twist * vk * (0.6 + 0.3 * k)
            const ct = Math.cos(tw)
            const st = Math.sin(tw)
            const x = uk * ct + z * st
            const zz = z * ct - uk * st
            const mo = k * 6
            const x2 = x * rot[mo + 2] + zz * rot[mo + 3]
            const z2 = zz * rot[mo + 2] - x * rot[mo + 3]
            const y2 = vk * rot[mo] - z2 * rot[mo + 1]
            const pz = z2 * rot[mo] + vk * rot[mo + 1]
            const px = x2 * rot[mo + 4] - y2 * rot[mo + 5]
            const py = x2 * rot[mo + 5] + y2 * rot[mo + 4]
            const fq = 2 + 0.7 * k
            const kk = k * 2.1
            const fx = px * fq + 1.2 * wf * Math.sin(py * 1.9 + t * 1.1 + kk) + 0.5 * Math.sin(pz * 3.1 - t * 1.7)
            const fy = py * fq + 1.2 * wf * Math.sin(pz * 2.2 - t * 0.95 + kk * 0.6) + 0.5 * Math.sin(px * 2.7 + t * 1.4)
            const fz = pz * fq + 1.2 * wf * Math.sin(px * 2 + t * 0.85 - kk * 0.4) + 0.5 * Math.sin(py * 3.3 - t * 1.2)
            const vein = Math.max(
              ridge(Math.sin(fx + 1.2 * Math.sin(fy))),
              0.9 * ridge(Math.sin(fy * 1.1 + 1.2 * Math.sin(fz) + 1.7)),
              0.8 * ridge(Math.sin(fz * 0.9 + 1.2 * Math.sin(fx) + 3.1)),
            )
            const pulse = Math.pow(0.5 + 0.5 * Math.sin(fx * 1.4 + fy * 1.4 - t * 3.6 + k * 2), 5)
            const tex = 0.5 + 0.5 * Math.sin(fx * 3.3 + fy * 2.9 + t * 1.6 + Math.sin(fz * 2.2))
            const Ik =
              0.12 +
              0.65 * diff * (0.5 + 0.5 * tex) +
              vein * (0.45 + 1.1 * pulse) * (0.6 + 0.4 * z) +
              0.1 * (1 - z) * tex +
              diff * 0.3 * (0.5 + 0.5 * Math.sin(dc * 13 - t * 3.4 + k * 1.3)) +
              0.45 * ring * (0.4 + 0.6 * ex)
            const ob = k === 0 ? (0.5 + 0.4 * (1 - z)) * (1 - sstep(0.86, 1, qq)) : k === 1 ? 0.72 : 0.95
            const o = ob * (0.3 + 0.7 * clamp(vein * 1.4 + 0.25 * tex))
            acc += trans * o * Ik
            trans *= 1 - o
          }
          I = acc
          hm =
            sstep(0.8, 0.98, 0.5 + 0.5 * Math.sin(u * 2.4 - v * 1.9 + t * 0.23 + 2 * Math.sin(t * 0.11 + u * 1.5))) * 0.8
        }
        const ww = sstep(0.78, 1, q) * (1 - sstep(1, 1.28, q))
        if (ww > 0) {
          I += ridge(Math.sin(a * 5 - q * 7 + t * 1.5 + 1.6 * Math.sin(2 * a + t * 0.4))) * ww * (0.85 + 0.5 * ex) * (0.5 + 0.5 * Math.sin(3 * a - t * 0.7 + q * 4))
          hm = Math.max(hm, sstep(0.55, 0.95, 0.5 + 0.5 * Math.sin(a * 2 + q * 5 - t * 0.3)) * ww)
        }
        if (r < 1.1) {
          const d2 = d2c
          if (d2 < 1.2) {
            const sp = 0.5 + 0.5 * Math.sin(3 * Math.atan2(dyc, dxc) + dc * 15 - Ts + 2 * Math.sin(t * 0.7))
            core = ck * (Math.exp(-d2 * (30 - 14 * ex)) * (0.6 + 0.7 * sp) + Math.exp(-d2 * 5) * 0.18 * (0.5 + 0.5 * sp))
          }
        }
        const s = (prev[idx] += (clamp((I + core) * gn * (1 + 0.3 * ex) * fade) - prev[idx]) * 0.45)
        if (s < 0.012) continue
        const D = Math.pow(s, 0.7)
        let g = Math.floor(D * 12.99 + (BAYER[(i & 3) + ((j & 3) << 2)] / 16 - 0.47) * 0.8)
        g = g < 0 ? 0 : g > NR ? NR : g
        if (g === 0) continue
        const lv = Math.round(clamp(D * 1.05 + core * 0.35) * (LV - 1))
        const hue = Math.round(clamp(hm * vio * (1 - clamp(core))) * (HUES - 1))
        ctx.drawImage(atlas, lv * cw, (hue * NR + g - 1) * ch, cw, ch, i * cw, j * ch, cw, ch)
      }
    }
  }

  layout()
  const ro = new ResizeObserver(layout)
  ro.observe(canvas)
  if (follow) window.addEventListener('pointermove', onMove, { passive: true })
  wake()

  return {
    setState(st) {
      if (st === 'dormant') {
        dormant = true
      } else {
        dormant = false
        tgt = PRESETS[st]
        wake()
      }
    },
    setLevel(v) {
      extLevel = clamp(v)
      extAt = performance.now()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      raf = 0
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
    },
  }
}
