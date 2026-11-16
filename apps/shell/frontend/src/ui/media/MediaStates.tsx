import type { ReactNode } from 'react'
import { AsciiSpinner } from '../ascii/AsciiSpinner'
import { EmptyState } from '../overlays/EmptyState'
import { Button } from '../components/Button'
import { Label } from '../components/Text'

// The three states every media surface wears. No custom skeletons anywhere: if a
// widget shows async media, it shows these.

export interface MediaStatesProps {
  state: 'loading' | 'error' | 'empty'
  /** Shown on error next to the retry chip. */
  message?: string
  /** Shown for empty, defaults to "nothing here yet". */
  emptyHint?: ReactNode
  onRetry?: () => void
  className?: string
}

export function MediaStates({ state, message, emptyHint, onRetry, className }: MediaStatesProps) {
  if (state === 'loading') {
    return (
      <div className={className ?? 'nx-media-state'} role="status" aria-label="loading">
        <div className="nx-media-skeleton" aria-hidden="true" />
        <AsciiSpinner label="loading" />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className={className ?? 'nx-media-state'} role="alert">
        <Label className="nx-media-error">
          <span aria-hidden="true" className="nx-media-error-mark">
            x
          </span>
          {message ?? "couldn't load that."}
        </Label>
        {onRetry && (
          <Button variant="action" onClick={onRetry}>
            try again
          </Button>
        )}
      </div>
    )
  }
  return <EmptyState hint={emptyHint} className={className} />
}
