import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Glyph } from '../ascii/glyphs'
import { Kbd } from './Markers'

// Fields: borderless Inter inputs after a teal `>` mark (the Spotlight rule).
// 16px input text so iOS/webview zoom never kicks in.

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> {
  className?: string
}

/** The bare borderless input. */
export function Input({ className, ...rest }: InputProps) {
  return <input className={cx('nx-input', className)} autoComplete="off" spellCheck={false} {...rest} />
}

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  className?: string
}

/** The bare borderless textarea, Body sized. */
export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cx('nx-textarea', className)} {...rest} />
}

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  /** Accessible name for the field. */
  label: string
  /** Small hint after the field, e.g. a key. */
  hint?: ReactNode
  className?: string
  onLabelClick?: () => void
}

/** A labelled search row: teal `>` mark, borderless input, optional key hint. */
export function SearchField({ label, hint, className, id, ...rest }: SearchFieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  return (
    <label className={cx('nx-search', className)} htmlFor={inputId}>
      <Glyph name="prompt" className="nx-search-mark" />
      <span className="sr-only">{label}</span>
      <Input id={inputId} {...rest} />
      {hint && <Kbd className="nx-search-hint">{hint}</Kbd>}
    </label>
  )
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
