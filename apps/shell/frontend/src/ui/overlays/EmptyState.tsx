import type { ReactNode } from 'react'
import { Label } from '../components/Text'

/** The "nothing here yet" pattern: a quiet mono line for empty surfaces. */
export function EmptyState({ hint, className }: { hint?: ReactNode; className?: string }) {
  return (
    <div className={className ? `nx-empty ${className}` : 'nx-empty'}>
      <Label>{hint ?? 'nothing here yet'}</Label>
    </div>
  )
}
