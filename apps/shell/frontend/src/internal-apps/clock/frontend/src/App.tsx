import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { AppProps } from '@/apps/types'
import type { Size } from '@/wm/layout'
import './clock.css'

export type ClockSize = 'small' | 'medium' | 'large'

/** Preset footprint of each size in desktop grid cells (columns x rows). */
export const CLOCK_GRID_SIZES: Record<ClockSize, { w: number; h: number }> = {
  small: { w: 1, h: 1 },
  medium: { w: 2, h: 1 },
  large: { w: 2, h: 2 },
}

const CLOCK_SIZE: Partial<Record<Size, ClockSize>> = { '1x1': 'small', '2x1': 'medium', '2x2': 'large' }

/** Shell entry point: maps the grid size to a clock layout. */
export function ClockApp({ size }: AppProps) {
  return <ClockWidget size={CLOCK_SIZE[size] ?? 'large'} />
}

interface ClockWidgetProps {
  /** Fixed size. Leave unset to pick a size from the space the widget is given. */
  size?: ClockSize
  /** true = 12-hour, false = 24-hour, unset = follow the user's locale. */
  hour12?: boolean
  showSeconds?: boolean
}

export function ClockWidget({ size, hour12, showSeconds = false }: ClockWidgetProps) {
  const now = useNow()
  const ref = useRef<HTMLDivElement>(null)
  const measured = useContainerSize(ref)
  const activeSize = size ?? measured

  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: hour12 === false ? '2-digit' : 'numeric',
        minute: '2-digit',
        second: showSeconds ? '2-digit' : undefined,
        hour12,
      }),
    [hour12, showSeconds],
  )
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  )

  const { time, period } = splitTime(timeFormat, now)
  const date = dateFormat.format(now)

  return (
    <div ref={ref} className={`nexus-clock nexus-clock--${activeSize}`}>
      <time className="nexus-clock-face" dateTime={now.toISOString()} aria-label={`${time} ${period}, ${date}`}>
        {activeSize === 'large' && <AnalogFace now={now} />}
        <span className="nexus-clock-time" aria-hidden="true">
          {time}
          {period && <span className="nexus-clock-period">{period}</span>}
        </span>
        {activeSize !== 'small' && (
          <span className="nexus-clock-date" aria-hidden="true">
            {date}
          </span>
        )}
      </time>
    </div>
  )
}

function AnalogFace({ now }: { now: Date }) {
  const s = now.getSeconds()
  const m = now.getMinutes()
  const h = now.getHours() % 12
  const secondAngle = s * 6
  const minuteAngle = m * 6 + s * 0.1
  const hourAngle = h * 30 + m * 0.5

  return (
    <svg className="nexus-clock-analog" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="nexus-clock-dial" cx="50" cy="50" r="47" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          className={i % 3 === 0 ? 'nexus-clock-tick nexus-clock-tick--major' : 'nexus-clock-tick'}
          x1="50"
          y1="7"
          x2="50"
          y2={i % 3 === 0 ? 14 : 11}
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <line className="nexus-clock-hand nexus-clock-hand--hour" x1="50" y1="50" x2="50" y2="27" transform={`rotate(${hourAngle} 50 50)`} />
      <line className="nexus-clock-hand nexus-clock-hand--minute" x1="50" y1="50" x2="50" y2="16" transform={`rotate(${minuteAngle} 50 50)`} />
      <line className="nexus-clock-hand nexus-clock-hand--second" x1="50" y1="56" x2="50" y2="12" transform={`rotate(${secondAngle} 50 50)`} />
      <circle className="nexus-clock-pin" cx="50" cy="50" r="2" />
    </svg>
  )
}

/** Current time, re-rendered on each second boundary. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number
    const tick = () => {
      const d = new Date()
      setNow(d)
      timer = window.setTimeout(tick, 1000 - d.getMilliseconds())
    }
    timer = window.setTimeout(tick, 1000 - new Date().getMilliseconds())
    return () => window.clearTimeout(timer)
  }, [])

  return now
}

/** Picks a clock size from the element's current width and height. */
function useContainerSize(ref: RefObject<HTMLDivElement | null>): ClockSize {
  const [size, setSize] = useState<ClockSize>('medium')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (width: number, height: number) => {
      const wide = width >= 240
      const tall = height >= 240
      setSize(wide && tall ? 'large' : wide ? 'medium' : 'small')
    }
    const rect = el.getBoundingClientRect()
    update(rect.width, rect.height)
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}

/** Splits "9:05 PM" into the time and the AM/PM part so they can be styled separately. */
function splitTime(format: Intl.DateTimeFormat, date: Date) {
  const parts = format.formatToParts(date)
  const period = parts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  const time = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim()
  return { time, period }
}
