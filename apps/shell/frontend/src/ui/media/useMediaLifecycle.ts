import { useEffect, useState } from 'react'
import type { AppMode } from '@/apps/types'

export interface MediaLifecycleOptions {
  /** The instance's mode from AppProps — minimized apps must sleep. */
  mode: AppMode
  /** The media element to pause while hidden, if there is one. */
  media?: HTMLMediaElement | null
  /** The scrollable/visible root, for viewport detection. Defaults to the viewport. */
  rootRef?: { current: Element | null }
  /** Pause when less than this fraction is visible. */
  threshold?: number
}

export interface MediaLifecycle {
  /** True when the media should decode and play. */
  active: boolean
  /** True while the box is intersecting the viewport. */
  inView: boolean
}

/**
 * Media sleeps when its widget isn't visible. Widgets stay mounted while minimized
 * (a hidden keep-alive div), so timers, decodes and videos must stop by contract.
 * Large media also yields when scrolled offscreen, and lazy-decodes until then.
 */
export function useMediaLifecycle({ mode, media, rootRef, threshold = 0.1 }: MediaLifecycleOptions): MediaLifecycle {
  const [inView, setInView] = useState(true)

  // The box leaves the viewport: stop decoding.
  useEffect(() => {
    const el = rootRef?.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.intersectionRatio >= threshold),
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [rootRef, threshold])

  const active = mode !== 'minimized' && inView

  // Media that manages itself (video, audio) pauses the moment we sleep.
  useEffect(() => {
    if (!media) return
    if (active) {
      if (media.paused && media.dataset.autoplay === 'true') void media.play().catch(() => {})
    } else {
      media.pause()
    }
  }, [active, media])

  return { active, inView }
}
