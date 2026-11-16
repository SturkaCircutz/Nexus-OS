import type { ReactNode } from 'react'
import type { Size } from '@/wm/layout'
import { EmptyState } from '../overlays/EmptyState'

// WidgetTemplate: maps the size prop to content. "sizes is a promise" — every size
// listed in the registry must have a designed layout. This makes that mapping
// declarative, with a default and an empty state so nothing silently renders blank.

export interface WidgetTemplateProps {
  size: Size
  /** Content per size. Missing sizes fall back to `fallback`, then empty. */
  content: Partial<Record<Size, ReactNode>>
  /** Used when the current size has no entry. */
  fallback?: ReactNode
  /** Shown when there is nothing to show at all. */
  empty?: ReactNode
  className?: string
}

export function WidgetTemplate({ size, content, fallback, empty, className }: WidgetTemplateProps) {
  const view = content[size] ?? fallback
  return (
    <div className={className ?? 'nx-widget'}>
      {view ?? <EmptyState hint={empty ?? 'nothing here yet'} />}
    </div>
  )
}
