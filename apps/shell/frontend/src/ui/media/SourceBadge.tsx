import { Label } from '../components/Text'

export interface SourceBadgeProps {
  /** The domain or evidence ref, e.g. `en.wikipedia.org` or `[3]`. */
  source: string
  /** Full attribution, shown as the tooltip / accessible name. */
  title?: string
  className?: string
}

/**
 * Attribution for fetched content. Mandatory wherever content came from the engine
 * (`fetch_article`, `search_web`, media renderers) — never fake a source.
 */
export function SourceBadge({ source, title, className }: SourceBadgeProps) {
  return (
    <Label
      as="span"
      className={className ?? 'nx-source'}
      title={title ?? source}
      aria-label={title ? `Source: ${title}` : `Source: ${source}`}
    >
      <span aria-hidden="true">›</span> {source}
    </Label>
  )
}
