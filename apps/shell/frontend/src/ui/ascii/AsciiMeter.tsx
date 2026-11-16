import { useReducedMotion } from '@/theme'

/**
 * The ASCII bar meter: `[####....] 42%`. Extracted from the system monitor so every
 * reading, progress and threshold in the shell looks the same. Reduced motion keeps
 * it still (it only changes when the value does).
 */
export function AsciiMeter({
  label,
  value,
  max = 100,
  width = 10,
  showValue = true,
  formatValue = (v) => String(Math.round(v)),
  className,
}: {
  label?: string
  value: number
  max?: number
  /** Bar length in characters. */
  width?: number
  showValue?: boolean
  formatValue?: (v: number) => string
  className?: string
}) {
  const reduced = useReducedMotion()
  void reduced // meters are still by nature; the hook documents the contract
  const clamped = Math.min(max, Math.max(0, value))
  const filled = Math.round((clamped / max) * width)
  const bar = '#'.repeat(filled) + '.'.repeat(width - filled)
  const head = label ? `${label} ` : ''
  const tail = showValue ? ` ${formatValue(clamped)}` : ''
  return (
    <span className={className ? `nx-ameter ${className}` : 'nx-ameter'}>
      {head}
      <span aria-hidden="true">[{bar}]</span>
      {tail}
    </span>
  )
}
