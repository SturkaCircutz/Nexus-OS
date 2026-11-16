// Accessibility test helpers: the reduced-motion / reduced-transparency / contrast
// contracts all run through matchMedia, so the tests get a controllable stub.

type ChangeListener = (event: { matches: boolean }) => void

const listeners = new Set<{ query: string; listener: ChangeListener }>()

let reduced = false
let transparency = true
let contrast = false

function evaluate(query: string): boolean {
  if (query.includes('prefers-reduced-motion')) return reduced
  if (query.includes('prefers-reduced-transparency')) return !transparency
  if (query.includes('prefers-contrast')) return contrast && query.includes('more')
  if (query.includes('prefers-color-scheme')) return query.includes('dark') && false // light by default
  return false
}

/** Installs the matchMedia stub. Called once from testing/setup.ts. */
export function installMatchMedia() {
  const impl = (query: string) => ({
    media: query,
    matches: evaluate(query),
    onchange: null,
    addEventListener: (_: string, listener: ChangeListener) => listeners.add({ query, listener }),
    removeEventListener: (_: string, listener: ChangeListener) => {
      for (const entry of listeners) if (entry.listener === listener) listeners.delete(entry)
    },
    addListener: (listener: ChangeListener) => listeners.add({ query, listener }),
    removeListener: (listener: ChangeListener) => {
      for (const entry of listeners) if (entry.listener === listener) listeners.delete(entry)
    },
    dispatchEvent: () => false,
  })
  Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: impl })
}

function notify(query: string, matches: boolean) {
  for (const entry of [...listeners]) {
    if (entry.query === query) entry.listener({ matches })
  }
}

/** Set the reduced-motion preference. Components must react, not just mount right. */
export function setReducedMotion(value: boolean) {
  reduced = value
  notify('(prefers-reduced-motion: reduce)', value)
}

export function getReducedMotion() {
  return reduced
}

/** Transparency is on by default; false exercises the solid-glass fallback. */
export function setReducedTransparency(value: boolean) {
  transparency = !value
  notify('(prefers-reduced-transparency: reduce)', value)
}

/** Higher contrast: glass goes solid, borders go ink. */
export function setMoreContrast(value: boolean) {
  contrast = value
  notify('(prefers-contrast: more)', value)
}

/** Runs `fn` with reduced motion on, restoring the previous value after. */
export async function withReducedMotion(fn: () => void | Promise<void>) {
  const before = reduced
  setReducedMotion(true)
  try {
    await fn()
  } finally {
    setReducedMotion(before)
  }
}
