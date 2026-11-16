import { useDesktopInstances } from '@/ui'
import { useTheme, type Theme } from '@/theme'
import type { AppProps } from '@/apps/types'
import './settings.css'

// Settings: the few things a user can actually turn today — the theme — plus
// honest desk facts and the shell's keys. More preferences arrive with each
// subsystem; every one must be a real switch, never decoration.

const THEMES: Array<{ id: Theme; label: string }> = [
  { id: 'light', label: 'paper' },
  { id: 'dark', label: 'ink' },
]

export function SettingsApp({ size }: AppProps) {
  const { theme, setTheme } = useTheme()
  const instances = useDesktopInstances()
  const wide = size !== '1x1'

  return (
    <div className="w-settings">
      <section className="w-settings-group" aria-label="appearance">
        <h2 className="w-settings-name">appearance</h2>
        <div className="w-settings-themes" role="radiogroup" aria-label="theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className="w-settings-theme"
              data-on={theme === t.id || undefined}
              onClick={() => setTheme(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
      {wide && (
        <section className="w-settings-group" aria-label="the desk">
          <h2 className="w-settings-name">desk</h2>
          <dl className="w-settings-facts">
            <div>
              <dt>widgets open</dt>
              <dd>{instances.length}</dd>
            </div>
            <div>
              <dt>grid</dt>
              <dd>6 × 4</dd>
            </div>
          </dl>
        </section>
      )}
      {wide && (
        <section className="w-settings-group" aria-label="keys">
          <h2 className="w-settings-name">keys</h2>
          <ul className="w-settings-keys">
            <li>⌘K — spotlight</li>
            <li>⌘M — minimize focused</li>
            <li>⌘↵ — fullscreen focused</li>
            <li>esc — leave fullscreen</li>
            <li>⌘. — summon the dock</li>
          </ul>
        </section>
      )}
    </div>
  )
}
