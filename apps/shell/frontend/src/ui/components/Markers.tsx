import type { HTMLAttributes, ReactNode } from 'react'

// Small marker components: the rule line, the label chip, the key hint, the spinner
// wrapper and the progress meter. All surface, no behavior.

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: 'horizontal' | 'vertical'
}

/** The rule line. Generalizes the dock's separator. */
export function Divider({ orientation = 'horizontal', className, ...rest }: DividerProps) {
  return <hr className={cx('nx-divider', orientation === 'vertical' && 'nx-divider--v', className)} {...rest} />
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 'accent' marks agent-at-work / focus; default is a neutral label. */
  tone?: 'default' | 'accent'
  children?: ReactNode
}

/** A label chip: mono Label in a rule border. */
export function Badge({ tone = 'default', className, ...rest }: BadgeProps) {
  return <span className={cx('nx-badge', tone === 'accent' && 'nx-badge--accent', className)} {...rest} />
}

/** An inline key hint. Inside chrome, chrome.css shrinks it. */
export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx('nx-kbd', className)} {...rest} />
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
