import { createContext, useContext, useId, type ReactNode } from 'react'

// Character-marked state: chars before color, always. `[x]`/`[ ]` for checkboxes and
// switches, `>` for the selected radio. Teal only marks focus, via :focus-visible.

export interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

/** `[x]` when on, `[ ]` when off. */
export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx('nx-mark', className)}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
    >
      <span aria-hidden="true" className="nx-mark-glyph">
        {checked ? '[x]' : '[ ]'}
      </span>
      <span className="nx-mark-label">{label}</span>
    </button>
  )
}

export interface RadioGroupProps {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  className?: string
}

/** Wraps radios with radiogroup semantics and roving focus between them. */
export function RadioGroup({ label, value, onChange, children, className }: RadioGroupProps) {
  return (
    <RadioContext.Provider value={{ value, onChange }}>
      <div role="radiogroup" aria-label={label} className={cx('nx-radiogroup', className)}>
        {children}
      </div>
    </RadioContext.Provider>
  )
}

export interface RadioProps {
  value: string
  label: string
  disabled?: boolean
  className?: string
}

/** `>` marks the chosen row; arrows move between the group's radios. */
export function Radio({ value, label, disabled, className }: RadioProps) {
  const group = useContext(RadioContext)
  if (!group) throw new Error('<Radio> must be used inside <RadioGroup>')
  const selected = group.value === value
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      aria-label={label}
      disabled={disabled}
      data-radio-value={value}
      className={cx('nx-mark', className)}
      onClick={() => group.onChange(value)}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')
        if (!radios?.length) return
        const list = [...radios]
        const i = list.indexOf(e.currentTarget)
        const next = list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]
        next?.focus()
        group.onChange(next?.dataset.radioValue ?? group.value)
      }}
    >
      <span aria-hidden="true" className="nx-mark-glyph">
        {selected ? ' > ' : '   '}
      </span>
      <span className="nx-mark-label">{label}</span>
    </button>
  )
}

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

/** `[x] on` / `[ ] off` — the switch is a checkbox that says its state out loud. */
export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={id}
      disabled={disabled}
      className={cx('nx-mark', className)}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" className="nx-mark-glyph">
        {checked ? '[x]' : '[ ]'}
      </span>
      <span className="nx-mark-label">{label}</span>
      <span id={id} aria-hidden="true" className="nx-mark-state">
        {checked ? 'on' : 'off'}
      </span>
    </button>
  )
}

const RadioContext = createContext<{ value: string; onChange: (v: string) => void } | null>(null)

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
