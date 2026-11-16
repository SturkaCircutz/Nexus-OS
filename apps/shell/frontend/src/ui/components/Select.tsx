import { useState, type KeyboardEvent } from 'react'
import { Popover, type PopoverTriggerProps } from './Popover'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  /** Accessible name of the control. */
  label: string
  value: string | null
  options: SelectOption[]
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

/**
 * A select that is a popover of mono rows. Arrow keys move, Enter chooses, typing
 * jumps to a matching option, Escape closes and returns focus to the trigger.
 */
export function Select({ label, value, options, onChange, className, placeholder = 'choose…' }: SelectProps) {
  const [active, setActive] = useState(0)

  return (
    <Popover
      label={label}
      className={className}
      align="start"
      panelClassName="nx-select"
      trigger={(props: PopoverTriggerProps) => (
        <button type="button" className="chip nx-select-btn" aria-label={label} {...props}>
          <span className="nx-select-value">{current(options, value)?.label ?? placeholder}</span>
          <span aria-hidden="true" className="nx-select-caret">
            v
          </span>
        </button>
      )}
    >
      {(close) => (
        <SelectList
          label={label}
          options={options}
          value={value}
          onPick={(option) => {
            onChange(option.value)
            close()
          }}
          onActive={setActive}
        />
      )}
    </Popover>
  )
}

function SelectList({
  label,
  options,
  value,
  onPick,
  onActive,
}: {
  label: string
  options: SelectOption[]
  value: string | null
  onPick: (option: SelectOption) => void
  onActive: (i: number) => void
}) {
  const [active, setActive] = useState(0)
  const i = Math.min(active, options.length - 1)
  const current = options[i]
  const set = (next: number) => {
    setActive(next)
    onActive(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      set(step(options, i, e.key === 'ArrowDown' ? 1 : options.length - 1))
    } else if (e.key === 'Enter' && current) {
      e.preventDefault()
      onPick(current)
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typeahead: jump to the first option starting with the typed character.
      const ch = e.key.toLowerCase()
      const found = options.findIndex((o) => o.label.toLowerCase().startsWith(ch))
      if (found >= 0) {
        e.preventDefault()
        set(found)
      }
    }
  }

  return (
    <ul
      className="nx-select-list"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={current ? `nx-select-opt-${current.value}` : undefined}
      onKeyDown={onKeyDown}
    >
      {options.map((option, n) => (
        <li
          key={option.value}
          id={`nx-select-opt-${option.value}`}
          role="option"
          aria-selected={option.value === value}
          data-active={n === i || undefined}
          className="nx-select-option"
          onPointerMove={() => n !== i && set(n)}
          onClick={() => onPick(option)}
        >
          <span aria-hidden="true" className="nx-select-mark">
            {option.value === value ? '>' : '  '}
          </span>
          {option.label}
        </li>
      ))}
    </ul>
  )
}

function current(options: SelectOption[], value: string | null) {
  return options.find((o) => o.value === value)
}

function step(list: SelectOption[], i: number, dir: number) {
  if (!list.length) return 0
  return (Math.min(i, list.length - 1) + dir) % list.length
}
