import { Kbd, Radio, RadioGroup, SettingsRow, SettingsSection, SettingsTemplate, useDesktopInstances } from '@/ui'
import { useTheme, type ThemeChoice } from '@/theme'
import type { AppProps } from '@/apps/types'
import './settings.css'

// Settings: the switches a user can actually turn today (the theme) plus honest
// desk facts and the shell's keys, laid out with SettingsTemplate. More preferences
// arrive with each subsystem; every one must be a real switch, never decoration.

const THEMES: Array<{ id: ThemeChoice; label: string }> = [
  { id: 'light', label: 'paper' },
  { id: 'dark', label: 'ink' },
  { id: 'system', label: 'system' },
]

const KEYS: Array<[keys: string, does: string]> = [
  ['⌘K', 'spotlight'],
  ['⌘M', 'minimize focused'],
  ['⌘↵', 'fullscreen focused'],
  ['esc', 'leave fullscreen'],
  ['⌘.', 'summon the dock'],
]

const isChoice = (v: string): v is ThemeChoice => THEMES.some((t) => t.id === v)

export function SettingsApp({ size }: AppProps) {
  const { choice, setTheme } = useTheme()
  const instances = useDesktopInstances()
  const wide = size !== '1x1'

  const themes = (
    <RadioGroup label="theme" value={choice} onChange={(v) => isChoice(v) && setTheme(v)} className="w-settings-themes">
      {THEMES.map((t) => (
        <Radio key={t.id} value={t.id} label={t.label} />
      ))}
    </RadioGroup>
  )

  // 1x1: just the theme — the one switch that matters — with no row chrome.
  if (!wide) {
    return (
      <SettingsTemplate>
        <SettingsSection title="theme">{themes}</SettingsSection>
      </SettingsTemplate>
    )
  }

  return (
    <SettingsTemplate>
      <SettingsSection title="appearance">
        <SettingsRow label="theme" hint="system follows your OS">
          {themes}
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="desk">
        <SettingsRow label="widgets open">{instances.length}</SettingsRow>
        <SettingsRow label="grid">6 × 4</SettingsRow>
      </SettingsSection>
      <SettingsSection title="keys">
        {KEYS.map(([keys, does]) => (
          <SettingsRow key={keys} label={does}>
            <Kbd>{keys}</Kbd>
          </SettingsRow>
        ))}
      </SettingsSection>
    </SettingsTemplate>
  )
}
