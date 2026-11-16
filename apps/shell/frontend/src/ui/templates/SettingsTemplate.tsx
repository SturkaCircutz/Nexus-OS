import { useId, type ReactNode } from 'react'
import { ScrollArea, Section } from '../components/Layout'

// SettingsTemplate: the layout every preferences surface shares (plan §3.H).
// Sections (mono label + rule) hold rows; a row is label / control / hint. The row
// is a named group, so a screen reader hears "theme, group" before the control and
// the hint as its description. Rows wrap: wide cells put the control beside the
// label, a 1x1 stacks it underneath. Every row must be a real switch or an honest
// readout — never decoration.

export interface SettingsTemplateProps {
  /** Names the scroll region for screen readers. */
  label?: string
  className?: string
  children?: ReactNode
}

/**
 * The scrolling column of settings sections. Settings outgrow small cells, so the
 * column sits in a ScrollArea: fade masks show there is more, and it is keyboard
 * scrollable once focused.
 */
export function SettingsTemplate({ label = 'settings', className, children }: SettingsTemplateProps) {
  return (
    <ScrollArea label={label} className={className ? `nx-settings ${className}` : 'nx-settings'}>
      <div className="nx-settings-column">{children}</div>
    </ScrollArea>
  )
}

export interface SettingsSectionProps {
  title: string
  className?: string
  children?: ReactNode
}

/** A labelled group of rows. */
export function SettingsSection({ title, className, children }: SettingsSectionProps) {
  return (
    <Section title={title} className={className ? `nx-settings-section ${className}` : 'nx-settings-section'}>
      <div className="nx-settings-rows">{children}</div>
    </Section>
  )
}

export interface SettingsRowProps {
  label: string
  /** One short line explaining the setting; becomes the row's description. */
  hint?: ReactNode
  className?: string
  /** The control (Switch, RadioGroup, Select…) or a read-only value. */
  children?: ReactNode
}

/** One setting: label and hint on the left, the control on the right (or below). */
export function SettingsRow({ label, hint, className, children }: SettingsRowProps) {
  const id = useId()
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      className={className ? `nx-setting ${className}` : 'nx-setting'}
    >
      <div className="nx-setting-text">
        <span id={labelId} className="nx-setting-label">
          {label}
        </span>
        {hint && (
          <span id={hintId} className="nx-setting-hint">
            {hint}
          </span>
        )}
      </div>
      <div className="nx-setting-control">{children}</div>
    </div>
  )
}
