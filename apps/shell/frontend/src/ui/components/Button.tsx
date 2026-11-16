import type { ButtonHTMLAttributes, ReactNode } from 'react'

// The pressable unit. One control, small surface: mono label, 1px rule border,
// hover fills with paper, pressed inverts to ink, action uses teal text. Feedback
// starts on pointer-down (scale .97), never on release.

type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

export interface ButtonProps extends Native {
  /** 'action' marks the primary verb with teal text (the One-Accent rule). */
  variant?: 'default' | 'action'
  /** Toggled state: inverts to ink while on (sets aria-pressed). */
  pressed?: boolean
  className?: string
  children?: ReactNode
}

export function Button({ variant = 'default', pressed, className, type = 'button', ...rest }: ButtonProps) {
  const classes = [
    'chip',
    variant === 'action' ? 'chip--action' : '',
    className ?? '',
  ]
  return <button type={type} className={classes.filter(Boolean).join(' ')} aria-pressed={pressed} {...rest} />
}

/** Glyph-only chip. Always pass an accessible name — the glyph is decoration. */
export interface IconButtonProps extends Native {
  /** Accessible name; the glyph is aria-hidden. */
  label: string
  className?: string
  children?: ReactNode
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx('chip nx-icon-btn', className)} aria-label={label} title={label} {...rest}>
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
