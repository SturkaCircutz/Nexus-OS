import { useRef } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { useMediaLifecycle, type MediaLifecycle } from '@/ui'
import type { MediaLifecycleOptions } from './useMediaLifecycle'
import type { AppMode } from '@/apps/types'

// A controllable IntersectionObserver: tests fire entries at the hook directly.
class FakeIO {
  static instances: FakeIO[] = []
  private cb: IntersectionObserverCallback
  els: Element[] = []
  threshold: number | number[] | null
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.cb = cb
    this.threshold = options?.threshold ?? null
    FakeIO.instances.push(this)
  }
  observe(el: Element) {
    this.els.push(el)
  }
  unobserve() {}
  disconnect() {}
  fire(ratio: number) {
    this.cb(
      [{ intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

function fakeMedia() {
  return {
    paused: true,
    dataset: { autoplay: 'true' },
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  } as unknown as HTMLMediaElement
}

beforeAll(() => {
  ;(window as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO
})

describe('useMediaLifecycle', () => {
  it('is active for a visible widget and sleeps when minimized', () => {
    const media = fakeMedia()
    const { result, rerender } = renderHook(
      (p: Partial<MediaLifecycleOptions> & { mode: AppMode }) => useMediaLifecycle(p),
      { initialProps: { mode: 'widget', media } },
    )
    expect(result.current.active).toBe(true)
    expect(result.current.inView).toBe(true)
    rerender({ mode: 'minimized', media })
    expect(result.current.active).toBe(false)
    expect(media.pause).toHaveBeenCalled()
  })

  it('resumes media that manages itself when it wakes', () => {
    const media = fakeMedia()
    const { rerender } = renderHook(
      (p: Partial<MediaLifecycleOptions> & { mode: AppMode }) => useMediaLifecycle(p),
      { initialProps: { mode: 'minimized', media } },
    )
    rerender({ mode: 'fullscreen', media })
    expect(media.play).toHaveBeenCalled()
  })

  it('yields when its box leaves the viewport', () => {
    FakeIO.instances.length = 0
    const media = fakeMedia()
    let latest: MediaLifecycle | null = null
    function Harness({ mode }: { mode: AppMode }) {
      const ref = useRef<HTMLDivElement>(null)
      const state = useMediaLifecycle({ mode, media, rootRef: ref })
      latest = state
      return <div ref={ref} />
    }
    const { rerender } = render(<Harness mode="widget" />)
    expect(FakeIO.instances.length).toBe(1)
    const io = FakeIO.instances[0]

    act(() => io.fire(0.05)) // below the default 0.1 threshold
    expect(latest!.inView).toBe(false)
    expect(latest!.active).toBe(false)
    expect(media.pause).toHaveBeenCalled()

    act(() => io.fire(0.5))
    expect(latest!.inView).toBe(true)
    expect(latest!.active).toBe(true)
    expect(media.play).toHaveBeenCalled()

    rerender(<Harness mode="minimized" />)
    expect(latest!.active).toBe(false)
  })

  it('honours a custom threshold', () => {
    FakeIO.instances.length = 0
    function Harness() {
      const ref = useRef<HTMLDivElement>(null)
      useMediaLifecycle({ mode: 'widget', threshold: 0.25, rootRef: ref })
      return <div ref={ref} />
    }
    render(<Harness />)
    const io = FakeIO.instances.at(-1)!
    expect(io.els.length).toBe(1)
    expect(io.threshold).toBe(0.25)
  })
})
