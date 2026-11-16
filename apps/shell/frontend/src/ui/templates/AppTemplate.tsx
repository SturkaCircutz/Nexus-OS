import type { ReactNode } from 'react'
import { Divider } from '../components/Markers'
import { Label } from '../components/Text'

// AppTemplate: the fullscreen layout. One header row — the app's label on the left
// (content, not window chrome), the app's own actions on the right — then the body.
// Esc-to-exit and the return-to-cell animation are the shell's job, not yours.

export interface AppTemplateProps {
  label: string
  /** The app's own actions (chips, selects) — app content, never window controls. */
  actions?: ReactNode
  meta?: ReactNode
  className?: string
  children?: ReactNode
}

export function AppTemplate({ label, actions, meta, className, children }: AppTemplateProps) {
  return (
    <div className={className ?? 'nx-app'}>
      <header className="nx-app-head">
        <div className="nx-app-head-title">
          <Label className="nx-app-label">{label}</Label>
          {meta && <span className="nx-app-meta">{meta}</span>}
        </div>
        {actions && <div className="nx-app-actions">{actions}</div>}
      </header>
      <Divider className="nx-app-rule" />
      <div className="nx-app-body">{children}</div>
    </div>
  )
}
