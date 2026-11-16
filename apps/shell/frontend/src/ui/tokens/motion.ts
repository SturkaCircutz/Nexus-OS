// Motion timing tokens for JS, mirroring the --dur-* custom properties in tokens.css.
// Springs live in ../motion/spring.ts; RAF frame sequences use ../motion/timeline.ts.

export const DUR = {
  /** Popovers, pickers, any small surface appearing. */
  pop: 160,
  /** The reduced-motion stand-in for travel. */
  fade: 180,
  /** Toast leave animation. */
  toast: 300,
} as const

/** Frame time for spinner/face frames (blink, talk, think). */
export const FRAME_MS = 110

/** Characters per tick while a reply types in, and how long it stays after. */
export const TYPE_MS = 18
export const STAY_MS = 6000
