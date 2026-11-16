import { useId, type ReactNode } from 'react'
import { AsciiMeter } from '../ascii/AsciiMeter'
import { AsciiSpinner } from '../ascii/AsciiSpinner'
import { Label } from './Text'

// Status surfaces: loading, progress and their accessible wrappers.

/** AsciiSpinner plus an announced status. Render it where work is happening. */
export function Spinner({ label = 'working', className }: { label?: string; className?: string }) {
  return (
    <span className={className} role="status">
      <AsciiSpinner label={label} />
      <Label className="nx-spinner-label">{label}</Label>
    </span>
  )
}

/**
 * A progress meter with the right semantics: wraps AsciiMeter and announces the
 * value with role="progressbar". The visible bar is decorative.
 */
export function Meter({
  label,
  value,
  max = 100,
  width = 10,
  showValue = true,
  className,
}: {
  /** Accessible name, e.g. "CPU use". */
  label: string
  value: number
  max?: number
  width?: number
  showValue?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <span
      id={id}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round((Math.min(max, Math.max(0, value)) / max) * 100)}
      className={className}
    >
      <AsciiMeter label={label} value={value} max={max} width={width} showValue={showValue} />
    </span>
  )
}

/** Centered loading state for surfaces with room to breathe. */
export function Loading({ label = 'loading', hint, children }: { label?: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="nx-loading" role="status">
      <Spinner label={label} />
      {hint && <Label className="nx-loading-hint">{hint}</Label>}
      {children}
    </div>
  )
}
