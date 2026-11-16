import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button } from '../components/Button'
import { SearchField } from '../components/Input'
import { Spinner } from '../components/Status'

export interface PromptInputProps {
  /** Called with the trimmed text on submit. */
  onSubmit: (text: string) => void
  placeholder?: string
  label?: string
  submitLabel?: string
  /** While busy, the submit chip shows a spinner and input keeps its value. */
  busy?: boolean
  className?: string
  autoFocus?: boolean
}

/**
 * The ask field: a teal `>` mark, a borderless input, Enter to send. Used by the
 * assistant surfaces; Spotlight is the reference implementation.
 */
export function PromptInput({
  onSubmit,
  placeholder = 'ask nexus…',
  label = 'Ask Nexus',
  submitLabel = 'ask',
  busy = false,
  className,
  autoFocus,
}: PromptInputProps) {
  const [text, setText] = useState('')

  const send = () => {
    const value = text.trim()
    if (!value || busy) return
    onSubmit(value)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const formSubmit = (e: FormEvent) => {
    e.preventDefault()
    send()
  }

  return (
    <form className={className ?? 'nx-prompt'} onSubmit={formSubmit}>
      <SearchField
        label={label}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button variant="action" type="submit" disabled={!text.trim() || busy} aria-label={submitLabel}>
        {busy ? <Spinner label={submitLabel} /> : submitLabel}
      </Button>
    </form>
  )
}
