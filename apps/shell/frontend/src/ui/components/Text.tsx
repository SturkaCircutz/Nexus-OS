import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

// Typography: exactly DESIGN.md's hierarchy, componentized. Text styles prose
// (Inter); Mono/Label/Micro carry data, labels and keys (JetBrains Mono). Every
// component maps to a token, so both themes come for free.

type Element = 'p' | 'span' | 'div' | 'pre' | 'code' | 'output'

interface TextProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'style' | 'as'> {
  as?: Element
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** Body prose: Inter 400, 14/1.5. */
export function Text({ as = 'p', className, ...rest }: TextProps) {
  return <Nx as={as} className={cx('nx-text', className)} {...rest} />
}

/** Agent replies: Inter 400, 13/1.45. */
export function Bubble({ as = 'p', className, ...rest }: TextProps) {
  return <Nx as={as} className={cx('nx-bubble-text', className)} {...rest} />
}

/** Data blocks, terminal output, glyphs: JetBrains Mono 400, 12/1.7, tabular. */
export function Mono({ as = 'pre', className, ...rest }: TextProps) {
  return <Nx as={as} className={cx('nx-mono', className)} {...rest} />
}

/** Frame labels, chips, the menu bar: JetBrains Mono 400, 11, 0.04em. */
export function Label({ as = 'span', className, ...rest }: TextProps) {
  return <Nx as={as} className={cx('nx-label', className)} {...rest} />
}

/** Group names and keys: JetBrains Mono 400, 10, 0.06em. */
export function Micro({ as = 'span', className, ...rest }: TextProps) {
  return <Nx as={as} className={cx('nx-micro', className)} {...rest} />
}

function Nx({ as, className, ...rest }: TextProps & { as: Element }) {
  const Tag = as
  return <Tag className={className} {...rest} />
}

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(' ')
}
