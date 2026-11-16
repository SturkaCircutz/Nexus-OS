import { useEffect, useState } from 'react'
import type { AppProps } from '@/apps/types'
import type { Size } from '@/wm/layout'
import { Button, useAppActions } from '@/ui'
import './timer.css'

// The timer: a countdown that keeps counting while minimized (the deadline is
// wall-clock time) and persists to localStorage. Built from the UI library and the
// registry contract — no window-manager imports.

type Layout = 'small' | 'large'
const LAYOUT: Partial<Record<Size, Layout>> = { '1x1': 'small', '2x1': 'large' }

interface Saved {
  remainingMs: number
  running: boolean
  endsAt: number | null
}

const STORAGE_KEY = 'nexus-timer'
const DEFAULT: Saved = { remainingMs: 5 * 60_000, running: false, endsAt: null }

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return raw && typeof raw.remainingMs === 'number' ? raw : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function TimerApp({ size, mode }: AppProps) {
  const layout = LAYOUT[size] ?? 'large'
  const [saved, setSaved] = useState<Saved>(load)
  const { remainingMs, running } = saved
  const actions = useAppActions('timer')

  // One effect drives both running and paused states; cleaned up on unmount. The
  // deadline is wall-clock time, so a running timer keeps counting honestly while
  // the widget sits minimized in the dock.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setSaved((s) => {
        const left = s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remainingMs
        return { ...s, remainingMs: left, running: left > 0, endsAt: left > 0 ? s.endsAt : null }
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [running])

  const persist = (next: Saved) => {
    setSaved(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable; keep it in memory */
    }
  }

  const start = () => persist({ ...saved, running: true, endsAt: Date.now() + saved.remainingMs })
  const pause = () => persist({ ...saved, running: false, endsAt: null })
  const reset = () => persist({ ...DEFAULT })

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')
  const untouched = !running && remainingMs === DEFAULT.remainingMs

  return (
    <div className={`nx-timer nx-timer--${layout}`}>
      <output
        className="nx-timer-time"
        aria-label={remainingMs === 0 ? 'Timer finished' : `Timer, ${mm} minutes ${ss} seconds remaining`}
      >
        {mm}:{ss}
      </output>
      <div className="nx-timer-actions">
        {running ? (
          <Button onClick={pause}>pause</Button>
        ) : remainingMs === 0 ? (
          <Button variant="action" onClick={reset}>
            reset
          </Button>
        ) : (
          <Button variant="action" onClick={start}>
            start
          </Button>
        )}
        <Button onClick={reset} disabled={untouched}>
          reset
        </Button>
        {mode === 'widget' && (
          <Button onClick={actions.requestMinimize} aria-label="Hide the timer in the dock">
            hide
          </Button>
        )}
      </div>
    </div>
  )
}
