// The icon system: ASCII marks, not an icon font. Every glyph the shell names things
// with lives here, so apps never hardcode characters (and the language can't drift).

/** App marks — the 3–5 character bracket glyph each registry entry declares. */
export const APP_GLYPH = {
  clock: '(:)',
  notes: '[=]',
  files: '[/]',
  terminal: '[>]',
  monitor: '[#]',
  timer: '[t]',
} as const

/** System marks. `x` is the error mark; `>` is the prompt and the selection mark. */
export const MARKS = {
  prompt: '>',
  error: 'x',
  search: '(?)',
  dot: '·',
  bullet: 'o',
} as const

/** Key glyphs for hints and footers. */
export const KEYS = {
  up: '↑',
  down: '↓',
  enter: '↵',
  esc: 'esc',
} as const

export type AppGlyphName = keyof typeof APP_GLYPH
export type MarkName = keyof typeof MARKS
export type KeyName = keyof typeof KEYS
export type GlyphName = AppGlyphName | MarkName | KeyName

const ALL: Record<GlyphName, string> = { ...APP_GLYPH, ...MARKS, ...KEYS }

/** An ASCII mark. Decorative by default; pass `label` to name it for screen readers. */
export function Glyph({
  name,
  label,
  className,
}: {
  name: GlyphName
  label?: string
  className?: string
}) {
  return (
    <span className={className ? `nx-glyph ${className}` : 'nx-glyph'} aria-hidden={label ? undefined : true}>
      {ALL[name]}
      {label && <span className="sr-only">{label}</span>}
    </span>
  )
}
