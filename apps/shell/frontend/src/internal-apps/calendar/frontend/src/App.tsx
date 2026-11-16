import { useState } from 'react'
import type { AppProps } from '@/apps/types'
import './calendar.css'

// The calendar: the real month, read from the clock. Small sizes show today and
// the month at a glance; the card size can page between months. No fake events —
// scheduling arrives with the agent's memory, not before.

const WDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function CalendarApp({ size }: AppProps) {
  const [offset, setOffset] = useState(0)
  const now = new Date()
  const today = now.getDate()
  const view = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
  const first = view.getDay()
  const month = view.toLocaleString(undefined, { month: 'long' })
  const year = view.getFullYear()
  const isNow = offset === 0

  if (size === '1x1') {
    return (
      <div className="w-cal" data-view="day">
        <span className="w-cal-wday">{now.toLocaleString(undefined, { weekday: 'long' })}</span>
        <span className="w-cal-big">{today}</span>
        <span className="w-cal-sub">
          {month} {year}
        </span>
      </div>
    )
  }

  const cells: Array<number | null> = [...Array<null>(first), ...Array.from({ length: days }, (_, i) => i + 1)]

  if (size === '2x1') {
    return (
      <div className="w-cal" data-view="mini">
        <span className="w-cal-head">
          {month} {year}
        </span>
        <div className="w-cal-grid" data-mini>
          {WDAYS.map((d, i) => (
            <span key={`w${i}`} className="w-cal-w">
              {d}
            </span>
          ))}
          {cells.map((d, i) => (
            <span key={i} className="w-cal-d" data-today={d === today && isNow || undefined}>
              {d ?? ''}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-cal" data-view="month">
      <div className="w-cal-nav">
        <button type="button" className="w-cal-step" aria-label="previous month" onClick={() => setOffset((o) => o - 1)}>
          ‹
        </button>
        <span className="w-cal-head">
          {month} {year}
        </span>
        <button type="button" className="w-cal-step" aria-label="next month" onClick={() => setOffset((o) => o + 1)}>
          ›
        </button>
      </div>
      <div className="w-cal-grid">
        {WDAYS.map((d, i) => (
          <span key={`w${i}`} className="w-cal-w">
            {d}
          </span>
        ))}
        {cells.map((d, i) => (
          <span key={i} className="w-cal-d" data-today={d === today && isNow || undefined}>
            {d ?? ''}
          </span>
        ))}
      </div>
    </div>
  )
}
