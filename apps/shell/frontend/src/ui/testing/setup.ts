import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { installMatchMedia } from './a11y'

// jsdom has no matchMedia; every motion/theme contract reads it. Install the stub
// before any component renders.
installMatchMedia()

// jsdom has neither observer either. Library surfaces that use them (ScrollArea,
// media) must still mount; tests that need to fire entries install their own
// controllable class over these.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
if (typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  } as unknown as typeof IntersectionObserver
}

// Vitest runs without globals, so Testing Library can't auto-register cleanup.
afterEach(() => cleanup())
