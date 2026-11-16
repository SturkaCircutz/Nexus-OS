import { useEffect, useState } from 'react'
import { useReducedMotion } from '@/theme'

const FRAMES = ['|', '/', '-', '\\']
const STEP_MS = 110

/** A one-character ASCII spinner. Shows a still dot when motion is reduced. */
export function AsciiSpinner({ label = 'working' }: { label?: string }) {
  const reduced = useReducedMotion()
  const [n, setN] = useState(0)

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setN((v) => (v + 1) % FRAMES.length), STEP_MS)
    return () => window.clearInterval(id)
  }, [reduced])

  return (
    <span className="ascii-spinner">
      <span aria-hidden="true">{reduced ? '·' : FRAMES[n]}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
